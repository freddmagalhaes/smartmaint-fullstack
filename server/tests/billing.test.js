const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setupDatabase, getApp, login, api, teardown, request } = require('./helpers');

let db;
let rootToken;

before(async () => {
  await setupDatabase();
  db = require('../db');
  rootToken = await login('root@test.com');
});

after(teardown);

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

describe('rotina de cobrança', () => {
  it('marca faturas vencidas e bloqueia cliente após a carência', async () => {
    const { runBillingCycle } = require('../utils/billing');
    await db.query("INSERT INTO invoices (tenant_id, valor, vencimento, status, mes_ref) VALUES ('acme', 100, ?, 'Pendente', '01/2026')", [daysAgo(30)]);
    await db.query("INSERT INTO invoices (tenant_id, valor, vencimento, status, mes_ref) VALUES ('globex', 100, ?, 'Pendente', '01/2026')", [daysAgo(2)]);

    await runBillingCycle();
    const [tenants] = await db.query('SELECT id, status FROM tenants ORDER BY id');
    assert.deepEqual(tenants.map((t) => [t.id, t.status]), [['acme', 'Inadimplente'], ['globex', 'Ativo']]);
    const [[late]] = await db.query("SELECT COUNT(*) AS n FROM invoices WHERE status = 'Atrasada'");
    assert.equal(late.n, 2);
  });
});

describe('webhook do Stripe', () => {
  const { stripe } = require('../utils/stripe');
  const send = (payload, signature) => request(getApp())
    .post('/api/billing/webhook')
    .set('Content-Type', 'application/json')
    .set('Stripe-Signature', signature)
    .send(payload);

  it('rejeita evento sem assinatura válida', async () => {
    const res = await send(JSON.stringify({ type: 'checkout.session.completed' }), 'invalida');
    assert.equal(res.status, 400);
  });

  it('pagamento confirmado baixa a fatura e reativa o cliente', async () => {
    const [[invoice]] = await db.query("SELECT id FROM invoices WHERE tenant_id = 'acme'");
    const payload = JSON.stringify({
      id: 'evt_test',
      object: 'event',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_1', payment_status: 'paid', metadata: { invoice_id: String(invoice.id), tenant_id: 'acme' } } },
    });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
    const res = await send(payload, signature);
    assert.equal(res.status, 200);

    const [[paid]] = await db.query('SELECT status, paid_at, stripe_session_id FROM invoices WHERE id = ?', [invoice.id]);
    assert.equal(paid.status, 'Paga');
    assert.ok(paid.paid_at);
    assert.equal(paid.stripe_session_id, 'cs_test_1');
    const [[tenant]] = await db.query("SELECT status FROM tenants WHERE id = 'acme'");
    assert.equal(tenant.status, 'Ativo');
  });

  it('baixa manual pelo backoffice aplica a mesma regra', async () => {
    await db.query("UPDATE tenants SET status = 'Inadimplente' WHERE id = 'globex'");
    const [[invoice]] = await db.query("SELECT id FROM invoices WHERE tenant_id = 'globex'");
    const res = await api(rootToken).put(`/api/admin/invoices/${invoice.id}/status`).send({ status: 'Paga' });
    assert.equal(res.status, 200);
    const [[tenant]] = await db.query("SELECT status FROM tenants WHERE id = 'globex'");
    assert.equal(tenant.status, 'Ativo');
  });

  it('cliente reativado volta a fazer login', async () => {
    assert.ok(await login('admin@acme.com'));
  });
});
