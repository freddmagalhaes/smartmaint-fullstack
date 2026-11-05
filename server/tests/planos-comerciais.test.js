const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setupDatabase, getApp, login, api, teardown, request } = require('./helpers');

let db;
const tokens = {};

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

const sendEvent = (type, object) => {
  const payload = JSON.stringify({ id: `evt_${Math.random().toString(36).slice(2)}`, object: 'event', type, data: { object } });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
  return request(getApp()).post('/api/billing/webhook').set('Content-Type', 'application/json').set('Stripe-Signature', signature).send(payload);
};

const tenant = async (id) => (await db.query('SELECT * FROM tenants WHERE id = ?', [id]))[0][0];
const plan = async (id) => (await db.query('SELECT * FROM plans WHERE id = ?', [id]))[0][0];
const q = async (sql, params) => (await db.query(sql, params))[0];

before(async () => {
  await setupDatabase();
  db = require('../db');
  for (const [key, email] of [['root', 'root@test.com'], ['admin', 'admin@acme.com'], ['gerente', 'gerente@acme.com'], ['user', 'user@acme.com'], ['globex', 'admin@globex.com']]) {
    tokens[key] = await login(email);
  }
  stub('customers.create', async () => ({ id: 'cus_acme' }));
  stub('products.create', async () => ({ id: 'prod_pro' }));
  stub('checkout.sessions.create', async () => ({ id: 'cs_1', url: 'https://checkout.stripe.test/cs_1' }));
  stub('subscriptions.retrieve', async () => subscription);
  stub('subscriptions.update', async (id, body) => ({ id, ...body }));
});

after(teardown);

beforeEach(() => {
  for (const key of Object.keys(calls)) delete calls[key];
});

// ---------------------------------------------------------------------------------------------
describe('planos comerciais (migration 010)', () => {
  it('semeia Essencial, Profissional, Industrial e Corporativo com a tabela aprovada', async () => {
    const rows = await q("SELECT * FROM plans ORDER BY sort_order");
    const shape = rows.map((p) => ({
      id: p.id, name: p.name, monthly: Number(p.price_monthly), annual: p.price_annual === null ? null : Number(p.price_annual),
      users: p.max_users, equipments: p.max_equipments, units: p.max_units, trial: p.trial_days,
      fmea: Boolean(p.has_fmea), simulator: Boolean(p.has_simulator), import: Boolean(p.has_import),
    }));
    assert.deepEqual(shape, [
      { id: 'Starter', name: 'Essencial', monthly: 297, annual: 2964, users: 3, equipments: 50, units: 1, trial: 14, fmea: false, simulator: false, import: false },
      { id: 'Pro', name: 'Profissional', monthly: 697, annual: 6972, users: 10, equipments: 300, units: 1, trial: 14, fmea: true, simulator: true, import: true },
      { id: 'Industrial', name: 'Industrial', monthly: 1697, annual: 16968, users: 30, equipments: 1000, units: 3, trial: 14, fmea: true, simulator: true, import: true },
      { id: 'Enterprise', name: 'Corporativo', monthly: 0, annual: null, users: null, equipments: null, units: null, trial: 30, fmea: true, simulator: true, import: true },
    ]);
  });

  it('o preço anual é divisível por 12 e fica a menos de R$ 1 de "10/12 do mensal" (2 meses grátis)', async () => {
    for (const id of ['Starter', 'Pro', 'Industrial']) {
      const p = await plan(id);
      assert.equal(Number(p.price_annual) % 12, 0, `${id}: total anual divisível por 12`);
      assert.ok(Math.abs(Number(p.price_annual) / 12 - (Number(p.price_monthly) * 10) / 12) < 1, id);
    }
  });

  it('o plano padrão de cliente novo existe (senão o cliente ficaria sem nenhum limite)', async () => {
    const [{ d }] = await q("SELECT COLUMN_DEFAULT AS d FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tenants' AND COLUMN_NAME = 'plan_type'");
    assert.ok(await plan(d), `plano padrão "${d}" não existe em plans`);
  });

  describe('reexecução', () => {
    // Mesmos helpers que o executor de migrations passa para `up`
    const helpers = {
      addColumn: async (table, column, definition) => {
        const rows = await q('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?', [table, column]);
        if (rows.length === 0) await q(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
      },
    };
    const up = () => require('../migrations/010_planos_comerciais').up(q, helpers);

    it('é idempotente e não duplica o plano Industrial', async () => {
      await up();
      await up();
      assert.equal((await q("SELECT COUNT(*) AS n FROM plans WHERE id = 'Industrial'"))[0].n, 1);
      assert.equal((await plan('Pro')).name, 'Profissional');
    });

    it('transforma os planos semeados se ainda estiverem como foram criados', async () => {
      await q("UPDATE plans SET name = 'Starter', price_monthly = 0, price_annual = NULL, max_users = 5, max_equipments = 50, max_units = 1, trial_days = 30, has_fmea = TRUE, has_simulator = TRUE, has_import = TRUE WHERE id = 'Starter'");
      await up();
      const p = await plan('Starter');
      assert.equal(p.name, 'Essencial');
      assert.equal(Number(p.price_monthly), 297);
      assert.equal(p.has_fmea, 0);
    });

    it('NÃO sobrescreve um plano que o Root já editou no Backoffice', async () => {
      await q("UPDATE plans SET name = 'Starter', price_monthly = 150, max_users = 5, max_equipments = 50, max_units = 1 WHERE id = 'Starter'");
      await q("UPDATE plans SET price_monthly = 999, max_users = 77 WHERE id = 'Pro'");
      await up();
      const starter = await plan('Starter');
      assert.equal(starter.name, 'Starter');
      assert.equal(Number(starter.price_monthly), 150);
      const pro = await plan('Pro');
      assert.equal(Number(pro.price_monthly), 999);
      assert.equal(pro.max_users, 77);
      // restaura a tabela comercial para os testes seguintes
      await q("UPDATE plans SET name = 'Essencial', price_monthly = 297, price_annual = 2964, max_users = 3, has_fmea = FALSE, has_simulator = FALSE, has_import = FALSE WHERE id = 'Starter'");
      await q("UPDATE plans SET price_monthly = 697, max_users = 10 WHERE id = 'Pro'");
    });
  });
});

// ---------------------------------------------------------------------------------------------
describe('recursos por plano', () => {
  const setPlan = (tenantId, planId) => q('UPDATE tenants SET plan_type = ? WHERE id = ?', [planId, tenantId]);
  const fmea = (token, tenantQuery = '') => api(token).get(`/api/fmea${tenantQuery}`);

  before(() => setPlan('globex', 'Starter'));

  it('plano Profissional (padrão) usa FMEA e importação', async () => {
    assert.equal((await fmea(tokens.admin)).status, 200);
    const imp = await api(tokens.admin).post('/api/equipments/import').send({ dry_run: true, rows: [{ name: 'X' }] });
    assert.equal(imp.status, 200, JSON.stringify(imp.body));
  });

  it('plano Essencial bloqueia FMEA (listar, criar, alterar, excluir) com PLAN_FEATURE', async () => {
    for (const [method, url] of [['get', '/api/fmea'], ['post', '/api/fmea'], ['put', '/api/fmea/1'], ['delete', '/api/fmea/1']]) {
      const res = await api(tokens.globex)[method](url).send({});
      assert.equal(res.status, 403, `${method} ${url}`);
      assert.equal(res.body.code, 'PLAN_FEATURE');
      assert.match(res.body.error, /Essencial/);
    }
  });

  it('plano Essencial bloqueia a importação por planilha e nada é gravado', async () => {
    const antes = (await q("SELECT COUNT(*) AS n FROM equipments WHERE tenant_id = 'globex'"))[0].n;
    const res = await api(tokens.globex).post('/api/equipments/import').send({ rows: [{ name: 'Importado' }] });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'PLAN_FEATURE');
    assert.equal((await q("SELECT COUNT(*) AS n FROM equipments WHERE tenant_id = 'globex'"))[0].n, antes);
  });

  it('o bloqueio vale para o backoffice agindo sobre o cliente (?tenant_id)', async () => {
    const res = await fmea(tokens.root, '?tenant_id=globex');
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'PLAN_FEATURE');
  });

  it('Industrial e Corporativo usam FMEA e importação', async () => {
    for (const planId of ['Industrial', 'Enterprise']) {
      await setPlan('globex', planId);
      assert.equal((await fmea(tokens.globex)).status, 200, planId);
      assert.equal((await api(tokens.globex).post('/api/equipments/import').send({ dry_run: true, rows: [{ name: 'X' }] })).status, 200, planId);
    }
  });

  it('cliente com plano desconhecido não é bloqueado (nunca trava clientes antigos)', async () => {
    await setPlan('globex', 'PlanoAntigoSumido');
    assert.equal((await fmea(tokens.globex)).status, 200);
  });

  it('Root liga e desliga recursos de um plano e o servidor obedece na hora', async () => {
    assert.equal((await api(tokens.root).put('/api/admin/plans/Pro').send({ has_fmea: false })).status, 200);
    assert.equal((await fmea(tokens.admin)).body.code, 'PLAN_FEATURE');
    assert.equal((await api(tokens.root).put('/api/admin/plans/Pro').send({ has_fmea: true })).status, 200);
    assert.equal((await fmea(tokens.admin)).status, 200);
  });

  it('administrador de cliente não edita planos, preço anual nem recursos', async () => {
    const res = await api(tokens.admin).put('/api/admin/plans/Pro').send({ price_annual: 1, has_fmea: false });
    assert.equal(res.status, 403);
    assert.equal(Number((await plan('Pro')).price_annual), 6972);
  });

  it('Root valida o preço anual (negativo recusado; vazio = sem cobrança anual)', async () => {
    const ruim = await api(tokens.root).put('/api/admin/plans/Industrial').send({ price_annual: -5 });
    assert.ok(ruim.status >= 400 && ruim.status < 500, `status ${ruim.status}`);
    assert.equal(Number((await plan('Industrial')).price_annual), 16968);
    assert.equal((await api(tokens.root).put('/api/admin/plans/Industrial').send({ price_annual: null })).status, 200);
    assert.equal((await plan('Industrial')).price_annual, null);
    assert.equal((await api(tokens.root).put('/api/admin/plans/Industrial').send({ price_annual: 16968 })).status, 200);
  });

  describe('GET /api/plan/features', () => {
    it('exige login', async () => {
      assert.equal((await request(getApp()).get('/api/plan/features')).status, 401);
    });

    it('todos os perfis do cliente consultam os recursos do plano', async () => {
      await setPlan('globex', 'Starter');
      for (const key of ['admin', 'gerente', 'user']) {
        const res = await api(tokens[key]).get('/api/plan/features');
        assert.equal(res.status, 200, key);
        assert.deepEqual(res.body, { plan_id: 'Pro', plan_name: 'Profissional', features: { fmea: true, simulator: true, import: true } }, key);
      }
      const essencial = await api(tokens.globex).get('/api/plan/features');
      assert.deepEqual(essencial.body, { plan_id: 'Starter', plan_name: 'Essencial', features: { fmea: false, simulator: false, import: false } });
    });

    it('?tenant_id é ignorado para cliente; o Root consulta outro cliente', async () => {
      const proprio = await api(tokens.admin).get('/api/plan/features?tenant_id=globex');
      assert.equal(proprio.body.plan_id, 'Pro');
      const root = await api(tokens.root).get('/api/plan/features?tenant_id=globex');
      assert.equal(root.body.plan_id, 'Starter');
    });
  });
});

// ---------------------------------------------------------------------------------------------
describe('cobrança anual', () => {
  const subscribe = (body) => api(tokens.admin).post('/api/billing/subscription').send(body);
  const sentToStripe = () => calls['checkout.sessions.create']?.[0]?.[0];

  const resetBilling = () => q(`UPDATE tenants SET plan_type = 'Pro', status = 'Ativo', stripe_subscription_id = NULL, subscription_status = NULL,
    billing_method = NULL, billing_cycle = 'mensal', trial_used = FALSE, valor_mensal = 0 WHERE id = 'acme'`);

  beforeEach(resetBilling);

  it('cartão anual: cobra o preço anual do plano, com intervalo de 1 ano e teste grátis', async () => {
    const res = await subscribe({ method: 'card', plan_id: 'Pro', cycle: 'anual' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.cycle, 'anual');
    assert.equal(res.body.amount, 6972);
    const params = sentToStripe();
    assert.deepEqual(params.line_items[0].price_data, { currency: 'brl', product: 'prod_pro', unit_amount: 697200, recurring: { interval: 'year' } });
    assert.equal(params.subscription_data.metadata.cycle, 'anual');
    assert.equal(params.subscription_data.trial_period_days, 14);
  });

  it('Industrial anual: R$ 16.968 por ano', async () => {
    await subscribe({ method: 'card', plan_id: 'Industrial', cycle: 'anual' });
    assert.equal(sentToStripe().line_items[0].price_data.unit_amount, 1696800);
  });

  it('contrato negociado: o anual vale 10 mensalidades (2 meses grátis sobre o valor combinado)', async () => {
    await q("UPDATE tenants SET valor_mensal = 500 WHERE id = 'acme'");
    await subscribe({ method: 'card', plan_id: 'Pro', cycle: 'anual' });
    assert.equal(sentToStripe().line_items[0].price_data.unit_amount, 500000);
  });

  it('sem informar o ciclo continua mensal (compatível com quem já usava a API)', async () => {
    const res = await subscribe({ method: 'card', plan_id: 'Pro' });
    assert.equal(res.status, 201);
    assert.equal(res.body.cycle, 'mensal');
    assert.deepEqual(sentToStripe().line_items[0].price_data.recurring, { interval: 'month' });
    assert.equal(sentToStripe().line_items[0].price_data.unit_amount, 69700);
  });

  it('boleto e Pix só existem no mensal: anual é recusado e nada vai ao Stripe', async () => {
    for (const method of ['boleto', 'pix', 'pix_automatico']) {
      const res = await subscribe({ method, plan_id: 'Pro', cycle: 'anual' });
      assert.equal(res.status, 400, method);
    }
    assert.equal(calls['checkout.sessions.create'], undefined);
    assert.equal((await tenant('acme')).billing_method, null);
  });

  it('plano sem preço anual (Corporativo) não vende anual', async () => {
    const res = await subscribe({ method: 'card', plan_id: 'Enterprise', cycle: 'anual' });
    assert.equal(res.status, 400);
    assert.equal(calls['checkout.sessions.create'], undefined);
  });

  it('ciclo inválido é recusado', async () => {
    for (const cycle of ['trimestral', 'ANUAL', 1, null, ['anual']]) {
      const res = await subscribe({ method: 'card', plan_id: 'Pro', cycle });
      assert.ok(res.status >= 400 && res.status < 500, `${JSON.stringify(cycle)} -> ${res.status}`);
    }
    assert.equal(calls['checkout.sessions.create'], undefined);
  });

  describe('assinatura já criada no Stripe', () => {
    const stripeSub = (interval, extra = {}) => ({
      id: 'sub_ciclo', customer: 'cus_acme', status: 'active', cancel_at_period_end: false,
      metadata: { tenant_id: 'acme', plan_id: 'Pro', method: 'card' },
      items: { data: [{ id: 'si_1', current_period_end: now() + 365 * 86400, price: { recurring: { interval } } }] },
      ...extra,
    });
    const sync = async (sub) => {
      subscription = sub;
      return sendEvent('customer.subscription.updated', { id: sub.id });
    };

    it('o webhook grava o ciclo pelo intervalo real do preço (anual)', async () => {
      assert.equal((await sync(stripeSub('year'))).status, 200);
      const t = await tenant('acme');
      assert.equal(t.billing_cycle, 'anual');
      assert.equal(t.plan_type, 'Pro');
      const res = await api(tokens.admin).get('/api/billing/subscription');
      assert.equal(res.body.billing_cycle, 'anual');
      assert.equal(res.body.amount, 6972);
      assert.equal(res.body.monthly_equivalent, 581);
    });

    it('o webhook grava mensal quando o intervalo é de 1 mês', async () => {
      await sync(stripeSub('year'));
      await sync(stripeSub('month'));
      assert.equal((await tenant('acme')).billing_cycle, 'mensal');
      const res = await api(tokens.admin).get('/api/billing/subscription');
      assert.equal(res.body.amount, 697);
      assert.equal(res.body.monthly_equivalent, 697);
    });

    it('trocar de plano numa assinatura anual mantém o ciclo e cobra o anual do novo plano', async () => {
      await sync(stripeSub('year'));
      const res = await api(tokens.admin).put('/api/billing/subscription/plan').send({ plan_id: 'Industrial' });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.cycle, 'anual');
      assert.equal(res.body.amount, 16968);
      const [, body] = calls['subscriptions.update'][0];
      assert.deepEqual(body.items[0].price_data.recurring, { interval: 'year' });
      assert.equal(body.items[0].price_data.unit_amount, 1696800);
      assert.equal((await tenant('acme')).plan_type, 'Industrial');
    });

    it('trocar de plano numa assinatura mensal continua cobrando mensal', async () => {
      await sync(stripeSub('month'));
      await api(tokens.admin).put('/api/billing/subscription/plan').send({ plan_id: 'Industrial' });
      const [, body] = calls['subscriptions.update'][0];
      assert.deepEqual(body.items[0].price_data.recurring, { interval: 'month' });
      assert.equal(body.items[0].price_data.unit_amount, 169700);
    });
  });
});
