// Testes de isolamento entre tenants e de autorização. Rodam contra um MySQL real
// (o isolamento depende do SQL de cada rota). Veja `npm test` / `npm run test:docker`.
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

const TEST_DB = process.env.TEST_DB_NAME || 'smartmaint_test';
const dbConfig = {
  host: process.env.TEST_DB_HOST || '127.0.0.1',
  port: Number(process.env.TEST_DB_PORT || 3306),
  user: process.env.TEST_DB_USER || 'root',
  password: process.env.TEST_DB_PASSWORD || '',
};

// Variáveis lidas pelos módulos da API ao serem carregados
process.env.NODE_ENV = 'test';
process.env.DISABLE_RATE_LIMIT = '1';
process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-16-chars';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake_para_testes';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_teste';
process.env.DB_HOST = dbConfig.host;
process.env.DB_PORT = String(dbConfig.port);
process.env.DB_USER = dbConfig.user;
process.env.DB_PASSWORD = dbConfig.password;
process.env.DB_NAME = TEST_DB;

const PASS = 'Senha-de-teste-123';
let server, base, admin;
const ids = {}; // ids criados no seed, por tenant

const api = async (method, url, { token, body, headers = {} } = {}) => {
  const res = await fetch(base + url, {
    method,
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }), ...headers },
    body: body === undefined || method === 'GET' ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* sem corpo JSON */ }
  return { status: res.status, body: json };
};

const login = async (email) => {
  const r = await api('POST', '/api/login', { body: { email, password: PASS } });
  assert.equal(r.status, 200, `login de ${email} falhou: ${JSON.stringify(r.body)}`);
  return r.body.token;
};

before(async () => {
  try {
    admin = await mysql.createConnection({ ...dbConfig, multipleStatements: true });
  } catch (err) {
    throw new Error(
      `MySQL de teste indisponível em ${dbConfig.host}:${dbConfig.port} (${err.message}). ` +
      'Use `npm run test:docker` ou defina TEST_DB_HOST/PORT/USER/PASSWORD.',
      { cause: err }
    );
  }

  // Recria o banco de teste a partir do schema oficial
  const schema = fs.readFileSync(path.join(__dirname, '../database.sql'), 'utf8').replaceAll('smartmaint_db', TEST_DB);
  await admin.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
  await admin.query(schema);

  const hash = await bcrypt.hash(PASS, 4);
  for (const t of ['a', 'b']) {
    await admin.query('INSERT INTO tenants (id, name, contact_email) VALUES (?, ?, ?)', [t, `Empresa ${t.toUpperCase()}`, `${t}@teste.com`]);
    await admin.query('INSERT INTO users (tenant_id, name, email, password, role) VALUES (?, ?, ?, ?, "Administrador")', [t, `Admin ${t}`, `admin-${t}@teste.com`, hash]);
    await admin.query('INSERT INTO users (tenant_id, name, email, password, role) VALUES (?, ?, ?, ?, "Usuário")', [t, `Usuário ${t}`, `user-${t}@teste.com`, hash]);
    const [eq] = await admin.query('INSERT INTO equipments (tenant_id, name, type) VALUES (?, ?, "Bomba")', [t, `Equip-${t}`]);
    const eqId = eq.insertId;
    const [f] = await admin.query('INSERT INTO failures (tenant_id, equipment_id, descricao, tempo_operacao, data_falha) VALUES (?, ?, ?, 10, CURRENT_DATE)', [t, eqId, `Falha-${t}`]);
    const [fm] = await admin.query('INSERT INTO fmea (tenant_id, equipment_id, componente, modo_falha, severity, ocorrencia, deteccao) VALUES (?, ?, ?, "x", 5, 5, 5)', [t, eqId, `Comp-${t}`]);
    const [wo] = await admin.query('INSERT INTO work_orders (tenant_id, equipment_id, titulo, tipo, prioridade, status, responsavel, data_criacao) VALUES (?, ?, ?, "Corretiva", "Alta", "Aberta", "Zé", CURRENT_DATE)', [t, eqId, `OS-${t}`]);
    const [inv] = await admin.query('INSERT INTO inventory (tenant_id, name, sku, quantity, min_quantity, unit_price) VALUES (?, ?, ?, 5, 1, 10)', [t, `Peça-${t}`, `SKU-${t}`]);
    const [pp] = await admin.query('INSERT INTO preventive_plans (tenant_id, equipment_id, title, description, interval_days, next_due) VALUES (?, ?, ?, "d", 30, CURRENT_DATE)', [t, eqId, `Plano-${t}`]);
    await admin.query('INSERT INTO repairs (tenant_id, equipment_id, tipo, tempo_reparo, data_reparo) VALUES (?, ?, "Corretiva", 2, CURRENT_DATE)', [t, eqId]);
    const [fat] = await admin.query('INSERT INTO invoices (tenant_id, valor, vencimento, mes_ref) VALUES (?, 150.00, CURRENT_DATE, "01/2026")', [t]);
    ids[t] = { equipment: eqId, failure: f.insertId, fmea: fm.insertId, workOrder: wo.insertId, inventory: inv.insertId, plan: pp.insertId, invoice: fat.insertId };
  }
  await admin.query('INSERT INTO users (tenant_id, name, email, password, role, is_master) VALUES (NULL, "Master", "master@teste.com", ?, "Dono", TRUE)', [hash]);
  await admin.query('INSERT INTO users (tenant_id, name, email, password, role) VALUES (NULL, "Suporte", "suporte@teste.com", ?, "Suporte")', [hash]);

  const app = require('../index');
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  globalThis.__apiBase = base;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (admin) await admin.end();
  // Encerra o pool da API para o processo de teste terminar
  try { await require('../db').end(); } catch { /* já encerrado */ }
});

const count = async (sql, params) => (await admin.query(sql, params))[0][0].n;

// Coleções que devem retornar somente dados do próprio tenant
const LISTAS = [
  ['/api/equipments', 'Equip-'],
  ['/api/failures', 'Falha-'],
  ['/api/fmea', 'Comp-'],
  ['/api/work-orders', 'OS-'],
  ['/api/inventory', 'Peça-'],
  ['/api/preventive-plans', 'Plano-'],
];

describe('autenticação obrigatória', () => {
  for (const url of ['/api/equipments', '/api/failures', '/api/work-orders', '/api/inventory', '/api/preventive-plans', '/api/users', '/api/tenants', '/api/admin/tenants', '/api/admin/invoices']) {
    test(`GET ${url} sem token -> 401`, async () => {
      assert.equal((await api('GET', url)).status, 401);
    });
  }
  test('token adulterado -> 401', async () => {
    const t = await login('admin-a@teste.com');
    assert.equal((await api('GET', '/api/equipments', { token: t.slice(0, -3) + 'abc' })).status, 401);
  });
});

describe('leitura isolada por tenant', () => {
  for (const [url, prefix] of LISTAS) {
    test(`${url}: tenant A só vê dados de A`, async () => {
      const token = await login('admin-a@teste.com');
      const r = await api('GET', url, { token });
      assert.equal(r.status, 200);
      const txt = JSON.stringify(r.body);
      assert.ok(txt.includes(`${prefix}a`) || txt.includes(`${prefix}A`) || txt.includes(prefix + 'a'), `deveria conter dados de A em ${url}`);
      assert.ok(!txt.includes(`${prefix}b`), `vazou dado do tenant B em ${url}`);
    });

    test(`${url}: tenant A não consegue forçar tenant_id=b pela query`, async () => {
      const token = await login('admin-a@teste.com');
      const r = await api('GET', `${url}?tenant_id=b`, { token });
      assert.ok(!JSON.stringify(r.body).includes(`${prefix}b`), `tenant_id da query foi aceito em ${url}`);
    });
  }

  test('/api/repairs: só reparos do próprio tenant', async () => {
    const token = await login('admin-a@teste.com');
    const r = await api('GET', '/api/repairs', { token });
    assert.equal(r.status, 200);
    assert.ok(r.body.length > 0 && r.body.every((x) => x.tenant_id === 'a'));
  });

  test('/api/users: só usuários do próprio tenant', async () => {
    const token = await login('admin-a@teste.com');
    const r = await api('GET', '/api/users', { token });
    assert.ok(r.body.length === 2 && r.body.every((u) => u.tenant_id === 'a'));
    assert.ok(!JSON.stringify(r.body).includes('password'));
  });

  test('/api/tenants: só o próprio tenant', async () => {
    const token = await login('admin-a@teste.com');
    const r = await api('GET', '/api/tenants', { token });
    assert.deepEqual(r.body.map((t) => t.id), ['a']);
  });

  test('plano preventivo apontando para equipamento de outro tenant não vaza o nome', async () => {
    await admin.query('INSERT INTO preventive_plans (tenant_id, equipment_id, title, interval_days, next_due) VALUES ("a", ?, "Plano-cruzado", 30, CURRENT_DATE)', [ids.b.equipment]);
    const token = await login('admin-a@teste.com');
    const r = await api('GET', '/api/preventive-plans', { token });
    assert.ok(!JSON.stringify(r.body).includes('Equip-b'));
    await admin.query('DELETE FROM preventive_plans WHERE title = "Plano-cruzado"');
  });
});

describe('escrita em registros de outro tenant', () => {
  test('PUT/DELETE de equipamento de B por A não altera nada', async () => {
    const token = await login('admin-a@teste.com');
    await api('PUT', `/api/equipments/${ids.b.equipment}`, { token, body: { name: 'HACK', type: 'x' } });
    await api('DELETE', `/api/equipments/${ids.b.equipment}`, { token });
    assert.equal(await count('SELECT COUNT(*) n FROM equipments WHERE id = ? AND name = "Equip-b"', [ids.b.equipment]), 1);
  });

  const alvos = [
    ['DELETE', (t) => `/api/failures/${ids[t].failure}`, 'failures', 'failure'],
    ['DELETE', (t) => `/api/fmea/${ids[t].fmea}`, 'fmea', 'fmea'],
    ['DELETE', (t) => `/api/work-orders/${ids[t].workOrder}`, 'work_orders', 'workOrder'],
    ['DELETE', (t) => `/api/inventory/${ids[t].inventory}`, 'inventory', 'inventory'],
    ['DELETE', (t) => `/api/preventive-plans/${ids[t].plan}`, 'preventive_plans', 'plan'],
  ];
  for (const [method, url, tabela, chave] of alvos) {
    test(`${method} em ${tabela} de B por A é ignorado`, async () => {
      const token = await login('admin-a@teste.com');
      await api(method, url('b'), { token });
      assert.equal(await count(`SELECT COUNT(*) n FROM ${tabela} WHERE id = ?`, [ids.b[chave]]), 1);
    });
  }

  test('PUT em OS, estoque e plano preventivo de B por A não altera', async () => {
    const token = await login('admin-a@teste.com');
    await api('PUT', `/api/work-orders/${ids.b.workOrder}`, { token, body: { status: 'Concluída', titulo: 'HACK' } });
    await api('PUT', `/api/inventory/${ids.b.inventory}`, { token, body: { name: 'HACK', quantity: 0 } });
    await api('PUT', `/api/preventive-plans/${ids.b.plan}`, { token, body: { title: 'HACK' } });
    assert.equal(await count('SELECT COUNT(*) n FROM work_orders WHERE id = ? AND titulo = "OS-b" AND status = "Aberta"', [ids.b.workOrder]), 1);
    assert.equal(await count('SELECT COUNT(*) n FROM inventory WHERE id = ? AND name = "Peça-b"', [ids.b.inventory]), 1);
    assert.equal(await count('SELECT COUNT(*) n FROM preventive_plans WHERE id = ? AND title = "Plano-b"', [ids.b.plan]), 1);
    // concluir OS alheia não pode gerar reparo no tenant de A
    assert.equal(await count('SELECT COUNT(*) n FROM repairs WHERE tenant_id = "a" AND equipment_id = ?', [ids.b.equipment]), 0);
  });

  for (const [url, corpo] of [
    ['/api/failures', (id) => ({ equipment_id: id, descricao: 'x', tempo_operacao: 1 })],
    ['/api/fmea', (id) => ({ equipment_id: id, componente: 'x', modo_falha: 'x', severity: 1, ocorrencia: 1, deteccao: 1 })],
    ['/api/work-orders', (id) => ({ equipment_id: id, titulo: 'x', tipo: 'Corretiva', prioridade: 'Alta', status: 'Aberta', responsavel: 'x' })],
    ['/api/preventive-plans', (id) => ({ equipment_id: id, title: 'x', description: 'x', interval_days: 10 })],
  ]) {
    test(`POST ${url} com equipment_id de B por A -> 400`, async () => {
      const token = await login('admin-a@teste.com');
      const r = await api('POST', url, { token, body: corpo(ids.b.equipment) });
      assert.equal(r.status, 400);
    });
    test(`POST ${url} com equipment_id próprio -> 200`, async () => {
      const token = await login('admin-a@teste.com');
      const r = await api('POST', url, { token, body: corpo(ids.a.equipment) });
      assert.equal(r.status, 200, JSON.stringify(r.body));
    });
  }

  test('POST /equipments ignora tenant_id enviado no corpo', async () => {
    const token = await login('admin-a@teste.com');
    const r = await api('POST', '/api/equipments', { token, body: { name: 'Novo', type: 'x', tenant_id: 'b' } });
    assert.equal(r.status, 200);
    assert.equal(await count('SELECT COUNT(*) n FROM equipments WHERE id = ? AND tenant_id = "a"', [r.body.id]), 1);
  });
});

describe('ficha do equipamento (destino do QR code)', () => {
  test('sem token -> 401', async () => {
    assert.equal((await api('GET', `/api/equipments/${ids.a.equipment}`)).status, 401);
  });

  test('devolve a ficha do próprio equipamento com O.S., planos e total de falhas', async () => {
    const token = await login('admin-a@teste.com');
    const r = await api('GET', `/api/equipments/${ids.a.equipment}`, { token });
    assert.equal(r.status, 200);
    assert.equal(r.body.name, 'Equip-a');
    assert.equal(r.body.tenant_id, 'a');
    assert.ok(r.body.work_orders.length >= 1 && r.body.work_orders.every((w) => typeof w.titulo === 'string'));
    assert.ok(r.body.preventive_plans.length >= 1);
    assert.ok(r.body.failures_count >= 1);
    assert.ok(!JSON.stringify(r.body).includes('b@teste'), 'não pode misturar dados de B');
  });

  test('equipamento de outro tenant responde 404, igual a id inexistente (sem vazar existência)', async () => {
    const token = await login('admin-a@teste.com');
    const alheio = await api('GET', `/api/equipments/${ids.b.equipment}`, { token });
    const inexistente = await api('GET', '/api/equipments/99999999', { token });
    assert.equal(alheio.status, 404);
    assert.equal(inexistente.status, 404);
    assert.deepEqual(alheio.body, inexistente.body);
    assert.ok(!JSON.stringify(alheio.body).includes('Equip-b'));
  });

  test('?tenant_id não deixa cliente ler outro tenant; master e suporte leem com ?tenant_id', async () => {
    const token = await login('admin-a@teste.com');
    assert.equal((await api('GET', `/api/equipments/${ids.b.equipment}?tenant_id=b`, { token })).status, 404);
    for (const email of ['master@teste.com', 'suporte@teste.com']) {
      const r = await api('GET', `/api/equipments/${ids.b.equipment}?tenant_id=b`, { token: await login(email) });
      assert.equal(r.status, 200, email);
      assert.equal(r.body.name, 'Equip-b');
    }
  });

  test('ids malformados (texto, SQL, negativo, decimal) -> 404', async () => {
    const token = await login('admin-a@teste.com');
    for (const id of ['abc', '1%20OR%201=1', '-1', '1.5', '1;DROP', '0x1']) {
      assert.equal((await api('GET', `/api/equipments/${id}`, { token })).status, 404, id);
    }
  });

  test('lista continua funcionando (a rota /:id não captura /equipments)', async () => {
    const token = await login('admin-a@teste.com');
    const r = await api('GET', '/api/equipments', { token });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body));
  });
});

describe('autorização de backoffice e papéis', () => {
  for (const [method, url] of [
    ['GET', '/api/admin/tenants'], ['GET', '/api/admin/invoices'], ['GET', '/api/admin/users'],
    ['POST', '/api/admin/tenants'], ['POST', '/api/admin/invoices'], ['POST', '/api/admin/users'],
    ['PUT', '/api/admin/tenants/b/status'], ['PUT', '/api/admin/tenants/b/contract'],
    ['PUT', '/api/admin/invoices/1/status'], ['DELETE', '/api/admin/tenants/b'],
  ]) {
    test(`${method} ${url} por administrador de tenant -> 403`, async () => {
      const token = await login('admin-a@teste.com');
      assert.equal((await api(method, url, { token, body: {} })).status, 403);
    });
  }
  test('o tenant B segue intacto após as tentativas de exclusão', async () => {
    assert.equal(await count('SELECT COUNT(*) n FROM tenants WHERE id = "b"'), 1);
  });

  test('POST /users com papel Suporte -> 400 (escalada de privilégio)', async () => {
    const token = await login('admin-a@teste.com');
    const r = await api('POST', '/api/users', { token, body: { name: 'X', email: 'x@teste.com', role: 'Suporte', password: PASS } });
    assert.equal(r.status, 400);
    assert.equal(await count('SELECT COUNT(*) n FROM users WHERE email = "x@teste.com"'), 0);
  });

  test('POST /users com papel inválido -> 400', async () => {
    const token = await login('admin-a@teste.com');
    assert.equal((await api('POST', '/api/users', { token, body: { name: 'X', email: 'y@teste.com', role: 'Root' } })).status, 400);
  });

  test('POST /users cria no tenant do token e ignora tenant_id do corpo', async () => {
    const token = await login('admin-a@teste.com');
    const r = await api('POST', '/api/users', { token, body: { name: 'Novo', email: 'novo@teste.com', role: 'Usuário', tenant_id: 'b' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.tenant_id, 'a');
    assert.ok(r.body.temp_password && r.body.temp_password !== '123456');
    assert.equal(await count('SELECT COUNT(*) n FROM users WHERE email = "novo@teste.com" AND tenant_id = "a"'), 1);
  });

  test('usuário comum (sem papel de admin) não cria usuários -> 403', async () => {
    const token = await login('user-a@teste.com');
    const r = await api('POST', '/api/users', { token, body: { name: 'X', email: 'z@teste.com', role: 'Usuário' } });
    assert.equal(r.status, 403);
  });

  test('master e suporte conseguem ler outro tenant com ?tenant_id', async () => {
    for (const email of ['master@teste.com', 'suporte@teste.com']) {
      const token = await login(email);
      const r = await api('GET', '/api/equipments?tenant_id=b', { token });
      assert.equal(r.status, 200);
      assert.ok(JSON.stringify(r.body).includes('Equip-b'));
    }
  });

  test('novo cliente criado pelo backoffice recebe senha provisória aleatória', async () => {
    const token = await login('master@teste.com');
    const r = await api('POST', '/api/admin/tenants', { token, body: { id: 'novo', name: 'Novo', contact_email: 'dono@novo.com' } });
    assert.equal(r.status, 200);
    assert.ok(r.body.temp_password && r.body.temp_password !== '123456');
    const l = await api('POST', '/api/login', { body: { email: 'dono@novo.com', password: r.body.temp_password } });
    assert.equal(l.status, 200);
    const antiga = await api('POST', '/api/login', { body: { email: 'dono@novo.com', password: '123456' } });
    assert.equal(antiga.status, 401);
  });

  test('tenant inadimplente não consegue logar', async () => {
    await admin.query('UPDATE tenants SET status = "Inadimplente" WHERE id = "b"');
    const r = await api('POST', '/api/login', { body: { email: 'admin-b@teste.com', password: PASS } });
    assert.equal(r.status, 403);
    await admin.query('UPDATE tenants SET status = "Ativo" WHERE id = "b"');
  });
});

describe('faturas e pagamentos', () => {
  test('A não consegue abrir checkout da fatura de B', async () => {
    const token = await login('admin-a@teste.com');
    const r = await api('POST', '/api/billing/checkout', { token, body: { invoice_id: ids.b.invoice } });
    assert.equal(r.status, 400);
  });

  const enviar = async (evento, assinaturaInvalida) => {
    const Stripe = require('stripe');
    const s = Stripe('sk_test_x');
    const payload = JSON.stringify(evento);
    const sig = assinaturaInvalida ? 't=1,v1=ruim' : s.webhooks.generateTestHeaderString({ payload, secret: 'whsec_teste' });
    const res = await fetch(`${base}/api/webhooks/stripe`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': sig }, body: payload });
    return res.status;
  };
  const evento = (tenant, invoice, over = {}) => ({
    id: 'evt_' + Math.random(), object: 'event', type: 'checkout.session.completed',
    data: { object: { id: 'cs_1', payment_status: 'paid', amount_total: 15000, customer: 'cus_1', metadata: { tenant_id: tenant, invoice_id: String(invoice) }, ...over } },
  });
  const statusFatura = async (id) => (await admin.query('SELECT status FROM invoices WHERE id = ?', [id]))[0][0].status;

  test('webhook com assinatura inválida -> 400 e fatura intacta', async () => {
    assert.equal(await enviar(evento('a', ids.a.invoice), true), 400);
    assert.equal(await statusFatura(ids.a.invoice), 'Pendente');
  });

  test('webhook com tenant divergente da fatura não dá baixa', async () => {
    assert.equal(await enviar(evento('a', ids.b.invoice)), 200);
    assert.equal(await statusFatura(ids.b.invoice), 'Pendente');
  });

  test('webhook com valor divergente não dá baixa', async () => {
    assert.equal(await enviar(evento('a', ids.a.invoice, { amount_total: 100 })), 200);
    assert.equal(await statusFatura(ids.a.invoice), 'Pendente');
  });

  test('webhook de boleto ainda não pago não dá baixa', async () => {
    assert.equal(await enviar(evento('a', ids.a.invoice, { payment_status: 'unpaid' })), 200);
    assert.equal(await statusFatura(ids.a.invoice), 'Pendente');
  });

  test('webhook válido paga a fatura de A, reativa o tenant e não toca em B', async () => {
    await admin.query('UPDATE tenants SET status = "Inadimplente" WHERE id = "a"');
    assert.equal(await enviar(evento('a', ids.a.invoice)), 200);
    assert.equal(await statusFatura(ids.a.invoice), 'Paga');
    assert.equal(await statusFatura(ids.b.invoice), 'Pendente');
    assert.equal(await count('SELECT COUNT(*) n FROM tenants WHERE id = "a" AND status = "Ativo" AND stripe_customer_id = "cus_1"'), 1);
    // reenvio é idempotente
    assert.equal(await enviar(evento('a', ids.a.invoice)), 200);
    assert.equal(await statusFatura(ids.a.invoice), 'Paga');
  });
});

describe('cadastro autoatendido e trial', () => {
  const valido = (extra = {}) => ({
    company_name: 'Indústria Ágil Ltda.', name: 'Maria Souza', email: `maria-${Math.random().toString(36).slice(2)}@teste.com`,
    password: 'uma-senha-forte-123', accept_terms: true, ...extra,
  });

  test('cadastro válido cria tenant em Trial (14 dias), admin e já devolve token', async () => {
    const corpo = valido();
    const r = await api('POST', '/api/signup', { body: corpo });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.role, 'Administrador');
    assert.match(r.body.tenant_id, /^industria-agil-ltda-[0-9a-f]{4}$/);
    assert.ok(r.body.token && !('password' in r.body));

    const [[t]] = await admin.query('SELECT status, plan_type, trial_ends_at, TIMESTAMPDIFF(HOUR, NOW(), trial_ends_at) AS horas FROM tenants WHERE id = ?', [r.body.tenant_id]);
    assert.equal(t.status, 'Trial');
    assert.ok(t.horas >= 13 * 24 && t.horas <= 14 * 24, `trial deveria durar ~14 dias, horas=${t.horas}`);
    const [[u]] = await admin.query('SELECT is_master, terms_accepted_at FROM users WHERE email = ?', [corpo.email]);
    assert.equal(u.is_master, 0);
    assert.ok(u.terms_accepted_at, 'aceite dos termos deve ser registrado');

    // o token funciona e o novo tenant começa vazio e isolado
    const eq = await api('GET', '/api/equipments', { token: r.body.token });
    assert.equal(eq.status, 200);
    assert.deepEqual(eq.body, []);
    // e a senha escolhida permite login normal
    const l = await api('POST', '/api/login', { body: { email: corpo.email, password: corpo.password } });
    assert.equal(l.status, 200);
    assert.ok(!('reset_token' in l.body) && !('reset_token_expiry' in l.body) && !('password' in l.body));
  });

  test('cliente não consegue escolher papel, tenant, status nem trial pelo corpo', async () => {
    const corpo = valido({ role: 'Dono', is_master: true, tenant_id: 'a', id: 'a', status: 'Ativo', trial_ends_at: '2099-01-01', plan_type: 'Enterprise' });
    const r = await api('POST', '/api/signup', { body: corpo });
    assert.equal(r.status, 201);
    assert.notEqual(r.body.tenant_id, 'a');
    const [[u]] = await admin.query('SELECT role, is_master, tenant_id FROM users WHERE email = ?', [corpo.email]);
    assert.equal(u.role, 'Administrador');
    assert.equal(u.is_master, 0);
    const [[t]] = await admin.query('SELECT status, plan_type, trial_ends_at < DATE_ADD(NOW(), INTERVAL 20 DAY) AS curto FROM tenants WHERE id = ?', [u.tenant_id]);
    assert.equal(t.status, 'Trial');
    assert.equal(t.plan_type, 'Profissional');
    assert.equal(t.curto, 1);
    // o tenant A existente não foi alterado nem recebeu usuário
    assert.equal(await count('SELECT COUNT(*) n FROM users WHERE tenant_id = "a" AND email = ?', [corpo.email]), 0);
  });

  test('nome de empresa com aspas/HTML gera id seguro e não quebra o SQL', async () => {
    const r = await api('POST', '/api/signup', { body: valido({ company_name: `Acme"; DROP TABLE users;-- <script>` }) });
    assert.equal(r.status, 201);
    assert.match(r.body.tenant_id, /^[a-z0-9-]+$/);
    assert.ok(await count('SELECT COUNT(*) n FROM users') > 0);
  });

  const invalidos = [
    ['sem aceite dos termos', { accept_terms: false }],
    ['aceite como string', { accept_terms: 'true' }],
    ['senha curta', { password: 'curta123' }],
    ['senha acima de 72 bytes', { password: 'a'.repeat(73) }],
    ['e-mail inválido', { email: 'nao-e-email' }],
    ['empresa vazia', { company_name: ' ' }],
    ['nome com tipo errado', { name: { $ne: '' } }],
    ['senha com tipo errado', { password: ['uma-senha-forte-123'] }],
  ];
  for (const [titulo, extra] of invalidos) {
    test(`recusa cadastro: ${titulo} -> 400`, async () => {
      const antes = await count('SELECT COUNT(*) n FROM tenants');
      const r = await api('POST', '/api/signup', { body: valido(extra) });
      assert.equal(r.status, 400, JSON.stringify(r.body));
      assert.equal(await count('SELECT COUNT(*) n FROM tenants'), antes);
    });
  }

  test('e-mail repetido -> 409 e não deixa tenant órfão', async () => {
    const corpo = valido();
    assert.equal((await api('POST', '/api/signup', { body: corpo })).status, 201);
    const antes = await count('SELECT COUNT(*) n FROM tenants');
    const r = await api('POST', '/api/signup', { body: { ...corpo, company_name: 'Outra Empresa' } });
    assert.equal(r.status, 409);
    assert.equal(await count('SELECT COUNT(*) n FROM tenants'), antes, 'a transação deve ter sido revertida');
    // e-mail já usado por um cliente existente (case-insensitive) também é recusado
    assert.equal((await api('POST', '/api/signup', { body: valido({ email: 'ADMIN-A@teste.com' }) })).status, 409);
  });

  test('SIGNUP_ENABLED=false desliga o cadastro -> 404', async () => {
    process.env.SIGNUP_ENABLED = 'false';
    try {
      assert.equal((await api('POST', '/api/signup', { body: valido() })).status, 404);
    } finally { delete process.env.SIGNUP_ENABLED; }
  });

  test('trial vencido bloqueia o login com código TRIAL_EXPIRED; dentro do prazo libera', async () => {
    const corpo = valido();
    const { body } = await api('POST', '/api/signup', { body: corpo });
    await admin.query('UPDATE tenants SET trial_ends_at = DATE_SUB(NOW(), INTERVAL 1 HOUR) WHERE id = ?', [body.tenant_id]);
    const bloqueado = await api('POST', '/api/login', { body: { email: corpo.email, password: corpo.password } });
    assert.equal(bloqueado.status, 403);
    assert.equal(bloqueado.body.code, 'TRIAL_EXPIRED');
    await admin.query('UPDATE tenants SET trial_ends_at = DATE_ADD(NOW(), INTERVAL 1 DAY) WHERE id = ?', [body.tenant_id]);
    assert.equal((await api('POST', '/api/login', { body: { email: corpo.email, password: corpo.password } })).status, 200);
  });

  test('tenants de contrato (status Ativo, sem trial) continuam logando normalmente', async () => {
    // tenants de contrato (status Ativo, sem trial_ends_at) seguem logando normalmente
    assert.equal((await api('POST', '/api/login', { body: { email: 'admin-a@teste.com', password: PASS } })).status, 200);
  });
});

describe('limites e recursos por plano', () => {
  // Cria um tenant isolado com o plano pedido e devolve { id, token }
  let seq = 0;
  const novoTenant = async (plan, extras = {}) => {
    const id = `plano-${plan.toLowerCase()}-${++seq}`;
    const hash = await bcrypt.hash(PASS, 4);
    await admin.query('INSERT INTO tenants (id, name, plan_type, extra_assets, extra_users) VALUES (?, ?, ?, ?, ?)', [id, id, plan, extras.assets || 0, extras.users || 0]);
    await admin.query('INSERT INTO users (tenant_id, name, email, password, role) VALUES (?, "Adm", ?, ?, "Administrador")', [id, `adm@${id}.com`, hash]);
    return { id, token: await login(`adm@${id}.com`) };
  };
  const equipamentos = (id, n) => admin.query(`INSERT INTO equipments (tenant_id, name, type) VALUES ${Array(n).fill('(?, "x", "x")').join(',')}`, Array(n).fill(id));
  const criarAtivo = (token) => api('POST', '/api/equipments', { token, body: { name: 'Novo', type: 'x' } });

  test('Essencial: o 51º ativo é recusado com PLAN_LIMIT_ASSETS', async () => {
    const t = await novoTenant('Essencial');
    await equipamentos(t.id, 49);
    assert.equal((await criarAtivo(t.token)).status, 200); // 50º
    const r = await criarAtivo(t.token);
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'PLAN_LIMIT_ASSETS');
    assert.equal(r.body.limit, 50);
    assert.equal(await count('SELECT COUNT(*) n FROM equipments WHERE tenant_id = ?', [t.id]), 50);
  });

  test('excedente contratado (extra_assets) amplia o limite', async () => {
    const t = await novoTenant('Essencial', { assets: 2 });
    await equipamentos(t.id, 50);
    assert.equal((await criarAtivo(t.token)).status, 200);
    assert.equal((await criarAtivo(t.token)).status, 200);
    assert.equal((await criarAtivo(t.token)).status, 403);
  });

  test('requisições simultâneas não ultrapassam o limite (45/50 + 12 em paralelo -> exatamente 5)', async () => {
    const t = await novoTenant('Essencial');
    await equipamentos(t.id, 45);
    const rs = await Promise.all(Array.from({ length: 12 }, () => criarAtivo(t.token)));
    assert.equal(rs.filter((r) => r.status === 200).length, 5, JSON.stringify(rs.map((r) => r.status)));
    assert.equal(rs.filter((r) => r.status === 403).length, 7);
    assert.equal(await count('SELECT COUNT(*) n FROM equipments WHERE tenant_id = ?', [t.id]), 50);
  });

  test('Corporativo não tem limite de ativos', async () => {
    const t = await novoTenant('Corporativo');
    await equipamentos(t.id, 60);
    assert.equal((await criarAtivo(t.token)).status, 200);
  });

  test('o limite de um cliente não afeta outro', async () => {
    const cheio = await novoTenant('Essencial');
    const livre = await novoTenant('Essencial');
    await equipamentos(cheio.id, 50);
    assert.equal((await criarAtivo(cheio.token)).status, 403);
    assert.equal((await criarAtivo(livre.token)).status, 200);
  });

  test('Essencial: o 4º usuário é recusado com PLAN_LIMIT_USERS (admin já conta como 1)', async () => {
    const t = await novoTenant('Essencial');
    const criar = (n) => api('POST', '/api/users', { token: t.token, body: { name: `U${n}`, email: `u${n}@${t.id}.com`, role: 'Usuário' } });
    assert.equal((await criar(1)).status, 200);
    assert.equal((await criar(2)).status, 200);
    const r = await criar(3);
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'PLAN_LIMIT_USERS');
    assert.equal(await count('SELECT COUNT(*) n FROM users WHERE tenant_id = ?', [t.id]), 3);
  });

  test('Essencial não acessa FMEA (GET/POST/DELETE -> 403 FEATURE_NOT_IN_PLAN)', async () => {
    const t = await novoTenant('Essencial');
    const eq = (await criarAtivo(t.token)).body.id;
    for (const [m, url, body] of [
      ['GET', '/api/fmea'],
      ['POST', '/api/fmea', { equipment_id: eq, componente: 'x', modo_falha: 'x', severity: 1, ocorrencia: 1, deteccao: 1 }],
      ['DELETE', '/api/fmea/1'],
    ]) {
      const r = await api(m, url, { token: t.token, body });
      assert.equal(r.status, 403, `${m} ${url}`);
      assert.equal(r.body.code, 'FEATURE_NOT_IN_PLAN');
    }
    assert.equal(await count('SELECT COUNT(*) n FROM fmea WHERE tenant_id = ?', [t.id]), 0);
  });

  test('Profissional e Industrial acessam FMEA', async () => {
    for (const plano of ['Profissional', 'Industrial']) {
      const t = await novoTenant(plano);
      assert.equal((await api('GET', '/api/fmea', { token: t.token })).status, 200, plano);
    }
  });

  test('plano com nome antigo (Pro/Starter) é tratado como Profissional/Essencial', async () => {
    const t = await novoTenant('Starter');
    assert.equal((await api('GET', '/api/fmea', { token: t.token })).status, 403);
    await admin.query('UPDATE tenants SET plan_type = "Pro" WHERE id = ?', [t.id]);
    assert.equal((await api('GET', '/api/fmea', { token: t.token })).status, 200);
  });

  test('downgrade não apaga dados: tenant acima do limite mantém o que tem e só bloqueia novos', async () => {
    const t = await novoTenant('Profissional');
    await equipamentos(t.id, 60);
    await admin.query('UPDATE tenants SET plan_type = "Essencial" WHERE id = ?', [t.id]);
    const lista = await api('GET', '/api/equipments', { token: t.token });
    assert.equal(lista.body.length, 60);
    assert.equal((await criarAtivo(t.token)).status, 403);
  });

  test('GET /api/plan devolve plano, limites, uso e recursos do próprio tenant', async () => {
    const t = await novoTenant('Essencial', { users: 1 });
    await equipamentos(t.id, 7);
    const r = await api('GET', '/api/plan', { token: t.token });
    assert.equal(r.status, 200);
    assert.equal(r.body.plan, 'Essencial');
    assert.deepEqual(r.body.limits, { assets: 50, users: 4 });
    assert.deepEqual(r.body.usage, { assets: 7, users: 1 });
    assert.equal(r.body.features.fmea, false);
  });

  test('GET /api/plan: tenant não lê o plano de outro; master lê com ?tenant_id', async () => {
    const t = await novoTenant('Essencial');
    const proprio = await api('GET', '/api/plan?tenant_id=a', { token: t.token });
    assert.equal(proprio.body.plan, 'Essencial', 'tenant_id da query deve ser ignorado');
    const m = await api('GET', `/api/plan?tenant_id=${t.id}`, { token: await login('master@teste.com') });
    assert.equal(m.body.plan, 'Essencial');
    assert.equal((await api('GET', '/api/plan')).status, 401);
  });

  test('backoffice: plano inválido -> 400; excedente inválido -> 400; plano válido persiste normalizado', async () => {
    const master = await login('master@teste.com');
    const t = await novoTenant('Essencial');
    const contrato = (body) => api('PUT', `/api/admin/tenants/${t.id}/contract`, { token: master, body });
    assert.equal((await contrato({ plan_type: 'Gratis' })).status, 400);
    assert.equal((await contrato({ extra_assets: -1 })).status, 400);
    assert.equal((await contrato({ extra_users: 'abc' })).status, 400);
    assert.equal((await contrato({ plan_type: 'Pro', extra_assets: 20, extra_users: 2 })).status, 200);
    const [[row]] = await admin.query('SELECT plan_type, extra_assets, extra_users FROM tenants WHERE id = ?', [t.id]);
    assert.deepEqual({ ...row }, { plan_type: 'Profissional', extra_assets: 20, extra_users: 2 });
    assert.equal((await api('POST', '/api/admin/tenants', { token: master, body: { id: 'x-inv', name: 'X', plan_type: 'Ouro' } })).status, 400);
  });

  test('admin de cliente não consegue alterar o próprio plano nem os excedentes', async () => {
    const t = await novoTenant('Essencial');
    const r = await api('PUT', `/api/admin/tenants/${t.id}/contract`, { token: t.token, body: { plan_type: 'Corporativo', extra_assets: 9999 } });
    assert.equal(r.status, 403);
    assert.equal(await count('SELECT COUNT(*) n FROM tenants WHERE id = ? AND plan_type = "Essencial" AND extra_assets = 0', [t.id]), 1);
  });

  test('cadastro autoatendido começa em Profissional (trial mostra o produto completo)', async () => {
    const r = await api('POST', '/api/signup', { body: { company_name: 'Teste Plano', name: 'Fulano', email: 'plano-signup@teste.com', password: 'uma-senha-forte-123', accept_terms: true } });
    assert.equal(r.status, 201);
    const p = await api('GET', '/api/plan', { token: r.body.token });
    assert.equal(p.body.plan, 'Profissional');
    assert.equal(p.body.features.fmea, true);
  });
});

describe('importação de ativos em lote', () => {
  let seq = 0;
  const novoTenant = async (plan, { extras = {} } = {}) => {
    const id = `imp-${plan.toLowerCase()}-${++seq}`;
    const hash = await bcrypt.hash(PASS, 4);
    await admin.query('INSERT INTO tenants (id, name, plan_type, extra_assets) VALUES (?, ?, ?, ?)', [id, id, plan, extras.assets || 0]);
    await admin.query('INSERT INTO users (tenant_id, name, email, password, role) VALUES (?, "Adm", ?, ?, "Administrador")', [id, `adm@${id}.com`, hash]);
    await admin.query('INSERT INTO users (tenant_id, name, email, password, role) VALUES (?, "Op", ?, ?, "Usuário")', [id, `op@${id}.com`, hash]);
    return { id, token: await login(`adm@${id}.com`), tokenUsuario: await login(`op@${id}.com`) };
  };
  const importar = (token, rows, extra = {}, query = '') => api('POST', `/api/equipments/import${query}`, { token, body: { rows, ...extra } });
  const linhas = (n, prefix = 'Eq') => Array.from({ length: n }, (_, i) => ({ name: `${prefix} ${i + 1}`, type: 'Bomba', serie: `${prefix}-${i + 1}` }));
  const total = (id) => count('SELECT COUNT(*) n FROM equipments WHERE tenant_id = ?', [id]);

  test('sem token -> 401', async () => {
    assert.equal((await api('POST', '/api/equipments/import', { body: { rows: linhas(1) } })).status, 401);
  });

  test('Essencial não tem importação (FEATURE_NOT_IN_PLAN) e nada é gravado', async () => {
    const t = await novoTenant('Essencial');
    const r = await importar(t.token, linhas(2));
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'FEATURE_NOT_IN_PLAN');
    assert.equal(await total(t.id), 0);
  });

  test('usuário comum (papel Usuário) não importa -> 403', async () => {
    const t = await novoTenant('Profissional');
    assert.equal((await importar(t.tokenUsuario, linhas(1))).status, 403);
    assert.equal(await total(t.id), 0);
  });

  test('importação válida grava todos os campos no tenant do token', async () => {
    const t = await novoTenant('Profissional');
    const r = await importar(t.token, [
      { name: ' Torno CNC ', type: 'Usinagem', model: 'X1', serie: 'S-100', total_op_time: 1200, data_inicio: '2023-05-10' },
      { name: 'Prensa', serie: 12345 },
      { name: 'Compressor', total_op_time: '350' },
    ]);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.imported, 3);
    assert.deepEqual(r.body.skipped, []);
    const [rows] = await admin.query('SELECT name, type, model, serie, total_op_time, DATE_FORMAT(data_inicio, "%Y-%m-%d") d FROM equipments WHERE tenant_id = ? ORDER BY id', [t.id]);
    assert.deepEqual({ ...rows[0] }, { name: 'Torno CNC', type: 'Usinagem', model: 'X1', serie: 'S-100', total_op_time: 1200, d: '2023-05-10' });
    assert.equal(rows[1].serie, '12345');
    assert.equal(rows[2].total_op_time, 350);
  });

  test('dry_run calcula o resultado sem gravar', async () => {
    const t = await novoTenant('Profissional');
    const r = await importar(t.token, linhas(4), { dry_run: true });
    assert.equal(r.status, 200);
    assert.equal(r.body.dry_run, true);
    assert.equal(r.body.would_import, 4);
    assert.equal(r.body.imported, 0);
    assert.equal(await total(t.id), 0);
  });

  test('tenant_id/id/campos extras na linha são ignorados', async () => {
    const t = await novoTenant('Profissional');
    const r = await importar(t.token, [{ name: 'Hack', tenant_id: 'a', id: 1, image: 'http://x', created_at: '2000-01-01' }], {}, '?tenant_id=a');
    assert.equal(r.status, 200);
    assert.equal(await total(t.id), 1);
    assert.equal(await count('SELECT COUNT(*) n FROM equipments WHERE tenant_id = "a" AND name = "Hack"'), 0);
    assert.equal(await count('SELECT COUNT(*) n FROM equipments WHERE tenant_id = ? AND image IS NULL', [t.id]), 1);
  });

  test('cliente não importa para outro tenant via ?tenant_id; master/suporte importam com ?tenant_id', async () => {
    const t = await novoTenant('Profissional');
    const alvo = await novoTenant('Profissional');
    await importar(t.token, linhas(1, 'Cruz'), {}, `?tenant_id=${alvo.id}`);
    assert.equal(await total(alvo.id), 0);
    assert.equal(await total(t.id), 1);
    for (const email of ['master@teste.com', 'suporte@teste.com']) {
      const r = await importar(await login(email), linhas(1, email.slice(0, 3)), {}, `?tenant_id=${alvo.id}`);
      assert.equal(r.status, 200, email);
    }
    assert.equal(await total(alvo.id), 2);
  });

  test('linhas inválidas recusam o lote inteiro (422) e informam a linha de cada erro', async () => {
    const t = await novoTenant('Profissional');
    const r = await importar(t.token, [
      { name: 'Ok', line: 2 },
      { name: '', line: 3 },
      { name: 'Data ruim', data_inicio: '2024-02-31', line: 4 },
      { name: 'Horas ruins', total_op_time: -5, line: 5 },
      { name: 'Horas decimais', total_op_time: 1.5, line: 6 },
      { name: 'x'.repeat(256), line: 7 },
    ]);
    assert.equal(r.status, 422);
    assert.equal(r.body.code, 'IMPORT_INVALID');
    assert.deepEqual(r.body.errors.map((e) => e.line), [3, 4, 5, 6, 7]);
    assert.equal(r.body.total_errors, 5);
    assert.equal(await total(t.id), 0, 'nada deve ser gravado quando há erro');
  });

  test('tipos inesperados (objeto, array, booleano) são recusados, não vão para o SQL', async () => {
    const t = await novoTenant('Profissional');
    for (const linha of [{ name: { $ne: 1 } }, { name: ['a'] }, { name: 'ok', serie: { x: 1 } }, { name: 'ok', total_op_time: true }, { name: 'ok', data_inicio: 20240101 }, 'texto', null, [1, 2]]) {
      const r = await importar(t.token, [linha]);
      assert.equal(r.status, 422, JSON.stringify(linha));
    }
    assert.equal(await total(t.id), 0);
  });

  test('texto com aspas e SQL é gravado literalmente', async () => {
    const t = await novoTenant('Profissional');
    const nome = `Robert'); DROP TABLE equipments;--`;
    assert.equal((await importar(t.token, [{ name: nome }])).status, 200);
    const [[row]] = await admin.query('SELECT name FROM equipments WHERE tenant_id = ?', [t.id]);
    assert.equal(row.name, nome);
  });

  test('lista vazia, sem rows e mais de 1000 linhas -> 400', async () => {
    const t = await novoTenant('Industrial');
    assert.equal((await importar(t.token, [])).status, 400);
    assert.equal((await api('POST', '/api/equipments/import', { token: t.token, body: {} })).status, 400);
    assert.equal((await api('POST', '/api/equipments/import', { token: t.token, body: { rows: 'abc' } })).status, 400);
    assert.equal((await importar(t.token, linhas(1001))).status, 400);
    assert.equal(await total(t.id), 0);
  });

  test('1000 linhas cabem no corpo e são importadas (Industrial)', async () => {
    const t = await novoTenant('Industrial');
    const r = await importar(t.token, linhas(1000));
    assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
    assert.equal(r.body.imported, 1000);
    assert.equal(await total(t.id), 1000);
  });

  test('duplicados: série já cadastrada ou repetida na planilha é ignorada e reportada', async () => {
    const t = await novoTenant('Profissional');
    await admin.query('INSERT INTO equipments (tenant_id, name, serie) VALUES (?, "Antigo", "ABC-1")', [t.id]);
    const r = await importar(t.token, [
      { name: 'Repetido do banco', serie: 'abc-1', line: 2 },
      { name: 'Novo', serie: 'XYZ-9', line: 3 },
      { name: 'Repetido na planilha', serie: ' xyz-9 ', line: 4 },
      { name: 'Sem série A', line: 5 },
      { name: 'Sem série B', line: 6 },
    ]);
    assert.equal(r.status, 200);
    assert.equal(r.body.imported, 3);
    assert.deepEqual(r.body.skipped.map((s) => s.line), [2, 4]);
    // reenviar a mesma planilha não duplica os que têm série
    const de_novo = await importar(t.token, [{ name: 'Novo', serie: 'XYZ-9' }]);
    assert.equal(de_novo.body.imported, 0);
    assert.equal(de_novo.body.skipped.length, 1);
  });

  test('a mesma série em outro cliente não conta como duplicada', async () => {
    const a = await novoTenant('Profissional');
    const b = await novoTenant('Profissional');
    await admin.query('INSERT INTO equipments (tenant_id, name, serie) VALUES (?, "De B", "COMPARTILHADA")', [b.id]);
    const r = await importar(a.token, [{ name: 'De A', serie: 'COMPARTILHADA' }]);
    assert.equal(r.body.imported, 1);
  });

  test('limite do plano: lote que estoura é recusado por inteiro (403 PLAN_LIMIT_ASSETS)', async () => {
    const t = await novoTenant('Profissional');
    await admin.query(`INSERT INTO equipments (tenant_id, name) VALUES ${Array(295).fill('(?, "x")').join(',')}`, Array(295).fill(t.id));
    const r = await importar(t.token, linhas(10));
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'PLAN_LIMIT_ASSETS');
    assert.equal(r.body.available, 5);
    assert.equal(r.body.requested, 10);
    assert.equal(await total(t.id), 295, 'nada deve ser importado parcialmente');
    assert.equal((await importar(t.token, linhas(5))).status, 200);
    assert.equal(await total(t.id), 300);
    assert.equal((await importar(t.token, linhas(1, 'Extra'))).status, 403);
  });

  test('duplicados ignorados não consomem limite; excedente contratado amplia a capacidade', async () => {
    const t = await novoTenant('Profissional', { extras: { assets: 100 } });
    await admin.query(`INSERT INTO equipments (tenant_id, name, serie) VALUES ${Array(300).fill('(?, "x", ?)').join(',')}`, Array.from({ length: 300 }, (_, i) => [t.id, `S${i}`]).flat());
    // 300 já existem; limite é 400 (300 + 100 extras): 100 novos cabem, e 50 repetidos são ignorados
    const r = await importar(t.token, [...linhas(100, 'Novo'), ...Array.from({ length: 50 }, (_, i) => ({ name: 'Rep', serie: `S${i}` }))]);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.imported, 100);
    assert.equal(r.body.skipped.length, 50);
    assert.equal(await total(t.id), 400);
  });

  test('Corporativo não tem limite de ativos na importação', async () => {
    const t = await novoTenant('Corporativo');
    const r = await importar(t.token, linhas(400));
    assert.equal(r.status, 200);
    assert.equal(r.body.available, null);
  });

  test('contrato cliente-servidor: saída do parser do front (CSV modelo e matriz tipo XLSX) é aceita pelo servidor', async () => {
    const util = await import('../../src/utils/importEquipments.js');
    const t = await novoTenant('Profissional');

    // 1) o próprio modelo de planilha que o usuário baixa
    const doModelo = util.mapTable(util.parseCsv(util.buildTemplateCsv().replace(/^\uFEFF/, '')));
    const r1 = await importar(t.token, doModelo.rows);
    assert.equal(r1.status, 200, JSON.stringify(r1.body));
    assert.equal(r1.body.imported, 2);

    // 2) o que o leitor de XLSX entrega: série numérica, "1.200" como texto, Date, células vazias
    const doXlsx = util.mapTable(util.tableFromMatrix([
      ['Nome', 'Nº de série', 'Horas operadas', 'Data de início', 'Fornecedor'],
      ['Prensa', 12345, '1.200', new Date('2023-05-10T00:00:00Z'), 'ACME'],
      ['Torno', null, 350, null, null],
    ]));
    const r2 = await importar(t.token, doXlsx.rows);
    assert.equal(r2.status, 200, JSON.stringify(r2.body));
    assert.equal(r2.body.imported, 2);
    const [[prensa]] = await admin.query('SELECT serie, total_op_time, DATE_FORMAT(data_inicio, "%Y-%m-%d") d FROM equipments WHERE tenant_id = ? AND name = "Prensa"', [t.id]);
    assert.deepEqual({ ...prensa }, { serie: '12345', total_op_time: 1200, d: '2023-05-10' });

    // 3) o erro que o usuário vê aponta a linha da PLANILHA (com cabeçalho na linha 1)
    const ruim = util.mapTable(util.parseCsv('Nome;Data de início\nOk;10/05/2023\nRuim;31/02/2023'));
    const r3 = await importar(t.token, ruim.rows);
    assert.equal(r3.status, 422);
    assert.deepEqual(r3.body.errors.map((e) => [e.line, e.field]), [[3, 'data_inicio']]);
  });

  test('importações simultâneas não ultrapassam o limite (4 vagas, 2 lotes de 3 -> só um passa)', async () => {
    const t = await novoTenant('Profissional');
    await admin.query(`INSERT INTO equipments (tenant_id, name) VALUES ${Array(296).fill('(?, "x")').join(',')}`, Array(296).fill(t.id));
    const rs = await Promise.all([importar(t.token, linhas(3, 'P')), importar(t.token, linhas(3, 'Q'))]);
    assert.deepEqual(rs.map((r) => r.status).sort(), [200, 403]);
    assert.equal(await total(t.id), 299);
  });
});

describe('assinatura recorrente', () => {
  const jwt = require('jsonwebtoken');
  const Stripe = require('stripe');
  const stripeMod = require('../utils/stripe');
  const stripeClient = new Stripe('sk_test_x');

  // ---- Stripe falso: registra as chamadas, não sai para a rede ----
  const calls = { checkout: [], portal: [] };
  let falha = false;
  const originais = {};
  before(() => {
    originais.checkout = stripeMod.stripe.checkout.sessions.create;
    originais.portal = stripeMod.stripe.billingPortal.sessions.create;
    stripeMod.stripe.checkout.sessions.create = async (args) => {
      if (falha) throw new Error('stripe fora do ar: sk_live_segredo');
      calls.checkout.push(args);
      return { id: 'cs_fake', url: 'https://checkout.stripe.test/cs_fake' };
    };
    stripeMod.stripe.billingPortal.sessions.create = async (args) => {
      calls.portal.push(args);
      return { url: 'https://billing.stripe.test/portal' };
    };
  });
  after(() => {
    stripeMod.stripe.checkout.sessions.create = originais.checkout;
    stripeMod.stripe.billingPortal.sessions.create = originais.portal;
  });

  let seq = 0;
  const base = Math.floor(Date.now() / 1000);
  let clock = 0;
  const novoTenant = async ({ plan = 'Profissional', status = 'Ativo', trialDias = null, customer = null, subscription = null, subStatus = null, subEventAt = null } = {}) => {
    const id = `sub-${++seq}`;
    const hash = await bcrypt.hash(PASS, 4);
    await admin.query(
      `INSERT INTO tenants (id, name, plan_type, status, contact_email, trial_ends_at, stripe_customer_id, stripe_subscription_id, subscription_status, subscription_event_at)
       VALUES (?, ?, ?, ?, ?, ${trialDias === null ? 'NULL' : 'DATE_ADD(NOW(), INTERVAL ? SECOND)'}, ?, ?, ?, ?)`,
      [id, id, plan, status, `${id}@teste.com`, ...(trialDias === null ? [] : [Math.round(trialDias * 86400)]), customer, subscription, subStatus, subEventAt]
    );
    await admin.query('INSERT INTO users (tenant_id, name, email, password, role) VALUES (?, "Adm", ?, ?, "Administrador")', [id, `adm@${id}.com`, hash]);
    await admin.query('INSERT INTO users (tenant_id, name, email, password, role) VALUES (?, "Op", ?, ?, "Usuário")', [id, `op@${id}.com`, hash]);
    return { id, email: `adm@${id}.com`, opEmail: `op@${id}.com`, customer };
  };
  const tokenOf = (t) => login(t.email);
  const tenantRow = async (id) => (await admin.query('SELECT * FROM tenants WHERE id = ?', [id]))[0][0];
  const tentarLogin = (email) => api('POST', '/api/login', { body: { email, password: PASS } });

  // ---- eventos assinados ----
  const enviar = async (type, object, { id, created, ruim } = {}) => {
    const evento = { id: id || `evt_${++clock}_${Math.random().toString(36).slice(2)}`, object: 'event', type, created: created ?? base + ++clock, data: { object } };
    const payload = JSON.stringify(evento);
    const sig = ruim ? 't=1,v1=ruim' : stripeClient.webhooks.generateTestHeaderString({ payload, secret: 'whsec_teste' });
    const res = await fetch(`${base_url()}/api/webhooks/stripe`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': sig }, body: payload });
    return { status: res.status, evento };
  };
  const base_url = () => base_;
  let base_;
  before(() => { base_ = globalThis.__apiBase; });

  const assinatura = (t, over = {}) => ({
    id: `sub_${t.id}`, object: 'subscription', status: 'active', customer: `cus_${t.id}`, cancel_at_period_end: false,
    metadata: { tenant_id: t.id, plan: 'Profissional', cycle: 'mensal' },
    items: { data: [{ current_period_end: base + 30 * 86400, price: { recurring: { interval: 'month' } } }] },
    ...over,
  });

  // =============== planos e preços (fonte única no servidor) ===============
  describe('catálogo de preços', () => {
    const { PLANS, PURCHASABLE_PLANS, priceCents, getLimits } = require('../utils/plans');
    test('os valores batem com a tabela publicada no site (mensal e anual = 10/12 x 12)', () => {
      assert.deepEqual(PURCHASABLE_PLANS, ['Essencial', 'Profissional', 'Industrial']);
      assert.deepEqual(['Essencial', 'Profissional', 'Industrial'].map((n) => PLANS[n].price.monthly), [297, 697, 1697]);
      assert.deepEqual(['Essencial', 'Profissional', 'Industrial'].map((n) => Math.round(PLANS[n].price.annual / 12)), [247, 581, 1414]);
      // o equivalente mensal publicado fica a menos de R$ 1 de "10/12 do mensal" (arredondado para um preço redondo)
      for (const n of PURCHASABLE_PLANS) assert.ok(Math.abs(PLANS[n].price.annual / 12 - (PLANS[n].price.monthly * 10) / 12) < 1, n);
      for (const n of PURCHASABLE_PLANS) assert.equal(PLANS[n].price.annual % 12, 0, `${n}: total anual divisível por 12`);
    });
    test('priceCents: centavos corretos; Corporativo, plano e ciclo inválidos -> null', () => {
      assert.equal(priceCents('Essencial', 'mensal'), 29700);
      assert.equal(priceCents('Industrial', 'anual'), 1696800);
      for (const [p, c] of [['Corporativo', 'mensal'], ['Ouro', 'mensal'], ['Essencial', 'semanal'], [undefined, 'mensal'], ['Essencial', undefined]]) assert.equal(priceCents(p, c), null);
    });
    test('getLimits não foi afetado pelo preço', () => assert.equal(getLimits({ plan_type: 'Essencial' }).assets, 50));
  });

  // =============== consulta ===============
  describe('GET /api/billing/subscription', () => {
    test('sem token -> 401', async () => assert.equal((await api('GET', '/api/billing/subscription')).status, 401));
    test('devolve estado, permissões e só os 3 planos vendáveis com preços do servidor', async () => {
      const t = await novoTenant({ plan: 'Essencial', status: 'Trial', trialDias: 5 });
      const r = await api('GET', '/api/billing/subscription', { token: await tokenOf(t) });
      assert.equal(r.status, 200);
      assert.equal(r.body.plan, 'Essencial');
      assert.equal(r.body.tenant_status, 'Trial');
      assert.equal(r.body.can_manage, true);
      assert.deepEqual(r.body.subscription, { status: null, cycle: null, current_period_end: null, cancel_at_period_end: false, has_customer: false, has_subscription: false });
      assert.deepEqual(r.body.available_plans.map((p) => [p.name, p.monthly, p.annual_total, p.annual_monthly_equivalent]),
        [['Essencial', 297, 2964, 247], ['Profissional', 697, 6972, 581], ['Industrial', 1697, 16968, 1414]]);
    });
    test('usuário comum vê o estado mas can_manage=false', async () => {
      const t = await novoTenant();
      const r = await api('GET', '/api/billing/subscription', { token: await login(t.opEmail) });
      assert.equal(r.status, 200);
      assert.equal(r.body.can_manage, false);
    });
    test('?tenant_id é ignorado para cliente; master consulta outro tenant', async () => {
      const a = await novoTenant({ plan: 'Essencial' });
      const b = await novoTenant({ plan: 'Industrial' });
      assert.equal((await api('GET', `/api/billing/subscription?tenant_id=${b.id}`, { token: await tokenOf(a) })).body.plan, 'Essencial');
      assert.equal((await api('GET', `/api/billing/subscription?tenant_id=${b.id}`, { token: await login('master@teste.com') })).body.plan, 'Industrial');
    });
  });

  // =============== contratar ===============
  describe('POST /api/billing/subscribe', () => {
    const assinar = (token, body, q = '') => api('POST', `/api/billing/subscribe${q}`, { token, body });
    const ultimo = () => calls.checkout[calls.checkout.length - 1];

    test('sem token -> 401; usuário comum -> 403 e nada vai ao Stripe', async () => {
      const t = await novoTenant();
      const antes = calls.checkout.length;
      assert.equal((await api('POST', '/api/billing/subscribe', { body: { plan: 'Essencial', cycle: 'mensal' } })).status, 401);
      assert.equal((await assinar(await login(t.opEmail), { plan: 'Essencial', cycle: 'mensal' })).status, 403);
      assert.equal(calls.checkout.length, antes);
    });

    test('plano/ciclo inválidos (incluindo Corporativo) -> 400', async () => {
      const t = await novoTenant();
      const token = await tokenOf(t);
      for (const body of [{ plan: 'Corporativo', cycle: 'mensal' }, { plan: 'Ouro', cycle: 'mensal' }, { plan: 'Essencial', cycle: 'semanal' }, { cycle: 'mensal' }, { plan: 'Essencial' }, {}, { plan: ['Essencial'], cycle: 'mensal' }]) {
        assert.equal((await assinar(token, body)).status, 400, JSON.stringify(body));
      }
    });

    for (const [plano, ciclo, centavos, intervalo] of [
      ['Essencial', 'mensal', 29700, 'month'], ['Essencial', 'anual', 296400, 'year'],
      ['Profissional', 'mensal', 69700, 'month'], ['Profissional', 'anual', 697200, 'year'],
      ['Industrial', 'mensal', 169700, 'month'], ['Industrial', 'anual', 1696800, 'year'],
    ]) {
      test(`${plano}/${ciclo}: envia ao Stripe R$ ${centavos / 100} (${intervalo}) com a identificação do tenant`, async () => {
        const t = await novoTenant();
        const r = await assinar(await tokenOf(t), { plan: plano, cycle: ciclo });
        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.equal(r.body.url, 'https://checkout.stripe.test/cs_fake');
        const c = ultimo();
        assert.equal(c.mode, 'subscription');
        assert.equal(c.line_items[0].price_data.unit_amount, centavos);
        assert.equal(c.line_items[0].price_data.currency, 'brl');
        assert.equal(c.line_items[0].price_data.recurring.interval, intervalo);
        assert.deepEqual(c.metadata, { tenant_id: t.id, plan: plano, cycle: ciclo });
        assert.deepEqual(c.subscription_data.metadata, { tenant_id: t.id, plan: plano, cycle: ciclo });
        assert.equal(c.client_reference_id, t.id);
        assert.equal(c.customer_email, `${t.id}@teste.com`);
        assert.equal(c.customer, undefined);
        assert.equal(c.allow_promotion_codes, true);
        assert.match(c.success_url, /\/settings\?billing=success$/);
      });
    }

    test('valor e tenant enviados pelo cliente são ignorados (nunca confia no corpo)', async () => {
      const a = await novoTenant();
      const b = await novoTenant();
      await assinar(await tokenOf(a), { plan: 'Essencial', cycle: 'mensal', amount: 1, price_cents: 1, unit_amount: 1, tenant_id: b.id, customer: 'cus_de_outro' }, `?tenant_id=${b.id}`);
      const c = ultimo();
      assert.equal(c.line_items[0].price_data.unit_amount, 29700);
      assert.equal(c.metadata.tenant_id, a.id);
      assert.equal(c.customer, undefined);
    });

    test('reaproveita o cliente do Stripe já vinculado (customer no lugar de customer_email)', async () => {
      const t = await novoTenant({ customer: 'cus_existente' });
      await assinar(await tokenOf(t), { plan: 'Essencial', cycle: 'mensal' });
      assert.equal(ultimo().customer, 'cus_existente');
      assert.equal(ultimo().customer_email, undefined);
    });

    test('mantém os dias de teste que sobram (trial_end); não envia se faltam menos de 49h ou se não está em teste', async () => {
      const tTeste = await novoTenant({ status: 'Trial', trialDias: 10 });
      await assinar(await tokenOf(tTeste), { plan: 'Profissional', cycle: 'mensal' });
      const fim = ultimo().subscription_data.trial_end;
      assert.ok(Math.abs(fim - (Math.floor(Date.now() / 1000) + 10 * 86400)) < 120, 'trial_end ~ daqui a 10 dias');

      const curto = await novoTenant({ status: 'Trial', trialDias: 1 });
      await assinar(await tokenOf(curto), { plan: 'Profissional', cycle: 'mensal' });
      assert.equal(ultimo().subscription_data.trial_end, undefined);

      const ativo = await novoTenant({ status: 'Ativo' });
      await assinar(await tokenOf(ativo), { plan: 'Profissional', cycle: 'mensal' });
      assert.equal(ultimo().subscription_data.trial_end, undefined);
    });

    test('já assinante (active/trialing/past_due/unpaid) -> 409 ALREADY_SUBSCRIBED e nada vai ao Stripe', async () => {
      for (const st of ['active', 'trialing', 'past_due', 'unpaid']) {
        const t = await novoTenant({ customer: `cus_${st}`, subscription: `sub_${st}`, subStatus: st });
        const antes = calls.checkout.length;
        const r = await assinar(await tokenOf(t), { plan: 'Industrial', cycle: 'anual' });
        assert.equal(r.status, 409, st);
        assert.equal(r.body.code, 'ALREADY_SUBSCRIBED');
        assert.equal(calls.checkout.length, antes);
      }
    });

    test('assinatura encerrada (canceled) permite contratar de novo', async () => {
      const t = await novoTenant({ customer: 'cus_c', subscription: 'sub_c', subStatus: 'canceled', status: 'Ativo' });
      assert.equal((await assinar(await tokenOf(t), { plan: 'Essencial', cycle: 'mensal' })).status, 200);
    });

    test('master contrata para um cliente com ?tenant_id', async () => {
      const t = await novoTenant();
      const r = await assinar(await login('master@teste.com'), { plan: 'Essencial', cycle: 'mensal' }, `?tenant_id=${t.id}`);
      assert.equal(r.status, 200);
      assert.equal(ultimo().metadata.tenant_id, t.id);
    });

    test('falha do Stripe -> 500 genérico, sem vazar a mensagem do erro', async () => {
      const t = await novoTenant();
      falha = true;
      try {
        const r = await assinar(await tokenOf(t), { plan: 'Essencial', cycle: 'mensal' });
        assert.equal(r.status, 500);
      } finally { falha = false; }
    });
  });

  // =============== portal ===============
  describe('POST /api/billing/portal', () => {
    test('sem cliente no Stripe -> 400; usuário comum -> 403; sem token -> 401', async () => {
      const t = await novoTenant();
      assert.equal((await api('POST', '/api/billing/portal', { token: await tokenOf(t) })).status, 400);
      assert.equal((await api('POST', '/api/billing/portal', { token: await login(t.opEmail) })).status, 403);
      assert.equal((await api('POST', '/api/billing/portal')).status, 401);
    });
    test('com cliente: abre o portal do cliente DO TENANT (não aceita customer do corpo)', async () => {
      const t = await novoTenant({ customer: 'cus_portal' });
      const r = await api('POST', '/api/billing/portal', { token: await tokenOf(t), body: { customer: 'cus_de_outro' } });
      assert.equal(r.status, 200);
      assert.equal(r.body.url, 'https://billing.stripe.test/portal');
      assert.equal(calls.portal[calls.portal.length - 1].customer, 'cus_portal');
    });
  });

  // =============== acesso restrito de faturamento ===============
  describe('token restrito de faturamento (teste vencido / pagamento pendente)', () => {
    const barrado = ['/api/equipments', '/api/users', '/api/plan', '/api/work-orders', '/api/inventory', '/api/tenants', '/api/admin/tenants', '/api/repairs'];

    test('teste vencido: administrador recebe 403 TRIAL_EXPIRED + billing_token de escopo "billing" (30 min)', async () => {
      const t = await novoTenant({ status: 'Trial', trialDias: -1 });
      const r = await tentarLogin(t.email);
      assert.equal(r.status, 403);
      assert.equal(r.body.code, 'TRIAL_EXPIRED');
      const dec = jwt.decode(r.body.billing_token);
      assert.equal(dec.scope, 'billing');
      assert.equal(dec.tenant_id, t.id);
      assert.ok(dec.exp - dec.iat <= 30 * 60);
    });

    test('inadimplente (PAST_DUE) também recebe; cancelado (CANCELED) e usuário comum NÃO recebem', async () => {
      const inad = await novoTenant({ status: 'Inadimplente' });
      const r1 = await tentarLogin(inad.email);
      assert.equal(r1.body.code, 'PAST_DUE');
      assert.ok(r1.body.billing_token);
      assert.equal((await tentarLogin(inad.opEmail)).body.billing_token, undefined);

      const canc = await novoTenant({ status: 'Cancelado' });
      const r2 = await tentarLogin(canc.email);
      assert.equal(r2.body.code, 'CANCELED');
      assert.equal(r2.body.billing_token, undefined);

      const vencido = await novoTenant({ status: 'Trial', trialDias: -1 });
      assert.equal((await tentarLogin(vencido.opEmail)).body.billing_token, undefined);
    });

    test('senha errada nunca recebe token', async () => {
      const t = await novoTenant({ status: 'Trial', trialDias: -1 });
      const r = await api('POST', '/api/login', { body: { email: t.email, password: 'errada' } });
      assert.equal(r.status, 401);
      assert.equal(r.body.billing_token, undefined);
    });

    test('o token de faturamento abre consulta, assinatura e portal', async () => {
      const t = await novoTenant({ status: 'Trial', trialDias: -1, customer: 'cus_gate' });
      const token = (await tentarLogin(t.email)).body.billing_token;
      assert.equal((await api('GET', '/api/billing/subscription', { token })).status, 200);
      assert.equal((await api('POST', '/api/billing/subscribe', { token, body: { plan: 'Essencial', cycle: 'mensal' } })).status, 200);
      assert.equal((await api('POST', '/api/billing/portal', { token })).status, 200);
    });

    test('o token de faturamento é recusado em todo o resto do sistema (403)', async () => {
      const t = await novoTenant({ status: 'Trial', trialDias: -1 });
      const token = (await tentarLogin(t.email)).body.billing_token;
      for (const url of barrado) assert.equal((await api('GET', url, { token })).status, 403, url);
      assert.equal((await api('POST', '/api/equipments', { token, body: { name: 'x' } })).status, 403);
      assert.equal((await api('POST', '/api/equipments/import', { token, body: { rows: [{ name: 'x' }] } })).status, 403);
      assert.equal((await api('POST', '/api/billing/checkout', { token, body: {} })).status, 403);
      assert.equal((await api('PUT', `/api/admin/tenants/${t.id}/contract`, { token, body: { plan_type: 'Corporativo' } })).status, 403);
    });

    test('o token de faturamento não pode agir sobre outro tenant (?tenant_id ignorado)', async () => {
      const t = await novoTenant({ status: 'Trial', trialDias: -1 });
      const outro = await novoTenant({ plan: 'Industrial' });
      const token = (await tentarLogin(t.email)).body.billing_token;
      const r = await api('GET', `/api/billing/subscription?tenant_id=${outro.id}`, { token });
      assert.equal(r.body.tenant_status, 'Trial');
      await api('POST', `/api/billing/subscribe?tenant_id=${outro.id}`, { token, body: { plan: 'Essencial', cycle: 'mensal', tenant_id: outro.id } });
      assert.equal(calls.checkout[calls.checkout.length - 1].metadata.tenant_id, t.id);
    });
  });

  // =============== webhook: ciclo de vida da assinatura ===============
  describe('webhook de assinatura', () => {
    test('assinatura inválida -> 400 e nada muda', async () => {
      const t = await novoTenant({ status: 'Trial', trialDias: 3 });
      assert.equal((await enviar('customer.subscription.updated', assinatura(t), { ruim: true })).status, 400);
      assert.equal((await tenantRow(t.id)).status, 'Trial');
    });

    test('assinatura ativa: libera o tenant e grava plano, ciclo, valores e datas', async () => {
      const t = await novoTenant({ plan: 'Essencial', status: 'Trial', trialDias: 3 });
      const r = await enviar('customer.subscription.created', assinatura(t));
      assert.equal(r.status, 200);
      const row = await tenantRow(t.id);
      assert.equal(row.status, 'Ativo');
      assert.equal(row.plan_type, 'Profissional');
      assert.equal(row.subscription_status, 'active');
      assert.equal(row.billing_cycle, 'mensal');
      assert.equal(row.stripe_customer_id, `cus_${t.id}`);
      assert.equal(row.stripe_subscription_id, `sub_${t.id}`);
      assert.equal(Number(row.valor_mensal), 697);
      assert.equal(row.renovacao_auto, 1);
      assert.ok(row.current_period_end && row.contrato_fim);
      assert.equal(Number(row.subscription_event_at), r.evento.created);
      assert.equal((await tentarLogin(t.email)).status, 200, 'e o login volta a funcionar');
    });

    test('anual: ciclo vem do intervalo do preço e o valor mensal equivalente é o do site', async () => {
      const t = await novoTenant({ plan: 'Essencial' });
      const sub = assinatura(t, { items: { data: [{ current_period_end: base + 365 * 86400, price: { recurring: { interval: 'year' } } }] }, metadata: { tenant_id: t.id, plan: 'Industrial', cycle: 'mensal' } });
      await enviar('customer.subscription.updated', sub);
      const row = await tenantRow(t.id);
      assert.equal(row.billing_cycle, 'anual', 'o intervalo real do preço vence a metadata');
      assert.equal(Number(row.valor_mensal), 1414);
    });

    test('lê current_period_end tanto no formato novo (itens) quanto no antigo (raiz)', async () => {
      const antigo = await novoTenant();
      await enviar('customer.subscription.updated', assinatura(antigo, { current_period_end: base + 10 * 86400, items: { data: [{ price: { recurring: { interval: 'month' } } }] } }));
      const novo = await novoTenant();
      await enviar('customer.subscription.updated', assinatura(novo, { id: 'sub_periodo', customer: 'cus_periodo' }));
      for (const t of [antigo, novo]) assert.ok((await tenantRow(t.id)).current_period_end, t.id);
    });

    test('cancelamento agendado: segue ativo, renovação automática desligada', async () => {
      const t = await novoTenant();
      await enviar('customer.subscription.updated', assinatura(t, { cancel_at_period_end: true }));
      const row = await tenantRow(t.id);
      assert.equal(row.status, 'Ativo');
      assert.equal(row.cancel_at_period_end, 1);
      assert.equal(row.renovacao_auto, 0);
    });

    test('past_due mantém o acesso (carência) e registra o status', async () => {
      const t = await novoTenant();
      await enviar('customer.subscription.updated', assinatura(t, { status: 'past_due' }));
      const row = await tenantRow(t.id);
      assert.equal(row.status, 'Ativo');
      assert.equal(row.subscription_status, 'past_due');
    });

    test('unpaid bloqueia (PAST_DUE) e voltar a active libera de novo', async () => {
      const t = await novoTenant();
      await enviar('customer.subscription.updated', assinatura(t, { status: 'unpaid' }));
      assert.equal((await tenantRow(t.id)).status, 'Inadimplente');
      assert.equal((await tentarLogin(t.email)).body.code, 'PAST_DUE');
      await enviar('customer.subscription.updated', assinatura(t, { status: 'active' }));
      assert.equal((await tenantRow(t.id)).status, 'Ativo');
      assert.equal((await tentarLogin(t.email)).status, 200);
    });

    test('canceled/deleted bloqueia como Cancelado', async () => {
      const t = await novoTenant();
      await enviar('customer.subscription.updated', assinatura(t));
      await enviar('customer.subscription.deleted', assinatura(t, { status: 'canceled' }));
      const row = await tenantRow(t.id);
      assert.equal(row.status, 'Cancelado');
      assert.equal(row.subscription_status, 'canceled');
      assert.equal((await tentarLogin(t.email)).body.code, 'CANCELED');
    });

    test('incomplete (1ª cobrança pendente) não libera nem bloqueia: continua em teste', async () => {
      const t = await novoTenant({ status: 'Trial', trialDias: 5 });
      await enviar('customer.subscription.created', assinatura(t, { status: 'incomplete' }));
      const row = await tenantRow(t.id);
      assert.equal(row.status, 'Trial');
      assert.equal(row.subscription_status, 'incomplete');
    });

    test('plano inválido na metadata (Corporativo/inexistente) não altera o plano, mas o status é aplicado', async () => {
      for (const plano of ['Corporativo', 'Hack', undefined]) {
        const t = await novoTenant({ plan: 'Essencial', status: 'Trial', trialDias: 3 });
        await enviar('customer.subscription.updated', assinatura(t, { metadata: { tenant_id: t.id, plan: plano } }));
        const row = await tenantRow(t.id);
        assert.equal(row.plan_type, 'Essencial', String(plano));
        assert.equal(row.status, 'Ativo');
      }
    });

    test('evento fora de ordem (mais antigo que o já aplicado) é ignorado', async () => {
      const t = await novoTenant();
      await enviar('customer.subscription.updated', assinatura(t, { status: 'active' }), { created: base + 1000 });
      await enviar('customer.subscription.updated', assinatura(t, { status: 'unpaid' }), { created: base + 500 });
      const row = await tenantRow(t.id);
      assert.equal(row.subscription_status, 'active');
      assert.equal(row.status, 'Ativo');
    });

    test('evento repetido (mesmo id) só é aplicado uma vez', async () => {
      const t = await novoTenant();
      const id = `evt_dup_${seq}_${Math.random()}`;
      assert.equal((await enviar('customer.subscription.updated', assinatura(t), { id })).status, 200);
      await admin.query('UPDATE tenants SET status = "Cancelado" WHERE id = ?', [t.id]); // alteração manual depois
      const rep = await enviar('customer.subscription.updated', assinatura(t), { id });
      assert.equal(rep.status, 200);
      assert.equal((await tenantRow(t.id)).status, 'Cancelado', 'o reenvio não pode desfazer a alteração');
      assert.equal(await count('SELECT COUNT(*) n FROM stripe_events WHERE id = ?', [id]), 1);
    });

    test('tenant desconhecido ou sem tenant_id: confirma (200) e não grava nada', async () => {
      const t = await novoTenant();
      assert.equal((await enviar('customer.subscription.updated', assinatura({ id: 'nao-existe' }))).status, 200);
      assert.equal((await enviar('customer.subscription.updated', assinatura(t, { metadata: {} }))).status, 200);
      assert.equal((await tenantRow(t.id)).subscription_status, null);
    });

    test('cliente do Stripe diferente do já vinculado ao tenant é ignorado', async () => {
      const t = await novoTenant({ plan: 'Essencial', customer: 'cus_dono', status: 'Trial', trialDias: 2 });
      await enviar('customer.subscription.updated', assinatura(t, { customer: 'cus_intruso' }));
      const row = await tenantRow(t.id);
      assert.equal(row.stripe_customer_id, 'cus_dono');
      assert.equal(row.plan_type, 'Essencial');
      assert.equal(row.status, 'Trial');
    });

    test('um tenant não adota o cliente do Stripe que já é de outro tenant', async () => {
      const dono = await novoTenant({ customer: 'cus_compartilhado', plan: 'Industrial' });
      const outro = await novoTenant({ plan: 'Essencial', status: 'Trial', trialDias: 2 });
      await enviar('customer.subscription.updated', assinatura(outro, { customer: 'cus_compartilhado' }));
      const row = await tenantRow(outro.id);
      assert.equal(row.stripe_customer_id, null);
      assert.equal(row.plan_type, 'Essencial');
      assert.equal((await tenantRow(dono.id)).plan_type, 'Industrial');
    });

    test('evento da assinatura ANTIGA não cancela quem já contratou outra', async () => {
      const t = await novoTenant();
      await enviar('customer.subscription.updated', assinatura(t, { id: 'sub_nova' }));
      await enviar('customer.subscription.deleted', assinatura(t, { id: 'sub_velha', status: 'canceled' }));
      const row = await tenantRow(t.id);
      assert.equal(row.stripe_subscription_id, 'sub_nova');
      assert.equal(row.status, 'Ativo');
    });

    test('assinatura nova substitui a anterior quando esta já foi encerrada', async () => {
      const t = await novoTenant({ customer: `cus_subst`, subscription: 'sub_velha', subStatus: 'canceled', status: 'Cancelado' });
      await enviar('customer.subscription.created', assinatura(t, { id: 'sub_nova', customer: 'cus_subst' }));
      const row = await tenantRow(t.id);
      assert.equal(row.stripe_subscription_id, 'sub_nova');
      assert.equal(row.status, 'Ativo');
    });

    test('checkout.session.completed de assinatura vincula cliente e assinatura (sem liberar acesso sozinho)', async () => {
      const t = await novoTenant({ status: 'Trial', trialDias: 3 });
      await enviar('checkout.session.completed', { id: 'cs_1', mode: 'subscription', payment_status: 'paid', customer: 'cus_novo', subscription: 'sub_novo', client_reference_id: t.id, metadata: { tenant_id: t.id } });
      const row = await tenantRow(t.id);
      assert.equal(row.stripe_customer_id, 'cus_novo');
      assert.equal(row.stripe_subscription_id, 'sub_novo');
      assert.equal(row.status, 'Trial', 'o acesso só muda no evento da assinatura');
    });

    test('checkout de assinatura não é confundido com pagamento de fatura avulsa', async () => {
      const t = await novoTenant();
      const [fat] = await admin.query('INSERT INTO invoices (tenant_id, valor, vencimento, mes_ref) VALUES (?, 150, CURRENT_DATE, "01/2026")', [t.id]);
      await enviar('checkout.session.completed', { id: 'cs_2', mode: 'subscription', payment_status: 'paid', amount_total: 15000, customer: 'cus_x', subscription: 'sub_x', metadata: { tenant_id: t.id, invoice_id: String(fat.insertId) } });
      assert.equal((await admin.query('SELECT status FROM invoices WHERE id = ?', [fat.insertId]))[0][0].status, 'Pendente');
    });
  });

  // =============== webhook: faturas pagas ===============
  describe('webhook invoice.paid', () => {
    const fatura = (over = {}) => ({ id: `in_${++seq}`, customer: 'cus_inv', amount_paid: 69700, created: base, status_transitions: { paid_at: base }, ...over });

    test('registra a cobrança na tabela de faturas como Paga, uma única vez por fatura do Stripe', async () => {
      const t = await novoTenant({ customer: 'cus_inv' });
      const f = fatura();
      await enviar('invoice.paid', f);
      await enviar('invoice.payment_succeeded', f); // outro evento da mesma fatura
      const [rows] = await admin.query('SELECT * FROM invoices WHERE tenant_id = ?', [t.id]);
      assert.equal(rows.length, 1);
      assert.equal(Number(rows[0].valor), 697);
      assert.equal(rows[0].status, 'Paga');
      assert.equal(rows[0].stripe_invoice_id, f.id);
      assert.match(rows[0].mes_ref, /^\d{2}\/\d{4}$/);
    });

    test('fatura de R$ 0 (início do teste) não é registrada', async () => {
      const t = await novoTenant({ customer: 'cus_zero' });
      await enviar('invoice.paid', fatura({ customer: 'cus_zero', amount_paid: 0 }));
      assert.equal(await count('SELECT COUNT(*) n FROM invoices WHERE tenant_id = ?', [t.id]), 0);
    });

    test('se o cliente ainda não foi vinculado, usa a metadata da assinatura para achar o tenant', async () => {
      const t = await novoTenant();
      await enviar('invoice.paid', fatura({ customer: 'cus_ainda_nao', parent: { subscription_details: { metadata: { tenant_id: t.id } } } }));
      assert.equal(await count('SELECT COUNT(*) n FROM invoices WHERE tenant_id = ?', [t.id]), 1);
    });

    test('fatura de cliente desconhecido: confirma (200) e não grava', async () => {
      const antes = await count('SELECT COUNT(*) n FROM invoices');
      assert.equal((await enviar('invoice.paid', fatura({ customer: 'cus_ninguem' }))).status, 200);
      assert.equal(await count('SELECT COUNT(*) n FROM invoices'), antes);
    });

    test('invoice.payment_failed só registra em log: o acesso muda pelo evento da assinatura', async () => {
      const t = await novoTenant({ customer: 'cus_falha' });
      assert.equal((await enviar('invoice.payment_failed', fatura({ customer: 'cus_falha' }))).status, 200);
      assert.equal((await tenantRow(t.id)).status, 'Ativo');
    });
  });
});

describe('proteção contra força bruta (rodar por último)', () => {
  test('a 11ª tentativa de login falha com 429', async () => {
    process.env.DISABLE_RATE_LIMIT = '0'; // reativa o limitador, desligado no resto da suíte
    try {
      let ultimo;
      for (let i = 0; i < 11; i++) {
        ultimo = await api('POST', '/api/login', { body: { email: 'admin-a@teste.com', password: 'errada' } });
      }
      assert.equal(ultimo.status, 429);
    } finally { process.env.DISABLE_RATE_LIMIT = '1'; }
  });
});
