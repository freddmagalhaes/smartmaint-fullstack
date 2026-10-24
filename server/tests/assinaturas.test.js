const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setupDatabase, getApp, login, api, teardown, request } = require('./helpers');

let db;
let adminAcme;
let adminGlobex;

// Chamadas ao Stripe substituídas por respostas fixas; `calls` guarda o que foi enviado
const { stripe } = require('../utils/stripe');
const calls = {};
const stub = (path, impl) => {
  const parts = path.split('.');
  const method = parts.pop();
  const target = parts.reduce((obj, key) => obj[key], stripe);
  target[method] = async (...args) => {
    (calls[path] ||= []).push(args);
    return impl(...args);
  };
};

const now = () => Math.floor(Date.now() / 1000);
let subscription;

const sendEvent = (type, object, id = `evt_${Math.random().toString(36).slice(2)}`) => {
  const payload = JSON.stringify({ id, object: 'event', type, data: { object } });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
  return request(getApp()).post('/api/billing/webhook').set('Content-Type', 'application/json').set('Stripe-Signature', signature).send(payload);
};

const tenant = async (id) => (await db.query('SELECT * FROM tenants WHERE id = ?', [id]))[0][0];

before(async () => {
  await setupDatabase();
  db = require('../db');
  adminAcme = await login('admin@acme.com');
  adminGlobex = await login('admin@globex.com');

  stub('customers.create', async () => ({ id: 'cus_acme' }));
  stub('products.create', async () => ({ id: 'prod_pro' }));
  stub('checkout.sessions.create', async () => ({ id: 'cs_1', url: 'https://checkout.stripe.test/cs_1' }));
  stub('subscriptions.retrieve', async () => subscription);
  stub('subscriptions.update', async (id, body) => ({ id, ...body }));
  stub('billingPortal.sessions.create', async () => ({ url: 'https://billing.stripe.test/portal' }));
});

after(teardown);

beforeEach(() => {
  for (const key of Object.keys(calls)) delete calls[key];
});

describe('assinatura no cartão com teste grátis', () => {
  it('mostra as opções disponíveis antes de assinar', async () => {
    const res = await api(adminAcme).get('/api/billing/subscription');
    assert.equal(res.status, 200);
    assert.equal(res.body.active, false);
    assert.equal(res.body.trial_available, true);
    assert.deepEqual(res.body.methods, ['card', 'boleto', 'pix']);
  });

  it('não assina plano sem preço definido', async () => {
    const res = await api(adminAcme).post('/api/billing/subscription').send({ method: 'card', plan_id: 'Pro' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /preço/);
  });

  it('Pix Automático fica indisponível até ser ligado na configuração', async () => {
    await db.query("UPDATE plans SET price_monthly = 199.90 WHERE id = 'Pro'");
    const res = await api(adminAcme).post('/api/billing/subscription').send({ method: 'pix_automatico', plan_id: 'Pro' });
    assert.equal(res.status, 400);
  });

  it('apenas administradores do cliente acessam a assinatura', async () => {
    const gerente = await login('gerente@acme.com');
    const res = await api(gerente).get('/api/billing/subscription');
    assert.equal(res.status, 403);
  });

  it('sem assinatura, o cliente não troca de plano sozinho', async () => {
    const res = await api(adminAcme).put('/api/billing/subscription/plan').send({ plan_id: 'Enterprise' });
    assert.equal(res.status, 400);
    assert.equal((await tenant('acme')).plan_type, 'Pro');
  });

  it('cartão abre o Checkout em modo assinatura com 30 dias grátis', async () => {
    const res = await api(adminAcme).post('/api/billing/subscription').send({ method: 'card', plan_id: 'Pro' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.url, 'https://checkout.stripe.test/cs_1');
    assert.equal(res.body.trial_days, 30);

    const [params] = calls['checkout.sessions.create'][0];
    assert.equal(params.mode, 'subscription');
    assert.equal(params.customer, 'cus_acme');
    assert.deepEqual(params.payment_method_types, ['card']);
    assert.equal(params.subscription_data.trial_period_days, 30);
    assert.deepEqual(params.subscription_data.metadata, { tenant_id: 'acme', plan_id: 'Pro', method: 'card' });
    assert.deepEqual(params.line_items[0].price_data, { currency: 'brl', product: 'prod_pro', unit_amount: 19990, recurring: { interval: 'month' } });

    assert.equal((await tenant('acme')).stripe_customer_id, 'cus_acme');
    const [[plan]] = await db.query("SELECT stripe_product_id FROM plans WHERE id = 'Pro'");
    assert.equal(plan.stripe_product_id, 'prod_pro');
  });

  it('checkout concluído coloca o cliente em teste', async () => {
    subscription = {
      id: 'sub_1', customer: 'cus_acme', status: 'trialing', trial_end: now() + 30 * 86400, cancel_at_period_end: false,
      metadata: { tenant_id: 'acme', plan_id: 'Pro', method: 'card' },
      items: { data: [{ id: 'si_1', current_period_end: now() + 30 * 86400 }] },
    };
    const res = await sendEvent('checkout.session.completed', { id: 'cs_1', mode: 'subscription', subscription: 'sub_1', client_reference_id: 'acme', metadata: { tenant_id: 'acme' } }, 'evt_sub_1');
    assert.equal(res.status, 200);

    const t = await tenant('acme');
    assert.equal(t.status, 'Trial');
    assert.equal(t.billing_method, 'card');
    assert.equal(t.stripe_subscription_id, 'sub_1');
    assert.equal(t.subscription_status, 'trialing');
    assert.equal(t.trial_used, 1);
    assert.ok(t.trial_ends_at);
    assert.ok(await login('admin@acme.com'), 'cliente em teste continua entrando');
  });

  it('evento repetido é ignorado', async () => {
    const res = await sendEvent('checkout.session.completed', { id: 'cs_1', mode: 'subscription', subscription: 'sub_1' }, 'evt_sub_1');
    assert.equal(res.body.duplicate, true);
    assert.equal(calls['subscriptions.retrieve'], undefined);
  });

  it('fatura de R$ 0,00 do período de teste não vira cobrança', async () => {
    await sendEvent('invoice.paid', { id: 'in_trial', customer: 'cus_acme', amount_due: 0, created: now() });
    const [[{ n }]] = await db.query("SELECT COUNT(*) AS n FROM invoices WHERE tenant_id = 'acme'");
    assert.equal(n, 0);
  });

  it('não permite assinar de novo', async () => {
    const res = await api(adminAcme).post('/api/billing/subscription').send({ method: 'boleto' });
    assert.equal(res.status, 409);
  });

  it('cobrança paga no fim do teste gera a fatura paga e ativa o cliente', async () => {
    const res = await sendEvent('invoice.paid', {
      id: 'in_1', customer: 'cus_acme', amount_due: 19990, created: now(), hosted_invoice_url: 'https://invoice.stripe.test/in_1',
      lines: { data: [{ period: { start: now() } }] },
    });
    assert.equal(res.status, 200);
    const [[invoice]] = await db.query("SELECT * FROM invoices WHERE stripe_invoice_id = 'in_1'");
    assert.equal(invoice.status, 'Paga');
    assert.equal(Number(invoice.valor), 199.9);
    assert.equal(invoice.payment_method, 'card');
    const [[nfse]] = await db.query('SELECT COUNT(*) AS n FROM nfse WHERE invoice_id = ?', [invoice.id]);
    assert.equal(nfse.n, 1, 'fatura paga entra na fila da NFS-e');

    subscription = { ...subscription, status: 'active', trial_end: subscription.trial_end };
    await sendEvent('customer.subscription.updated', { id: 'sub_1' });
    assert.equal((await tenant('acme')).status, 'Ativo');
  });

  it('cobrança recusada deixa a fatura em atraso, com link para pagar', async () => {
    await sendEvent('invoice.payment_failed', {
      id: 'in_2', customer: 'cus_acme', amount_due: 19990, created: now(), hosted_invoice_url: 'https://invoice.stripe.test/in_2',
    });
    const [[invoice]] = await db.query("SELECT * FROM invoices WHERE stripe_invoice_id = 'in_2'");
    assert.equal(invoice.status, 'Atrasada');

    const res = await api(adminAcme).post('/api/billing/checkout').send({ invoice_id: invoice.id });
    assert.equal(res.body.url, 'https://invoice.stripe.test/in_2');
    assert.equal(calls['checkout.sessions.create'], undefined);

    await sendEvent('invoice.paid', { id: 'in_2', customer: 'cus_acme', amount_due: 19990, created: now() });
    const [[paid]] = await db.query("SELECT status FROM invoices WHERE stripe_invoice_id = 'in_2'");
    assert.equal(paid.status, 'Paga');
  });

  it('troca de plano atualiza o Stripe com cobrança proporcional', async () => {
    await db.query("UPDATE plans SET price_monthly = 99.90 WHERE id = 'Starter'");
    const res = await api(adminAcme).put('/api/billing/subscription/plan').send({ plan_id: 'Starter' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const [id, body] = calls['subscriptions.update'][0];
    assert.equal(id, 'sub_1');
    assert.equal(body.proration_behavior, 'create_prorations');
    assert.equal(body.items[0].id, 'si_1');
    assert.equal(body.items[0].price_data.unit_amount, 9990);
    assert.equal((await tenant('acme')).plan_type, 'Starter');
  });

  it('não troca para um plano menor que o uso atual', async () => {
    await db.query("INSERT INTO plans (id, name, price_monthly, max_users) VALUES ('Mini', 'Mini', 49, 1)");
    const res = await api(adminAcme).put('/api/billing/subscription/plan').send({ plan_id: 'Mini' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /usuários/);
  });

  it('portal do Stripe para trocar o cartão', async () => {
    const res = await api(adminAcme).post('/api/billing/portal').send({});
    assert.equal(res.body.url, 'https://billing.stripe.test/portal');
  });

  it('cancelamento vale no fim do período pago', async () => {
    const res = await api(adminAcme).post('/api/billing/subscription/cancel').send({});
    assert.equal(res.status, 200);
    assert.deepEqual(calls['subscriptions.update'][0], ['sub_1', { cancel_at_period_end: true }]);
    assert.equal((await tenant('acme')).cancel_at_period_end, 1);
  });

  it('falha ao processar libera o evento para o Stripe reenviar', async () => {
    stub('subscriptions.retrieve', async () => { throw new Error('Stripe fora do ar'); });
    const first = await sendEvent('customer.subscription.deleted', { id: 'sub_1' }, 'evt_del');
    assert.equal(first.status, 500);

    subscription = { ...subscription, status: 'canceled' };
    stub('subscriptions.retrieve', async () => subscription);
    const retry = await sendEvent('customer.subscription.deleted', { id: 'sub_1' }, 'evt_del');
    assert.equal(retry.status, 200);
    assert.notEqual(retry.body.duplicate, true);

    const t = await tenant('acme');
    assert.equal(t.status, 'Cancelado');
    assert.equal(t.billing_method, null);
  });

  it('não oferece um segundo teste grátis', async () => {
    await db.query("UPDATE tenants SET status = 'Ativo' WHERE id = 'acme'");
    const res = await api(adminAcme).post('/api/billing/subscription').send({ method: 'card', plan_id: 'Pro' });
    assert.equal(res.status, 201);
    assert.equal(res.body.trial_days, 0);
    assert.equal(calls['checkout.sessions.create'][0][0].subscription_data.trial_period_days, undefined);
  });
});

describe('assinatura no boleto ou Pix', () => {
  it('gera a primeira fatura na hora, paga só com o meio escolhido', async () => {
    const res = await api(adminGlobex).post('/api/billing/subscription').send({ method: 'boleto', plan_id: 'Pro' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const [[invoice]] = await db.query('SELECT * FROM invoices WHERE id = ?', [res.body.invoice_id]);
    assert.equal(invoice.status, 'Pendente');
    assert.equal(invoice.payment_method, 'boleto');
    assert.equal(Number(invoice.valor), 199.9);
    assert.match(invoice.period, /^\d{4}-\d{2}$/);
    assert.equal(calls['checkout.sessions.create'], undefined, 'boleto não tem teste grátis nem Checkout de assinatura');

    const pay = await api(adminGlobex).post('/api/billing/checkout').send({ invoice_id: invoice.id });
    assert.equal(pay.status, 200);
    const [params] = calls['checkout.sessions.create'][0];
    assert.equal(params.mode, 'payment');
    assert.deepEqual(params.payment_method_types, ['boleto']);

    const sub = await api(adminGlobex).get('/api/billing/subscription');
    assert.equal(sub.body.active, true);
    assert.equal(sub.body.billing_method, 'boleto');
  });

  it('gera a fatura do mês antes do vencimento, uma única vez', async () => {
    const { generateManualInvoices } = require('../utils/subscriptions');
    await db.query("UPDATE tenants SET billing_day = 15 WHERE id = 'globex'");

    assert.equal(await generateManualInvoices(new Date('2031-05-04T15:00:00Z')), 0, 'antes da janela');
    assert.equal(await generateManualInvoices(new Date('2031-05-07T15:00:00Z')), 1);
    assert.equal(await generateManualInvoices(new Date('2031-05-08T15:00:00Z')), 0, 'não duplica');

    const [[invoice]] = await db.query("SELECT * FROM invoices WHERE tenant_id = 'globex' AND period = '2031-05'");
    assert.equal(invoice.vencimento, '2031-05-15');
    assert.equal(invoice.mes_ref, '05/2031');
    assert.equal(invoice.payment_method, 'boleto');
  });

  it('troca de plano no boleto vale a partir da próxima fatura', async () => {
    const res = await api(adminGlobex).put('/api/billing/subscription/plan').send({ plan_id: 'Starter' });
    assert.equal(res.status, 200);
    assert.equal(calls['subscriptions.update'], undefined);
    const { generateManualInvoices } = require('../utils/subscriptions');
    await generateManualInvoices(new Date('2031-06-06T15:00:00Z'));
    const [[invoice]] = await db.query("SELECT valor FROM invoices WHERE tenant_id = 'globex' AND period = '2031-06'");
    assert.equal(Number(invoice.valor), 99.9);
  });

  it('cancelar para de gerar faturas', async () => {
    const res = await api(adminGlobex).post('/api/billing/subscription/cancel').send({});
    assert.equal(res.status, 200);
    const { generateManualInvoices } = require('../utils/subscriptions');
    assert.equal(await generateManualInvoices(new Date('2031-07-06T15:00:00Z')), 0);
  });
});
