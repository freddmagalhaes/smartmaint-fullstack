const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setupDatabase, login, api, teardown } = require('./helpers');

let db;
let admin;
let gerente;
let equipmentId;
const PERIOD = '?from=2030-03-01&to=2030-03-31';

before(async () => {
  await setupDatabase();
  db = require('../db');
  admin = await login('admin@acme.com');
  gerente = await login('gerente@acme.com');

  // Dados conhecidos para conferir cada indicador do relatório
  [[{ id: equipmentId }]] = await db.query("SELECT id FROM equipments WHERE tenant_id = 'acme'");
  await db.query('UPDATE equipments SET total_op_time = 1000 WHERE id = ?', [equipmentId]);
  const os = async (tipo, prioridade, status, criada, concluida = null, tempo = null) => {
    const [r] = await db.query(
      'INSERT INTO work_orders (tenant_id, equipment_id, titulo, tipo, prioridade, status, data_criacao, data_conclusao, tempo_reparo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['acme', equipmentId, `${tipo} ${criada}`, tipo, prioridade, status, criada, concluida, tempo]
    );
    return r.insertId;
  };
  const corretiva = await os('Corretiva', 'Alta', 'Concluída', '2030-03-02', '2030-03-04', 3);
  await os('Preventiva', 'Média', 'Concluída', '2030-03-10', '2030-03-10', 1);
  await os('Preventiva', 'Média', 'Aberta', '2030-03-20');
  await os('Corretiva', 'Crítica', 'Aberta', '2030-04-05'); // fora do período
  for (const data of ['2030-03-01', '2030-03-15', '2029-12-01']) {
    await db.query("INSERT INTO failures (tenant_id, equipment_id, descricao, tempo_operacao, data_falha) VALUES ('acme', ?, 'Vazamento', 100, ?)", [equipmentId, data]);
  }
  await db.query("INSERT INTO repairs (tenant_id, equipment_id, tipo, tempo_reparo, data_reparo, work_order_id) VALUES ('acme', ?, 'Corretiva', 3, '2030-03-04', ?), ('acme', ?, 'Preventiva', 1, '2030-03-16', NULL)", [equipmentId, corretiva, equipmentId]);
  await db.query("INSERT INTO work_order_parts (tenant_id, work_order_id, item_name, quantity, unit_price, created_at) VALUES ('acme', ?, 'Filtro de ar', 2, 50, '2030-03-04 10:00:00')", [corretiva]);
  await db.query("INSERT INTO preventive_plans (tenant_id, equipment_id, title, interval_days, next_due, status) VALUES ('acme', ?, 'Troca de óleo', 30, '2000-01-01', 'Ativo')", [equipmentId]);
});

after(teardown);

describe('relatório gerencial', () => {
  it('resume O.S., preventivas e custos do período', async () => {
    const res = await api(admin).get(`/api/reports/overview${PERIOD}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const r = res.body;
    assert.deepEqual(r.period, { from: '2030-03-01', to: '2030-03-31', unit_id: null });
    assert.equal(r.work_orders.total, 3);
    assert.deepEqual(r.work_orders.by_type, { Corretiva: 1, Preventiva: 2 });
    assert.equal(r.work_orders.concluded_in_period, 2);
    assert.equal(r.work_orders.avg_resolution_days, 1);
    assert.equal(r.work_orders.open_now, 2);
    assert.deepEqual(r.preventive, { scheduled: 2, completed: 1, compliance: 0.5, overdue_plans: 1 });
    assert.equal(r.costs.parts_total, 100);
    assert.deepEqual(r.costs.by_month, [{ month: '2030-03', cost: 100 }]);
  });

  it('indicadores por equipamento', async () => {
    const { body } = await api(gerente).get(`/api/reports/overview${PERIOD}`);
    const e = body.equipments.find((x) => x.id === equipmentId);
    assert.equal(e.failures, 2, 'só as falhas do período');
    assert.equal(e.repairs, 2);
    assert.equal(e.repair_hours, 4);
    assert.equal(e.mttr, 2);
    assert.ok(Math.abs(e.mtbf - 1000 / 3) < 0.01, 'MTBF acumulado: horas ÷ todas as falhas');
    assert.ok(Math.abs(e.availability - (1000 / 3) / (1000 / 3 + 2)) < 0.0001);
    assert.equal(e.work_orders, 3);
    assert.equal(e.parts_cost, 100);
  });

  it('sem horas de operação, MTBF e disponibilidade ficam vazios', async () => {
    await db.query('UPDATE equipments SET total_op_time = 0 WHERE id = ?', [equipmentId]);
    const { body } = await api(admin).get(`/api/reports/overview${PERIOD}`);
    const e = body.equipments.find((x) => x.id === equipmentId);
    assert.equal(e.mtbf, null);
    assert.equal(e.availability, null);
    await db.query('UPDATE equipments SET total_op_time = 1000 WHERE id = ?', [equipmentId]);
  });

  it('filtra por unidade', async () => {
    const [r] = await db.query("INSERT INTO units (tenant_id, name) VALUES ('acme', 'Planta B')");
    const { body } = await api(admin).get(`/api/reports/overview${PERIOD}&unit_id=${r.insertId}`);
    assert.equal(body.work_orders.total, 0);
    assert.equal(body.equipments.length, 0);
  });

  it('valida o período e restringe por perfil', async () => {
    assert.equal((await api(admin).get('/api/reports/overview?from=2030-04-01&to=2030-03-01')).status, 400);
    assert.equal((await api(admin).get('/api/reports/overview')).status, 200, 'sem período: mês atual');
    const operador = await login('user@acme.com');
    assert.equal((await api(operador).get(`/api/reports/overview${PERIOD}`)).status, 403);
  });

  it('exporta em Excel', async () => {
    const res = await api(admin).get(`/api/reports/overview.xlsx${PERIOD}`).buffer(true).parse((r, cb) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    assert.equal(res.status, 200);
    assert.match(res.headers['content-disposition'], /relatorio-2030-03-01-a-2030-03-31\.xlsx/);
    assert.equal(res.body.subarray(0, 2).toString(), 'PK');
  });
});

describe('histórico do equipamento', () => {
  it('linha do tempo com O.S., falhas, reparos e peças', async () => {
    const res = await api(admin).get(`/api/reports/equipment/${equipmentId}${PERIOD}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.equipment.name, 'Compressor ACME');
    assert.deepEqual(res.body.events.map((e) => e.kind), ['falha', 'os', 'reparo', 'peca', 'os', 'falha', 'reparo', 'os']);
    assert.deepEqual(res.body.summary, { work_orders: 3, failures: 2, repairs: 2, repair_hours: 4, mttr: 2, parts_cost: 100 });
  });

  it('equipamento de outro cliente não aparece', async () => {
    const [[other]] = await db.query("SELECT id FROM equipments WHERE tenant_id = 'globex'");
    assert.equal((await api(admin).get(`/api/reports/equipment/${other.id}${PERIOD}`)).status, 404);
  });
});

describe('primeiros passos', () => {
  it('mostra o progresso real do cliente', async () => {
    const res = await api(admin).get('/api/onboarding');
    assert.equal(res.status, 200);
    const done = Object.fromEntries(res.body.steps.map((s) => [s.id, s.done]));
    assert.deepEqual(done, { company: false, equipments: true, preventive: true, work_order: true, inventory: false, team: true });
    assert.equal(res.body.completed, 4);
    assert.equal(res.body.total, 6);
    assert.equal(res.body.dismissed, false);
  });

  it('dados da empresa completos marcam o passo', async () => {
    await api(admin).put('/api/tenant').send({ razao_social: 'ACME Indústria Ltda', cnpj: '12.345.678/0001-90' });
    const { body } = await api(admin).get('/api/onboarding');
    assert.equal(body.steps.find((s) => s.id === 'company').done, true);
  });

  it('administrador pode ocultar o guia; gerente não vê', async () => {
    assert.equal((await api(gerente).get('/api/onboarding')).status, 403);
    assert.equal((await api(admin).post('/api/onboarding/dismiss').send({})).status, 200);
    assert.equal((await api(admin).get('/api/onboarding')).body.dismissed, true);
  });
});
