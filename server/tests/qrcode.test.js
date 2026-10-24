const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setupDatabase, login, api, teardown } = require('./helpers');

let db;
let acmeEquipment;
let globexEquipment;

before(async () => {
  await setupDatabase();
  db = require('../db');
  [[{ id: acmeEquipment }]] = await db.query("SELECT id FROM equipments WHERE tenant_id = 'acme'");
  [[{ id: globexEquipment }]] = await db.query("SELECT id FROM equipments WHERE tenant_id = 'globex'");
});

after(teardown);

describe('ficha do equipamento (QR Code)', () => {
  it('operador abre a ficha e vê as O.S. em aberto', async () => {
    const operador = await login('user@acme.com');
    const created = await api(operador).post('/api/work-orders').send({ equipment_id: acmeEquipment, titulo: 'Ruído no motor', tipo: 'Corretiva', prioridade: 'Alta' });
    assert.equal(created.status, 201);
    await db.query("INSERT INTO preventive_plans (tenant_id, equipment_id, title, interval_days, next_due, status) VALUES ('acme', ?, 'Lubrificação', 30, '2031-01-10', 'Ativo')", [acmeEquipment]);

    const res = await api(operador).get(`/api/equipments/${acmeEquipment}/card`);
    assert.equal(res.status, 200);
    assert.equal(res.body.name, 'Compressor ACME');
    assert.equal(res.body.unit_name, 'Planta Contagem');
    assert.deepEqual(res.body.open_orders.map((o) => o.titulo), ['Ruído no motor']);
    assert.equal(res.body.preventive_plans[0].title, 'Lubrificação');
    assert.deepEqual(res.body.recent_orders, []);
  });

  it('equipamento de outro cliente não abre', async () => {
    const operador = await login('user@acme.com');
    assert.equal((await api(operador).get(`/api/equipments/${globexEquipment}/card`)).status, 404);
  });
});

describe('O.S. aberta sem internet', () => {
  const body = (ref) => ({ equipment_id: acmeEquipment, titulo: 'Vazamento de óleo', tipo: 'Corretiva', prioridade: 'Média', client_ref: ref });

  it('reenvio com o mesmo identificador não duplica a O.S.', async () => {
    const admin = await login('admin@acme.com');
    const first = await api(admin).post('/api/work-orders').send(body('aparelho-1-abc123'));
    assert.equal(first.status, 201);
    const again = await api(admin).post('/api/work-orders').send(body('aparelho-1-abc123'));
    assert.equal(again.status, 200);
    assert.equal(again.body.id, first.body.id);
    assert.equal(again.body.duplicate, true);
    const [[{ n }]] = await db.query("SELECT COUNT(*) AS n FROM work_orders WHERE client_ref = 'aparelho-1-abc123'");
    assert.equal(n, 1);
  });

  it('o identificador vale por cliente', async () => {
    const globex = await login('admin@globex.com');
    const res = await api(globex).post('/api/work-orders').send({ ...body('aparelho-1-abc123'), equipment_id: globexEquipment });
    assert.equal(res.status, 201);
  });

  it('recusa identificador inválido', async () => {
    const admin = await login('admin@acme.com');
    assert.equal((await api(admin).post('/api/work-orders').send(body('x'))).status, 400);
  });
});
