const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setupDatabase, login, api, teardown } = require('./helpers');

let tokens = {};
let db;
let equipmentId;

const waitFor = async (check, timeout = 2000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
};

const notificationSent = async (kind, refKey) => {
  const [rows] = await db.query('SELECT 1 FROM notifications_sent WHERE kind = ? AND ref_key = ?', [kind, String(refKey)]);
  return rows.length > 0;
};

before(async () => {
  await setupDatabase();
  db = require('../db');
  for (const [key, email] of [['admin', 'admin@acme.com'], ['gerente', 'gerente@acme.com'], ['user', 'user@acme.com'], ['globex', 'admin@globex.com']]) {
    tokens[key] = await login(email);
  }
  [[{ id: equipmentId }]] = await db.query("SELECT id FROM equipments WHERE tenant_id = 'acme'");
});

after(teardown);

const newWorkOrder = async (extra = {}) => (await api(tokens.gerente).post('/api/work-orders').send({
  equipment_id: equipmentId, titulo: 'Troca de rolamento', tipo: 'Corretiva', prioridade: 'Alta', ...extra,
})).body;

describe('peças nas O.S. e estoque', () => {
  let itemId;
  let os;

  before(async () => {
    const item = await api(tokens.gerente).post('/api/inventory').send({ name: 'Rolamento 6205', quantity: 10, min_quantity: 4, unit_price: 25.5 });
    itemId = item.body.id;
    os = await newWorkOrder();
  });

  it('saldo inicial entra como movimentação', async () => {
    const mov = await api(tokens.gerente).get(`/api/inventory/${itemId}/movements`);
    assert.equal(mov.body.total, 1);
    assert.equal(mov.body.items[0].type, 'entrada');
    assert.equal(mov.body.items[0].balance_after, 10);
  });

  it('lançar peça dá baixa no estoque e soma o custo na O.S.', async () => {
    const res = await api(tokens.gerente).post(`/api/work-orders/${os.id}/parts`).send({ inventory_id: itemId, quantity: 4 });
    assert.equal(res.status, 201);
    assert.equal(res.body.stock_after, 6);
    const detail = await api(tokens.gerente).get(`/api/work-orders/${os.id}`);
    assert.equal(detail.body.parts.length, 1);
    assert.equal(detail.body.parts_cost, 102);
    const eq = await api(tokens.gerente).get('/api/equipments');
    assert.equal(Number(eq.body.items.find((e) => e.id === equipmentId).parts_cost), 102);
  });

  it('não deixa o estoque ficar negativo', async () => {
    const res = await api(tokens.gerente).post(`/api/work-orders/${os.id}/parts`).send({ inventory_id: itemId, quantity: 7 });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'INSUFFICIENT_STOCK');
    const [[item]] = await db.query('SELECT quantity FROM inventory WHERE id = ?', [itemId]);
    assert.equal(item.quantity, 6);
  });

  it('baixas simultâneas não deixam o saldo errado', async () => {
    const other = await newWorkOrder();
    const results = await Promise.all(Array.from({ length: 6 }, () => api(tokens.gerente).post(`/api/work-orders/${other.id}/parts`).send({ inventory_id: itemId, quantity: 1 })));
    assert.equal(results.filter((r) => r.status === 201).length, 6);
    const [[item]] = await db.query('SELECT quantity FROM inventory WHERE id = ?', [itemId]);
    assert.equal(item.quantity, 0);
    const [[mov]] = await db.query('SELECT balance_after FROM inventory_movements WHERE inventory_id = ? ORDER BY id DESC LIMIT 1', [itemId]);
    assert.equal(mov.balance_after, 0);
  });

  it('cruzar o estoque mínimo dispara aviso uma única vez por dia', async () => {
    const today = new Date().toISOString().slice(0, 10);
    assert.ok(await waitFor(() => notificationSent('estoque_minimo', `${itemId}:${today}`)));
    const [rows] = await db.query("SELECT COUNT(*) AS n FROM notifications_sent WHERE kind = 'estoque_minimo'");
    assert.equal(rows[0].n, 1);
  });

  it('remover a peça devolve ao estoque (estorno)', async () => {
    const detail = await api(tokens.gerente).get(`/api/work-orders/${os.id}`);
    const res = await api(tokens.gerente).delete(`/api/work-orders/${os.id}/parts/${detail.body.parts[0].id}`);
    assert.equal(res.status, 200);
    const [[item]] = await db.query('SELECT quantity FROM inventory WHERE id = ?', [itemId]);
    assert.equal(item.quantity, 4);
  });

  it('entrada e ajuste por contagem ficam no histórico', async () => {
    const gerente = api(tokens.gerente);
    assert.equal((await gerente.post(`/api/inventory/${itemId}/movements`).send({ type: 'entrada', quantity: 20, note: 'NF 123' })).status, 201);
    const ajuste = await gerente.post(`/api/inventory/${itemId}/movements`).send({ type: 'ajuste', counted: 22 });
    assert.equal(ajuste.body.quantity, 22);
    const mov = await gerente.get(`/api/inventory/${itemId}/movements`);
    assert.deepEqual(mov.body.items.slice(0, 2).map((m) => [m.type, m.quantity]), [['ajuste', -2], ['entrada', 20]]);
  });

  it('excluir a O.S. devolve as peças ao estoque', async () => {
    const third = await newWorkOrder();
    await api(tokens.gerente).post(`/api/work-orders/${third.id}/parts`).send({ inventory_id: itemId, quantity: 5 });
    await api(tokens.gerente).delete(`/api/work-orders/${third.id}`);
    const [[item]] = await db.query('SELECT quantity FROM inventory WHERE id = ?', [itemId]);
    assert.equal(item.quantity, 22);
  });

  it('não usa peça de outro cliente e operador não lança peças', async () => {
    const globexItem = await api(tokens.globex).post('/api/inventory').send({ name: 'Peça Globex', quantity: 5 });
    assert.equal((await api(tokens.gerente).post(`/api/work-orders/${os.id}/parts`).send({ inventory_id: globexItem.body.id, quantity: 1 })).status, 404);
    assert.equal((await api(tokens.user).post(`/api/work-orders/${os.id}/parts`).send({ inventory_id: itemId, quantity: 1 })).status, 403);
  });
});

describe('preventivas automáticas com checklist', () => {
  let planId;

  it('plano vencido gera O.S. com checklist uma única vez, mesmo com rotinas simultâneas', async () => {
    const plan = await api(tokens.gerente).post('/api/preventive-plans').send({
      equipment_id: equipmentId, title: 'Lubrificação mensal', interval_days: 30, checklist: ['Limpar graxeiras', 'Aplicar graxa', 'Registrar temperatura'],
    });
    planId = plan.body.id;
    await db.query('UPDATE preventive_plans SET next_due = CURRENT_DATE WHERE id = ?', [planId]);

    const { generateDueWorkOrders } = require('../utils/preventive');
    const results = await Promise.all([generateDueWorkOrders(), generateDueWorkOrders(), generateDueWorkOrders()]);
    assert.equal(results.reduce((sum, r) => sum + r.created, 0), 1);

    const [orders] = await db.query('SELECT id, tipo FROM work_orders WHERE preventive_plan_id = ?', [planId]);
    assert.equal(orders.length, 1);
    assert.equal(orders[0].tipo, 'Preventiva');
    const detail = await api(tokens.gerente).get(`/api/work-orders/${orders[0].id}`);
    assert.deepEqual(detail.body.checklist.map((c) => c.description), ['Limpar graxeiras', 'Aplicar graxa', 'Registrar temperatura']);
    assert.ok(await notificationSent('preventiva_gerada', `${planId}:${new Date().toISOString().slice(0, 10)}`));
  });

  it('não conclui com checklist pendente; ao concluir, recalcula o próximo vencimento', async () => {
    const [[os]] = await db.query('SELECT id FROM work_orders WHERE preventive_plan_id = ?', [planId]);
    const gerente = api(tokens.gerente);
    const blocked = await gerente.put(`/api/work-orders/${os.id}`).send({ status: 'Concluída', tempo_reparo: 1 });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.code, 'CHECKLIST_PENDING');

    const detail = await gerente.get(`/api/work-orders/${os.id}`);
    for (const item of detail.body.checklist) {
      assert.equal((await gerente.put(`/api/work-orders/${os.id}/checklist/${item.id}`).send({ done: true })).status, 200);
    }
    assert.equal((await gerente.put(`/api/work-orders/${os.id}`).send({ status: 'Concluída', tempo_reparo: 1 })).status, 200);

    const [[plan]] = await db.query('SELECT last_executed, next_due FROM preventive_plans WHERE id = ?', [planId]);
    const expected = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    assert.equal(plan.next_due, expected);
    assert.ok(plan.last_executed);

    // Próxima rotina não gera nada até o novo vencimento
    const { generateDueWorkOrders } = require('../utils/preventive');
    assert.equal((await generateDueWorkOrders()).created, 0);
  });

  it('plano com geração automática desligada não gera O.S.', async () => {
    const plan = await api(tokens.gerente).post('/api/preventive-plans').send({ equipment_id: equipmentId, title: 'Manual', interval_days: 7, auto_generate: false });
    await db.query('UPDATE preventive_plans SET next_due = CURRENT_DATE WHERE id = ?', [plan.body.id]);
    const { generateDueWorkOrders } = require('../utils/preventive');
    assert.equal((await generateDueWorkOrders()).created, 0);
  });

  it('checklist do plano pode ser editado', async () => {
    assert.equal((await api(tokens.gerente).put(`/api/preventive-plans/${planId}`).send({ checklist: ['Só um item'] })).status, 200);
    const plan = await api(tokens.gerente).get(`/api/preventive-plans/${planId}`);
    assert.deepEqual(plan.body.checklist, ['Só um item']);
  });
});

describe('comentários e anexos', () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a0f00000000049454e44ae426082', 'hex');

  it('operador comenta e anexa foto no chamado que abriu', async () => {
    const os = (await api(tokens.user).post('/api/work-orders').send({ equipment_id: equipmentId, titulo: 'Vazamento', tipo: 'Corretiva', prioridade: 'Média' })).body;
    const user = api(tokens.user);
    assert.equal((await user.post(`/api/work-orders/${os.id}/comments`).send({ body: 'Vazamento na conexão de entrada' })).status, 201);
    const att = await user.post(`/api/work-orders/${os.id}/attachments`).attach('file', png, 'vazamento.png');
    assert.equal(att.status, 201);

    const detail = await user.get(`/api/work-orders/${os.id}`);
    assert.equal(detail.body.comments[0].user_name, 'Operador ACME');
    assert.equal(detail.body.attachments[0].filename, 'vazamento.png');

    // Outro operador não remove anexo alheio; gestor remove
    assert.equal((await api(tokens.gerente).delete(`/api/work-orders/${os.id}/attachments/${att.body.id}`)).status, 200);
  });

  it('não comenta em O.S. de outro cliente', async () => {
    const [[os]] = await db.query("SELECT id FROM work_orders WHERE tenant_id = 'acme' LIMIT 1");
    assert.equal((await api(tokens.globex).post(`/api/work-orders/${os.id}/comments`).send({ body: 'x' })).status, 404);
  });
});

describe('notificações', () => {
  it('O.S. crítica avisa os responsáveis uma vez', async () => {
    const os = await newWorkOrder({ prioridade: 'Crítica' });
    assert.ok(await waitFor(() => notificationSent('os_critica', os.id)));
  });

  it('usuário pode desligar as notificações no perfil', async () => {
    const res = await api(tokens.gerente).put('/api/me').send({ notifications_enabled: false });
    assert.equal(res.body.notifications_enabled, false);
    const me = await api(tokens.gerente).get('/api/me');
    assert.equal(me.body.notifications_enabled, false);
  });

  it('rotina de cobrança avisa fatura vencendo e em atraso', async () => {
    const { runBillingCycle } = require('../utils/billing');
    const [soon] = await db.query("INSERT INTO invoices (tenant_id, valor, vencimento, status, mes_ref) VALUES ('acme', 100, DATE_ADD(CURRENT_DATE, INTERVAL 3 DAY), 'Pendente', '11/2026')");
    const [late] = await db.query("INSERT INTO invoices (tenant_id, valor, vencimento, status, mes_ref) VALUES ('acme', 100, DATE_SUB(CURRENT_DATE, INTERVAL 1 DAY), 'Pendente', '09/2026')");
    await runBillingCycle();
    assert.ok(await notificationSent('fatura_vencendo', soon.insertId));
    assert.ok(await notificationSent('fatura_atrasada', late.insertId));
  });
});

describe('importação de equipamentos', () => {
  it('pré-visualização aponta o erro de cada linha e não grava nada', async () => {
    const res = await api(tokens.admin).post('/api/equipments/import').send({
      dry_run: true,
      rows: [
        { name: 'Bomba 1', total_op_time: '1.250,5', data_inicio: '15/03/2024' },
        { name: '', model: 'X' },
        { name: 'Bomba 3', data_inicio: '31-12-2024' },
        { name: 'Bomba 4', unit: 'Planta Inexistente' },
      ],
    });
    assert.equal(res.status, 422);
    assert.equal(res.body.valid, 1);
    assert.deepEqual(res.body.errors.map((e) => e.line), [3, 4, 5]);
    const [[{ n }]] = await db.query("SELECT COUNT(*) AS n FROM equipments WHERE name LIKE 'Bomba%'");
    assert.equal(n, 0);
  });

  it('importa tudo de uma vez quando não há erros', async () => {
    const res = await api(tokens.admin).post('/api/equipments/import').send({
      rows: [
        { name: 'Bomba 1', type: 'Hidráulico', total_op_time: '1.250,5', data_inicio: '15/03/2024', unit: 'planta contagem' },
        { name: 'Bomba 2', serie: 'B2' },
      ],
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.imported, 2);
    const [[b1]] = await db.query("SELECT total_op_time, data_inicio FROM equipments WHERE name = 'Bomba 1'");
    assert.equal(b1.total_op_time, 1251); // horas inteiras: 1.250,5 arredonda para 1251
    assert.equal(b1.data_inicio, '2024-03-15');
  });

  it('com várias unidades, usa a unidade escolhida na tela para linhas sem unidade', async () => {
    const admin = api(tokens.admin);
    const unit = await admin.post('/api/units').send({ name: 'Planta Betim' });
    const semUnidade = await admin.post('/api/equipments/import').send({ dry_run: true, rows: [{ name: 'Torno 1' }] });
    assert.equal(semUnidade.status, 422);
    const res = await admin.post('/api/equipments/import').send({ rows: [{ name: 'Torno 1' }], default_unit_id: unit.body.id });
    assert.equal(res.status, 201);
    const [[eq]] = await db.query("SELECT unit_id FROM equipments WHERE name = 'Torno 1'");
    assert.equal(eq.unit_id, unit.body.id);
  });

  it('respeita o limite do plano', async () => {
    await db.query("UPDATE tenants SET plan_type = 'Starter' WHERE id = 'globex'");
    await db.query("UPDATE plans SET max_equipments = 2 WHERE id = 'Starter'");
    const res = await api(tokens.globex).post('/api/equipments/import').send({ rows: [{ name: 'A' }, { name: 'B' }] });
    assert.equal(res.status, 422);
    assert.match(res.body.errors[0].message, /Starter/);
  });
});
