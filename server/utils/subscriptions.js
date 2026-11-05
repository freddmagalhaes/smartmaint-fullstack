// Sincroniza o estado das assinaturas do Stripe com o tenant. O Stripe é a fonte da verdade:
// o acesso do cliente só muda a partir de eventos assinados recebidos no webhook.
const { query } = require('./routeHelpers');
const { PLANS, PURCHASABLE_PLANS, CYCLES } = require('./plans');

// Status do Stripe -> status do tenant (null = não mexe no acesso)
//  - past_due: o Stripe ainda está tentando cobrar; mantém o acesso (carência) e a interface avisa.
//  - unpaid/paused: tentativas esgotadas -> bloqueia (o cliente regulariza pelo portal).
//  - incomplete*: primeira cobrança ainda não concluída -> não altera (continua em teste).
const TENANT_STATUS_BY_SUBSCRIPTION = {
  active: 'Ativo',
  trialing: 'Ativo',
  past_due: 'Ativo',
  unpaid: 'Inadimplente',
  paused: 'Inadimplente',
  canceled: 'Cancelado',
  incomplete: null,
  incomplete_expired: null,
};

// Status de assinatura "encerrados": uma assinatura nova pode substituí-los
const ADOPTABLE = ['canceled', 'incomplete', 'incomplete_expired'];

const tenantStatusFor = (subscriptionStatus) => TENANT_STATUS_BY_SUBSCRIPTION[subscriptionStatus] ?? null;

// A API do Stripe moveu current_period_end para os itens da assinatura; aceita os dois formatos
const periodEnd = (sub) => {
  const ts = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? null;
  return ts ? new Date(ts * 1000) : null;
};

const cycleOf = (sub) => {
  const interval = sub.items?.data?.[0]?.price?.recurring?.interval ?? sub.items?.data?.[0]?.plan?.interval;
  if (interval === 'year') return 'anual';
  if (interval === 'month') return 'mensal';
  return CYCLES.includes(sub.metadata?.cycle) ? sub.metadata.cycle : null;
};

// Valor mensal equivalente exibido no contrato (anual = total / 12)
const monthlyValue = (plan, cycle) => {
  const p = PLANS[plan]?.price;
  if (!p || !cycle) return null;
  return cycle === 'anual' ? Math.round(p.annual / 12) : p.monthly;
};

const idOf = (v) => (v && typeof v === 'object' ? v.id : v) || null;

// O cliente do Stripe de um tenant nunca pode ser adotado por outro (evita misturar cobranças entre empresas)
const customerBelongsToAnotherTenant = async (customer, tenantId) => {
  if (!customer) return false;
  const rows = await query('SELECT id FROM tenants WHERE stripe_customer_id = ? AND id <> ?', [customer, tenantId]);
  return rows.length > 0;
};

/**
 * Aplica uma assinatura do Stripe ao tenant. Retorna um texto explicando o resultado (útil em log/testes).
 * Ignora: sem tenant/tenant desconhecido, cliente do Stripe diferente do já vinculado, assinatura antiga
 * (quando já existe outra ativa) e eventos mais velhos que o último aplicado (o Stripe não garante a ordem).
 */
const syncSubscription = async (sub, eventCreated) => {
  const tenantId = sub.metadata?.tenant_id;
  if (!tenantId) return 'ignorado: assinatura sem tenant_id';
  const [tenant] = await query('SELECT * FROM tenants WHERE id = ?', [tenantId]);
  if (!tenant) return 'ignorado: tenant desconhecido';

  const customer = idOf(sub.customer);
  if (tenant.stripe_customer_id && customer && tenant.stripe_customer_id !== customer) {
    console.error(`[Stripe] Cliente divergente para o tenant ${tenantId}: esperado ${tenant.stripe_customer_id}, recebido ${customer}`);
    return 'ignorado: cliente do Stripe divergente';
  }
  if (await customerBelongsToAnotherTenant(customer, tenantId)) {
    console.error(`[Stripe] O cliente ${customer} já pertence a outro tenant; assinatura ${sub.id} ignorada.`);
    return 'ignorado: cliente pertence a outro tenant';
  }
  if (tenant.stripe_subscription_id && tenant.stripe_subscription_id !== sub.id && !ADOPTABLE.includes(tenant.subscription_status)) {
    return 'ignorado: existe outra assinatura ativa';
  }
  if (tenant.stripe_subscription_id === sub.id && tenant.subscription_event_at !== null && Number(tenant.subscription_event_at) > eventCreated) {
    return 'ignorado: evento antigo';
  }

  const plan = PURCHASABLE_PLANS.includes(sub.metadata?.plan) ? sub.metadata.plan : null;
  const cycle = cycleOf(sub);
  const end = periodEnd(sub);
  const newTenantStatus = tenantStatusFor(sub.status);

  await query(
    `UPDATE tenants SET
       stripe_customer_id = COALESCE(?, stripe_customer_id),
       stripe_subscription_id = ?,
       subscription_status = ?,
       billing_cycle = COALESCE(?, billing_cycle),
       current_period_end = COALESCE(?, current_period_end),
       cancel_at_period_end = ?,
       subscription_event_at = ?,
       plan_type = COALESCE(?, plan_type),
       valor_mensal = COALESCE(?, valor_mensal),
       contrato_fim = COALESCE(?, contrato_fim),
       renovacao_auto = ?,
       status = COALESCE(?, status)
     WHERE id = ?`,
    [
      customer, sub.id, sub.status, cycle, end, sub.cancel_at_period_end ? 1 : 0, eventCreated,
      plan, monthlyValue(plan, cycle), end, sub.cancel_at_period_end ? 0 : 1,
      newTenantStatus, tenantId,
    ]
  );
  return `aplicado: ${sub.status}`;
};

/** checkout.session.completed de uma assinatura: guarda cliente e assinatura (o status chega no evento da assinatura). */
const linkCheckoutSession = async (session) => {
  const tenantId = session.metadata?.tenant_id || session.client_reference_id;
  if (!tenantId) return 'ignorado: sessão sem tenant';
  const [tenant] = await query('SELECT stripe_customer_id, stripe_subscription_id, subscription_status FROM tenants WHERE id = ?', [tenantId]);
  if (!tenant) return 'ignorado: tenant desconhecido';
  const customer = idOf(session.customer);
  const subscription = idOf(session.subscription);
  if (tenant.stripe_customer_id && customer && tenant.stripe_customer_id !== customer) return 'ignorado: cliente do Stripe divergente';
  if (await customerBelongsToAnotherTenant(customer, tenantId)) return 'ignorado: cliente pertence a outro tenant';
  // Só troca a assinatura vinculada se a anterior já terminou (mesma regra do syncSubscription)
  const canReplace = !tenant.stripe_subscription_id || ADOPTABLE.includes(tenant.subscription_status) || tenant.stripe_subscription_id === subscription;
  await query(
    'UPDATE tenants SET stripe_customer_id = COALESCE(?, stripe_customer_id), stripe_subscription_id = ? WHERE id = ?',
    [customer, canReplace && subscription ? subscription : tenant.stripe_subscription_id, tenantId]
  );
  return 'vinculado';
};

// invoice.paid: espelha a cobrança na tabela de faturas (histórico/MRR do backoffice). Faturas de R$ 0 (início do teste) não entram.
const recordInvoicePaid = async (invoice) => {
  if (!invoice.amount_paid || invoice.amount_paid <= 0) return 'ignorado: fatura sem valor';
  const customer = idOf(invoice.customer);
  let tenantId = null;
  if (customer) {
    const [t] = await query('SELECT id FROM tenants WHERE stripe_customer_id = ?', [customer]);
    tenantId = t?.id || null;
  }
  // O vínculo do cliente pode ainda não ter sido gravado (ordem dos eventos): usa a metadata da assinatura
  tenantId = tenantId
    || invoice.parent?.subscription_details?.metadata?.tenant_id
    || invoice.subscription_details?.metadata?.tenant_id
    || invoice.lines?.data?.[0]?.metadata?.tenant_id
    || null;
  if (!tenantId) return 'ignorado: fatura sem tenant';
  const [tenant] = await query('SELECT id FROM tenants WHERE id = ?', [tenantId]);
  if (!tenant) return 'ignorado: tenant desconhecido';

  const paidAt = new Date((invoice.status_transitions?.paid_at || invoice.created) * 1000);
  const mesRef = `${String(paidAt.getMonth() + 1).padStart(2, '0')}/${paidAt.getFullYear()}`;
  await query(
    `INSERT INTO invoices (tenant_id, valor, vencimento, status, mes_ref, stripe_invoice_id)
     VALUES (?, ?, ?, 'Paga', ?, ?)
     ON DUPLICATE KEY UPDATE status = 'Paga'`,
    [tenantId, invoice.amount_paid / 100, paidAt, mesRef, invoice.id]
  );
  return 'registrada';
};

module.exports = { syncSubscription, linkCheckoutSession, recordInvoicePaid, tenantStatusFor, periodEnd, cycleOf, monthlyValue };
