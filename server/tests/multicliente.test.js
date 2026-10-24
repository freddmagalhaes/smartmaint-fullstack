const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setupDatabase, getApp, login, api, teardown, request } = require('./helpers');

let tokens = {};
let db;
let acmeUnitId;

before(async () => {
  await setupDatabase();
  db = require('../db');
  for (const [key, email] of [['root', 'root@test.com'], ['admin', 'admin@acme.com'], ['gerente', 'gerente@acme.com'], ['user', 'user@acme.com'], ['globex', 'admin@globex.com']]) {
    tokens[key] = await login(email);
  }
  [[{ id: acmeUnitId }]] = await db.query("SELECT id FROM units WHERE tenant_id = 'acme'");
});

after(teardown);

describe('unidades fabris', () => {
  let segundaUnidade;

  it('administrador cria unidade e equipamento nela; filtro por unidade funciona', async () => {
    const admin = api(tokens.admin);
    const unit = await admin.post('/api/units').send({ name: 'Planta Betim', code: 'BET' });
    assert.equal(unit.status, 201);
    segundaUnidade = unit.body.id;

    const eq = await admin.post('/api/equipments').send({ name: 'Torno Betim', unit_id: segundaUnidade });
    assert.equal(eq.status, 201);

    const filtrado = await admin.get(`/api/equipments?unit_id=${segundaUnidade}`);
    assert.deepEqual(filtrado.body.items.map((e) => e.name), ['Torno Betim']);
    assert.equal(filtrado.body.items[0].unit_name, 'Planta Betim');
  });

  it('equipamento sem unit_id vai para a unidade padrão', async () => {
    const eq = await api(tokens.admin).post('/api/equipments').send({ name: 'Bomba sem unidade' });
    assert.equal(eq.status, 201);
    assert.equal(eq.body.unit_id, acmeUnitId);
  });

  it('não aceita unidade de outro cliente', async () => {
    const [[{ id: globexUnit }]] = await db.query("SELECT id FROM units WHERE tenant_id = 'globex'");
    const res = await api(tokens.admin).post('/api/equipments').send({ name: 'Invasor', unit_id: globexUnit });
    assert.equal(res.status, 400);
  });

  it('não exclui unidade com equipamentos nem a última unidade', async () => {
    assert.equal((await api(tokens.admin).delete(`/api/units/${segundaUnidade}`)).status, 409);
    const [[{ id: globexUnit }]] = await db.query("SELECT id FROM units WHERE tenant_id = 'globex'");
    assert.equal((await api(tokens.globex).delete(`/api/units/${globexUnit}`)).status, 400);
  });

  it('gerente não gerencia unidades', async () => {
    assert.equal((await api(tokens.gerente).post('/api/units').send({ name: 'X' })).status, 403);
    assert.equal((await api(tokens.gerente).get('/api/units')).status, 200);
  });

  it('novo cliente já nasce com a unidade padrão', async () => {
    await api(tokens.root).post('/api/admin/tenants').send({ id: 'novo', name: 'Novo', contact_email: 'ti@novo.com' });
    const [rows] = await db.query("SELECT name FROM units WHERE tenant_id = 'novo'");
    assert.deepEqual(rows.map((r) => r.name), ['Unidade Principal']);
  });
});

describe('paginação, busca e filtros', () => {
  before(async () => {
    const [[eq]] = await db.query("SELECT id FROM equipments WHERE name = 'Compressor ACME'");
    const values = Array.from({ length: 55 }, (_, i) => `('acme', ${eq.id}, 'OS ${i + 1}', 'Corretiva', '${i === 0 ? 'Crítica' : 'Baixa'}', '${i % 2 ? 'Concluída' : 'Aberta'}', CURRENT_DATE)`);
    await db.query(`INSERT INTO work_orders (tenant_id, equipment_id, titulo, tipo, prioridade, status, data_criacao) VALUES ${values.join(',')}`);
  });

  it('pagina com total, page e pageSize', async () => {
    const p1 = await api(tokens.admin).get('/api/work-orders?pageSize=20');
    assert.equal(p1.body.total, 55);
    assert.equal(p1.body.items.length, 20);
    const p3 = await api(tokens.admin).get('/api/work-orders?pageSize=20&page=3');
    assert.equal(p3.body.items.length, 15);
  });

  it('limita o tamanho máximo da página', async () => {
    assert.equal((await api(tokens.admin).get('/api/work-orders?pageSize=10000')).status, 400);
  });

  it('filtra por status "abertas" e ordena as críticas primeiro', async () => {
    const res = await api(tokens.admin).get('/api/work-orders?status=abertas');
    assert.equal(res.body.total, 28);
    assert.equal(res.body.items[0].prioridade, 'Crítica');
    assert.ok(res.body.items.every((o) => o.status !== 'Concluída'));
  });

  it('busca por texto escapa curingas do LIKE', async () => {
    assert.equal((await api(tokens.admin).get('/api/work-orders?q=OS%201')).body.total, 11); // OS 1, OS 10..19
    assert.equal((await api(tokens.admin).get('/api/work-orders?q=%25')).body.total, 0);
  });

  it('lista de opções de equipamentos é enxuta e inclui contagem de falhas', async () => {
    const res = await api(tokens.user).get('/api/equipments/options');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.deepEqual(Object.keys(res.body[0]).sort(), ['failures_count', 'id', 'name', 'total_op_time', 'unit_id']);
  });
});

describe('dashboard calculado no servidor', () => {
  it('retorna totais e série mensal', async () => {
    const [[eq]] = await db.query("SELECT id FROM equipments WHERE name = 'Compressor ACME'");
    await db.query("UPDATE equipments SET total_op_time = 1000 WHERE id = ?", [eq.id]);
    await db.query("INSERT INTO failures (tenant_id, equipment_id, descricao, tempo_operacao, data_falha) VALUES ('acme', ?, 'x', 500, CURRENT_DATE)", [eq.id]);
    await db.query("INSERT INTO repairs (tenant_id, equipment_id, tipo, tempo_reparo, data_reparo) VALUES ('acme', ?, 'Corretiva', 2.5, CURRENT_DATE)", [eq.id]);

    const res = await api(tokens.gerente).get('/api/dashboard/summary');
    assert.equal(res.status, 200);
    assert.equal(res.body.total_op_time, 1000);
    assert.equal(res.body.failures, 1);
    assert.equal(res.body.repair_hours, 2.5);
    assert.equal(res.body.work_orders['Aberta'], 28);
    assert.equal(res.body.critical_open, 1);
    const month = new Date().toISOString().slice(0, 7);
    assert.equal(res.body.monthly.failures[month], 1);
    assert.equal(res.body.top_open_assets[0].name, 'Compressor ACME');

    // usuário operacional não vê indicadores
    assert.equal((await api(tokens.user).get('/api/dashboard/summary')).status, 403);
  });
});

describe('limites por plano', () => {
  it('bloqueia criação acima do limite e informa o plano', async () => {
    await db.query("UPDATE tenants SET plan_type = 'Starter' WHERE id = 'globex'");
    await db.query("UPDATE plans SET max_users = 1 WHERE id = 'Starter'"); // globex já tem 1 usuário
    const res = await api(tokens.globex).post('/api/users').send({ name: 'X', email: 'x@globex.com', role: 'Usuário' });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'PLAN_LIMIT');
    assert.match(res.body.error, /Starter/);
  });

  it('limite nulo significa ilimitado e Root edita os limites', async () => {
    assert.equal((await api(tokens.admin).put('/api/admin/plans/Starter').send({ max_users: null })).status, 403);
    assert.equal((await api(tokens.root).put('/api/admin/plans/Starter').send({ max_users: null, price_monthly: 199.9 })).status, 200);
    const res = await api(tokens.globex).post('/api/users').send({ name: 'X', email: 'x@globex.com', role: 'Usuário' });
    assert.equal(res.status, 201);
  });

  it('administrador consulta uso e limites', async () => {
    const res = await api(tokens.globex).get('/api/billing/usage');
    assert.equal(res.body.plan.id, 'Starter');
    assert.equal(res.body.usage.users.used, 2);
    assert.equal(res.body.usage.users.limit, null);
    assert.equal(res.body.usage.units.limit, 1);
  });

  it('limite de unidades do plano é aplicado', async () => {
    const res = await api(tokens.globex).post('/api/units').send({ name: 'Segunda' });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'PLAN_LIMIT');
  });
});

describe('auditoria', () => {
  it('registra login, criação e alteração com usuário e sem senha', async () => {
    const admin = api(tokens.admin);
    const created = await admin.post('/api/users').send({ name: 'Auditado', email: 'auditado@acme.com', role: 'Usuário', password: 'Senha-auditada-1' });
    await admin.put(`/api/users/${created.body.id}`).send({ role: 'Gerente' });

    const res = await admin.get('/api/audit?entity=user');
    assert.equal(res.status, 200);
    const actions = res.body.items.map((a) => a.action);
    assert.ok(actions.includes('create') && actions.includes('update') && actions.includes('login'));
    const createdLog = res.body.items.find((a) => a.action === 'create' && a.entity_id === String(created.body.id));
    assert.equal(createdLog.user_name, 'Admin ACME');
    assert.equal(createdLog.changes.email, 'auditado@acme.com');
    assert.equal(JSON.stringify(createdLog).includes('Senha-auditada-1'), false);
  });

  it('cada cliente só vê o próprio log; gerente não vê', async () => {
    const globex = await api(tokens.globex).get('/api/audit');
    assert.ok(globex.body.items.every((a) => a.tenant_id === 'globex'));
    assert.equal((await api(tokens.gerente).get('/api/audit')).status, 403);
    const root = await api(tokens.root).get('/api/audit?scope=backoffice');
    assert.ok(root.body.items.every((a) => a.tenant_id === null));
  });

  it('tentativa de login com senha errada fica registrada', async () => {
    await request(getApp()).post('/api/login').send({ email: 'user@acme.com', password: 'errada' });
    const res = await api(tokens.admin).get('/api/audit?entity=user');
    assert.ok(res.body.items.some((a) => a.action === 'login_failed'));
  });
});

describe('observabilidade', () => {
  it('toda resposta traz X-Request-Id e reaproveita o recebido', async () => {
    const res = await request(getApp()).get('/api/health').set('X-Request-Id', 'abc12345-teste');
    assert.equal(res.headers['x-request-id'], 'abc12345-teste');
    const gerado = await request(getApp()).get('/api/health');
    assert.match(gerado.headers['x-request-id'], /^[0-9a-f-]{36}$/);
  });
});

describe('preparação da NFS-e', () => {
  it('fatura paga entra na fila de NFS-e uma única vez', async () => {
    const [inv] = await db.query("INSERT INTO invoices (tenant_id, valor, vencimento, status, mes_ref) VALUES ('acme', 299.9, CURRENT_DATE, 'Pendente', '10/2026')");
    const root = api(tokens.root);
    assert.equal((await root.put(`/api/admin/invoices/${inv.insertId}/status`).send({ status: 'Paga' })).status, 200);
    assert.equal((await root.put(`/api/admin/invoices/${inv.insertId}/status`).send({ status: 'Paga' })).status, 200);
    const list = await root.get('/api/admin/nfse?status=Pendente');
    const notas = list.body.items.filter((n) => n.invoice_id === inv.insertId);
    assert.equal(notas.length, 1);
    assert.equal(Number(notas[0].valor), 299.9);
  });

  it('painel fiscal mostra o que falta e salva os dados do prestador', async () => {
    const root = api(tokens.root);
    const before = await root.get('/api/admin/fiscal');
    assert.equal(before.body.readiness.ready, false);
    assert.ok(before.body.readiness.checks.some((c) => /Certificado A1 não configurado/.test(c.item)));

    const res = await root.put('/api/admin/fiscal').send({ cnpj: '12.345.678/0001-90', municipio_ibge: '3162955', aliquota_iss: 2 });
    assert.equal(res.status, 200);
    assert.equal(res.body.settings.cnpj, '12345678000190');
    assert.equal((await api(tokens.admin).get('/api/admin/fiscal')).status, 403);
  });

  it('cliente informa dados cadastrais para a nota (tomador)', async () => {
    const res = await api(tokens.admin).put('/api/tenant').send({ razao_social: 'ACME Indústria Ltda', cnpj: '11.222.333/0001-81', cep: '33350-000', uf: 'mg' });
    assert.equal(res.status, 200);
    const [[t]] = await db.query("SELECT cnpj, cep, uf FROM tenants WHERE id = 'acme'");
    assert.deepEqual({ ...t }, { cnpj: '11222333000181', cep: '33350000', uf: 'MG' });
  });
});
