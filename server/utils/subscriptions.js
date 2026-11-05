const db = require('../db');
const { config } = require('../config');
const { HttpError } = require('./errorHandler');
const { stripe } = require('./stripe');
const { markInvoicePaid } = require('./billing');
const { getUsage } = require('./plans');
const notifications = require('./notifications');
const logger = require('./logger');

/**
 * Assinatura mensal do SmartMaint.
 *
 * - card e pix_automatico: o Stripe mantém a assinatura e cobra sozinho todo mês. Cada cobrança
 *   chega pelo webhook e vira uma fatura local (histórico, NFS-e e bloqueio por atraso).
 * - boleto e pix: o SmartMaint gera a fatura do mês (runBillingCycle) e o cliente paga pelo
 *   Checkout do Stripe com o meio escolhido.
 *
 * O teste grátis só existe onde há cobrança automática ao final (cartão e Pix Automático).
 */
const AUTOMATIC = ['card', 'pix_automatico'];
const MANUAL = ['boleto', 'pix'];

const availableMethods = () => ['card', 'boleto', 'pix', ...(config.stripe.pixAutomatico ? ['pix_automatico'] : [])];

const query = async (sql, params) => (await db.query(sql, params))[0];

// Datas no fuso de Brasília (vencimentos e mês de referência)
const brDate = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(date);
const fromUnix = (seconds) => (seconds ? new Date(seconds * 1000) : null);
const addDays = (isoDate, days) => {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const mesRef = (period) => `${period.slice(5, 7)}/${period.slice(0, 4)}`;

const requireStripe = () => {
  if (!stripe) throw new HttpError(503, 'Pagamento online indisponível no momento. Entre em contato com o suporte.');
};

const getTenant = async (tenantId) => {
  const [tenant] = await query('SELECT * FROM tenants WHERE id = ?', [tenantId]);
  if (!tenant) throw new HttpError(404, 'Cliente não encontrado');
  return tenant;
};

const getPlan = async (planId) => {
  const [plan] = await query('SELECT * FROM plans WHERE id = ? AND active = TRUE', [planId]);
  if (!plan) throw new HttpError(400, 'Plano não encontrado');
  return plan;
};

/** Valor mensal: o negociado no contrato do cliente (valor_mensal) ou o preço do plano. */
const monthlyAmount = (tenant, plan) => {
  const amount = Number(tenant.valor_mensal) > 0 ? Number(tenant.valor_mensal) : Number(plan.price_monthly);
  if (!(amount > 0)) throw new HttpError(400, `O plano ${plan.name} ainda não tem preço definido. Entre em contato com o suporte.`);
  return amount;
};

const hasLiveSubscription = (tenant) => Boolean(
  (tenant.stripe_subscription_id && !['canceled', 'incomplete_expired'].includes(tenant.subscription_status))
  || MANUAL.includes(tenant.billing_method)
);

/** Resumo da assinatura para a tela de faturamento. */
const getSubscription = async (tenantId) => {
  const tenant = await getTenant(tenantId);
  const [plan] = await query('SELECT * FROM plans WHERE id = ?', [tenant.plan_type]);
  return {
    plan_id: tenant.plan_type,
    plan_name: plan?.name || tenant.plan_type,
    amount: plan ? (Number(tenant.valor_mensal) > 0 ? Number(tenant.valor_mensal) : Number(plan.price_monthly)) : null,
    billing_method: tenant.billing_method,
    subscription_status: tenant.subscription_status,
    active: hasLiveSubscription(tenant),
    trial_ends_at: tenant.trial_ends_at,
    current_period_end: tenant.current_period_end,
    cancel_at_period_end: Boolean(tenant.cancel_at_period_end),
    trial_available: !tenant.trial_used,
    trial_days: plan?.trial_days ?? 30,
    methods: availableMethods(),
    online_payments: Boolean(stripe),
  };
};

/** Cliente no Stripe (criado na primeira assinatura, com os dados cadastrais da empresa). */
const ensureCustomer = async (tenant) => {
  if (tenant.stripe_customer_id) return tenant.stripe_customer_id;
  const address = tenant.logradouro ? {
    line1: [tenant.logradouro, tenant.numero].filter(Boolean).join(', '),
    line2: [tenant.complemento, tenant.bairro].filter(Boolean).join(' - ') || undefined,
    city: tenant.cidade || undefined,
    state: tenant.uf || undefined,
    postal_code: tenant.cep || undefined,
    country: 'BR',
  } : undefined;
  const customer = await stripe.customers.create({
    name: tenant.razao_social || tenant.name,
    email: tenant.email_financeiro || tenant.contact_email || undefined,
    address,
    metadata: { tenant_id: tenant.id },
  }, { idempotencyKey: `customer-${tenant.id}` });
  await query('UPDATE tenants SET stripe_customer_id = ? WHERE id = ? AND stripe_customer_id IS NULL', [customer.id, tenant.id]);
  return customer.id;
};

/** Produto do plano no Stripe (criado na primeira vez que alguém assina o plano). */
const ensureProduct = async (plan) => {
  if (plan.stripe_product_id) return plan.stripe_product_id;
  const product = await stripe.products.create(
    { name: `SmartMaint ${plan.name}`, metadata: { plan_id: plan.id } },
    { idempotencyKey: `product-${plan.id}` }
  );
  await query('UPDATE plans SET stripe_product_id = ? WHERE id = ? AND stripe_product_id IS NULL', [product.id, plan.id]);
  return product.id;
};

const monthlyPrice = (productId, amount) => ({
  currency: 'brl',
  product: productId,
  unit_amount: Math.round(amount * 100), // Stripe usa centavos
  recurring: { interval: 'month' },
});

/** Não deixa trocar para um plano menor que o uso atual (usuários, equipamentos, unidades). */
const assertFitsPlan = async (tenantId, plan) => {
  const { usage } = await getUsage(tenantId);
  const over = [['users', 'max_users', 'usuários'], ['equipments', 'max_equipments', 'equipamentos'], ['units', 'max_units', 'unidades']]
    .filter(([key, column]) => plan[column] !== null && usage[key].used > plan[column]);
  if (over.length) {
    const [key, column, label] = over[0];
    throw new HttpError(400, `O plano ${plan.name} permite até ${plan[column]} ${label} e você tem ${usage[key].used}. Remova o excedente antes de trocar.`);
  }
};

/** Cria a fatura de boleto/Pix do mês (idempotente: uma por cliente e mês). */
const createManualInvoice = async (tenant, plan, period, dueDate) => {
  const result = await query(
    `INSERT IGNORE INTO invoices (tenant_id, valor, vencimento, status, mes_ref, period, payment_method)
     VALUES (?, ?, ?, 'Pendente', ?, ?, ?)`,
    [tenant.id, monthlyAmount(tenant, plan), dueDate, mesRef(period), period, tenant.billing_method]
  );
  return result.affectedRows ? result.insertId : null;
};

/**
 * Inicia a assinatura. Cartão e Pix Automático devolvem a URL do Checkout do Stripe (onde o
 * cliente cadastra o meio de pagamento); boleto e Pix geram a primeira fatura na hora.
 */
const startSubscription = async (tenantId, { method, planId }) => {
  if (!availableMethods().includes(method)) throw new HttpError(400, 'Forma de pagamento indisponível');
  requireStripe();
  const tenant = await getTenant(tenantId);
  if (hasLiveSubscription(tenant)) throw new HttpError(409, 'Este cliente já tem uma assinatura ativa. Use a troca de plano ou de forma de pagamento.');
  const plan = await getPlan(planId || tenant.plan_type);
  await assertFitsPlan(tenantId, plan);
  const amount = monthlyAmount(tenant, plan);

  if (MANUAL.includes(method)) {
    const today = brDate(new Date());
    const billingDay = Math.min(Number(today.slice(8, 10)), 28);
    await query(
      `UPDATE tenants SET billing_method = ?, billing_day = ?, plan_type = ?, subscription_status = 'active',
         stripe_subscription_id = NULL, trial_ends_at = NULL, current_period_end = NULL, cancel_at_period_end = FALSE WHERE id = ?`,
      [method, billingDay, plan.id, tenantId]
    );
    const invoiceId = await createManualInvoice({ ...tenant, billing_method: method }, plan, today.slice(0, 7), addDays(today, config.billing.firstInvoiceDueDays));
    return { invoice_id: invoiceId };
  }

  const customer = await ensureCustomer(tenant);
  const product = await ensureProduct(plan);
  const trialDays = !tenant.trial_used && plan.trial_days > 0 ? plan.trial_days : 0;
  const metadata = { tenant_id: tenantId, plan_id: plan.id, method };
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer,
    payment_method_types: [method === 'card' ? 'card' : 'pix'],
    line_items: [{ price_data: monthlyPrice(product, amount), quantity: 1 }],
    subscription_data: { metadata, ...(trialDays && { trial_period_days: trialDays }) },
    metadata,
    client_reference_id: tenantId,
    locale: 'pt-BR',
    success_url: `${config.frontendUrl}/settings?tab=billing&subscribed=true`,
    cancel_url: `${config.frontendUrl}/settings?tab=billing&canceled=true`,
  });
  return { url: session.url, trial_days: trialDays };
};

/** Troca de plano. No Stripe a diferença do mês é cobrada ou creditada proporcionalmente. */
const changePlan = async (tenantId, planId) => {
  const tenant = await getTenant(tenantId);
  // Sem assinatura, o plano é definido pelo backoffice (contrato) ou ao assinar
  if (!hasLiveSubscription(tenant)) throw new HttpError(400, 'Assine um plano antes de trocar');
  const plan = await getPlan(planId);
  if (plan.id === tenant.plan_type) throw new HttpError(400, 'O cliente já está neste plano');
  await assertFitsPlan(tenantId, plan);
  const amount = monthlyAmount(tenant, plan);

  if (AUTOMATIC.includes(tenant.billing_method) && tenant.stripe_subscription_id) {
    requireStripe();
    const subscription = await stripe.subscriptions.retrieve(tenant.stripe_subscription_id);
    await stripe.subscriptions.update(tenant.stripe_subscription_id, {
      items: [{ id: subscription.items.data[0].id, price_data: monthlyPrice(await ensureProduct(plan), amount) }],
      proration_behavior: 'create_prorations',
      metadata: { ...subscription.metadata, plan_id: plan.id },
    });
  }
  // Boleto/Pix: o novo valor vale a partir da próxima fatura
  await query('UPDATE tenants SET plan_type = ? WHERE id = ?', [plan.id, tenantId]);
  return { plan_id: plan.id, amount };
};

/** Cancela no fim do período pago (cartão/Pix Automático) ou para de gerar faturas (boleto/Pix). */
const cancelSubscription = async (tenantId) => {
  const tenant = await getTenant(tenantId);
  if (!hasLiveSubscription(tenant)) throw new HttpError(400, 'Não há assinatura ativa');
  if (tenant.stripe_subscription_id && AUTOMATIC.includes(tenant.billing_method)) {
    requireStripe();
    await stripe.subscriptions.update(tenant.stripe_subscription_id, { cancel_at_period_end: true });
    await query('UPDATE tenants SET cancel_at_period_end = TRUE WHERE id = ?', [tenantId]);
    return { ends_at: tenant.current_period_end };
  }
  await query("UPDATE tenants SET billing_method = NULL, subscription_status = 'canceled' WHERE id = ?", [tenantId]);
  return { ends_at: null };
};

/** Portal do Stripe: trocar cartão, baixar recibos e cancelar. */
const createPortalSession = async (tenantId) => {
  requireStripe();
  const tenant = await getTenant(tenantId);
  if (!tenant.stripe_customer_id) throw new HttpError(400, 'Este cliente ainda não tem pagamento cadastrado no Stripe');
  const session = await stripe.billingPortal.sessions.create({
    customer: tenant.stripe_customer_id,
    return_url: `${config.frontendUrl}/settings?tab=billing`,
  });
  return { url: session.url };
};

// --- Sincronização com o Stripe (webhook) ---

const tenantForStripe = async ({ tenantId, customerId }) => {
  if (tenantId) {
    const [t] = await query('SELECT * FROM tenants WHERE id = ?', [tenantId]);
    if (t) return t;
  }
  if (customerId) {
    const [t] = await query('SELECT * FROM tenants WHERE stripe_customer_id = ?', [customerId]);
    if (t) return t;
  }
  return null;
};

/**
 * Atualiza o cliente com o estado atual da assinatura. Sempre consulta o Stripe em vez de usar
 * o conteúdo do evento: eventos podem chegar fora de ordem.
 */
const syncSubscription = async (subscriptionId, hintTenantId) => {
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
  const tenant = await tenantForStripe({ tenantId: sub.metadata?.tenant_id || hintTenantId, customerId });
  if (!tenant) {
    logger.warn({ subscriptionId }, 'assinatura do Stripe sem cliente correspondente');
    return null;
  }
  const ended = ['canceled', 'incomplete_expired'].includes(sub.status);
  // Uma assinatura antiga encerrada não sobrescreve a atual (nem a troca para boleto/Pix)
  if (ended && tenant.stripe_subscription_id !== sub.id) return tenant.id;
  // Nas versões novas da API o período fica no item da assinatura
  const periodEnd = sub.items?.data?.[0]?.current_period_end ?? sub.current_period_end;
  await db.transaction(async (q) => {
    await q(
      `UPDATE tenants SET stripe_customer_id = COALESCE(stripe_customer_id, ?), stripe_subscription_id = ?, subscription_status = ?,
         billing_method = ?, plan_type = COALESCE(?, plan_type), trial_ends_at = ?, current_period_end = ?,
         cancel_at_period_end = ?, trial_used = (trial_used OR ?)
       WHERE id = ?`,
      [
        customerId, sub.id, sub.status,
        ended ? null : (sub.metadata?.method || tenant.billing_method || 'card'), sub.metadata?.plan_id || null,
        fromUnix(sub.trial_end), fromUnix(periodEnd), Boolean(sub.cancel_at_period_end), Boolean(sub.trial_end), tenant.id,
      ]
    );
    if (sub.status === 'trialing') {
      await q("UPDATE tenants SET status = 'Trial' WHERE id = ? AND status IN ('Ativo', 'Trial', 'Cancelado', 'Pendente')", [tenant.id]);
    } else if (sub.status === 'active') {
      await q("UPDATE tenants SET status = 'Ativo' WHERE id = ? AND status IN ('Trial', 'Cancelado', 'Pendente')", [tenant.id]);
    } else if (ended) {
      // Encerrada com faturas em atraso: a rotina de cobrança cuida do bloqueio (Inadimplente)
      const [{ overdue }] = await q("SELECT COUNT(*) AS overdue FROM invoices WHERE tenant_id = ? AND status = 'Atrasada'", [tenant.id]);
      if (Number(overdue) === 0) await q("UPDATE tenants SET status = 'Cancelado' WHERE id = ? AND status IN ('Ativo', 'Trial')", [tenant.id]);
    }
  });
  return tenant.id;
};

/** Cria (ou atualiza) a fatura local correspondente a uma cobrança da assinatura no Stripe. */
const upsertStripeInvoice = async (stripeInvoice) => {
  const amount = (stripeInvoice.amount_due ?? stripeInvoice.total ?? 0) / 100;
  if (!(amount > 0)) return null; // período de teste (R$ 0,00) não vira fatura
  const customerId = typeof stripeInvoice.customer === 'string' ? stripeInvoice.customer : stripeInvoice.customer?.id;
  const tenant = await tenantForStripe({ tenantId: stripeInvoice.metadata?.tenant_id, customerId });
  if (!tenant) {
    logger.warn({ invoice: stripeInvoice.id }, 'fatura do Stripe sem cliente correspondente');
    return null;
  }
  const servicePeriod = stripeInvoice.lines?.data?.[0]?.period?.start ?? stripeInvoice.created;
  const due = brDate(fromUnix(stripeInvoice.due_date || stripeInvoice.created) || new Date());
  await query(
    `INSERT INTO invoices (tenant_id, valor, vencimento, status, mes_ref, stripe_invoice_id, payment_method, payment_url)
     VALUES (?, ?, ?, 'Pendente', ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE payment_url = COALESCE(VALUES(payment_url), payment_url)`,
    [tenant.id, amount, due, mesRef(brDate(fromUnix(servicePeriod)).slice(0, 7)), stripeInvoice.id, tenant.billing_method, stripeInvoice.hosted_invoice_url || null]
  );
  const [row] = await query('SELECT * FROM invoices WHERE stripe_invoice_id = ?', [stripeInvoice.id]);
  return row;
};

const object = (event) => event.data.object;

/** Trata um evento do Stripe já autenticado. Todos os passos podem ser repetidos sem efeito duplicado. */
const handleStripeEvent = async (event) => {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = object(event);
      if (session.mode === 'subscription') {
        if (session.subscription) await syncSubscription(session.subscription, session.metadata?.tenant_id || session.client_reference_id);
        return;
      }
      // Fatura de boleto/Pix paga pelo Checkout (boleto confirma depois: async_payment_succeeded)
      const paid = event.type === 'checkout.session.async_payment_succeeded' || session.payment_status === 'paid';
      const invoiceId = Number(session.metadata?.invoice_id || session.client_reference_id);
      if (paid && invoiceId) await markInvoicePaid(invoiceId, session.id);
      return;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await syncSubscription(object(event).id);
      return;
    case 'customer.subscription.trial_will_end': {
      const tenantId = await syncSubscription(object(event).id);
      if (tenantId) await notifications.trialEnding(tenantId, object(event));
      return;
    }
    case 'invoice.paid': {
      const invoice = await upsertStripeInvoice(object(event));
      if (invoice) await markInvoicePaid(invoice.id, null);
      return;
    }
    case 'invoice.payment_failed': {
      const invoice = await upsertStripeInvoice(object(event));
      if (!invoice) return;
      // Cobrança recusada: o Stripe tenta de novo nos próximos dias; até lá a fatura fica em atraso
      await query("UPDATE invoices SET status = 'Atrasada' WHERE id = ? AND status <> 'Paga'", [invoice.id]);
      await notifications.invoiceReminder(invoice.tenant_id, invoice, 'late');
      return;
    }
    default:
  }
};

/**
 * Boleto e Pix: gera a fatura do mês BILLING_INVOICE_LEAD_DAYS antes do vencimento (dia de
 * cobrança do cliente). Idempotente: a chave (cliente, mês) impede faturas duplicadas.
 */
const generateManualInvoices = async (now = new Date()) => {
  const today = brDate(now);
  const tenants = await query(
    `SELECT t.*, p.price_monthly, p.name AS plan_name FROM tenants t JOIN plans p ON p.id = t.plan_type
     WHERE t.billing_method IN ('boleto', 'pix') AND t.status <> 'Cancelado'`
  );
  let created = 0;
  for (const tenant of tenants) {
    const thisMonth = today.slice(0, 7);
    const next = new Date(`${thisMonth}-01T12:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    for (const period of [thisMonth, next.toISOString().slice(0, 7)]) {
      const due = `${period}-${String(tenant.billing_day || 10).padStart(2, '0')}`;
      // Só a fatura cuja janela de geração já abriu e cujo vencimento ainda não passou
      if (today < addDays(due, -config.billing.invoiceLeadDays) || today > due) continue;
      try {
        if (await createManualInvoice(tenant, { name: tenant.plan_name, price_monthly: tenant.price_monthly }, period, due)) created += 1;
      } catch (err) {
        logger.error({ err, tenantId: tenant.id }, 'falha ao gerar fatura mensal');
      }
    }
  }
  return created;
};

module.exports = {
  AUTOMATIC, MANUAL, availableMethods, getSubscription, startSubscription, changePlan, cancelSubscription,
  createPortalSession, syncSubscription, upsertStripeInvoice, handleStripeEvent, generateManualInvoices,
};
