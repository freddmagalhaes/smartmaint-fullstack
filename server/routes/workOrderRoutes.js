const express = require('express');
const db = require('../db');
const { query, assertEquipmentInTenant, assertAffected, buildUpdate } = require('../utils/routeHelpers');
const { HttpError } = require('../utils/errorHandler');
const { ROLES, MANAGERS, TENANT_ROLES, isBackoffice, requireRole, tenantScope } = require('../middleware/rbac');
const { parse, z, text, optionalText, id, date, idParam } = require('../utils/validate');
const { pageParams, paginate, like } = require('../utils/pagination');
const { audit } = require('../utils/audit');
const { moveStock, crossedMinimum } = require('../utils/stock');
const { onPreventiveCompleted } = require('../utils/preventive');
const notifications = require('../utils/notifications');
const { upload, saveUploadedFile } = require('./uploadRoutes');
const storage = require('../utils/storage');

const router = express.Router();

const DONE = 'Concluída';
const MAX_ATTACHMENTS = 20;
const today = () => new Date().toISOString().slice(0, 10);
const statusEnum = z.enum(['Aberta', 'Em Execução', 'Pausada', DONE]);

const workOrderSchema = z.object({
  equipment_id: id,
  titulo: text(),
  descricao: optionalText(5000),
  tipo: z.enum(['Preventiva', 'Corretiva', 'Preditiva', 'Melhoria']),
  prioridade: z.enum(['Baixa', 'Média', 'Alta', 'Crítica']),
  status: statusEnum.default('Aberta'),
  responsavel: optionalText(),
  data_criacao: date.nullish(),
  // Horas efetivas de reparo, informadas ao concluir (alimenta MTTR e disponibilidade)
  tempo_reparo: z.coerce.number().positive().max(10000).nullish(),
});

const subParam = (req, name) => parse(z.object({ [name]: id }), req.params)[name];

/** Carrega a O.S. do tenant (opcionalmente travando a linha) ou lança 404. */
const loadWorkOrder = async (q, workOrderId, tenantId, lock = false) => {
  const [os] = await q(`SELECT * FROM work_orders WHERE id = ? AND tenant_id = ?${lock ? ' FOR UPDATE' : ''}`, [workOrderId, tenantId]);
  if (!os) throw new HttpError(404, 'O.S. não encontrada');
  return os;
};

const assertNotDone = (os) => {
  if (os.status === DONE) throw new HttpError(409, 'O.S. concluída. Reabra-a para alterar peças ou checklist.');
};

// --- LISTA E DETALHE ---
router.get('/work-orders', requireRole(...TENANT_ROLES), tenantScope, async (req, res) => {
  const { page, pageSize, q } = pageParams(req);
  const f = parse(z.object({
    unit_id: id.optional(),
    equipment_id: id.optional(),
    status: z.union([statusEnum, z.literal('abertas')]).optional(), // "abertas" = tudo que não está concluído
    prioridade: workOrderSchema.shape.prioridade.optional(),
    tipo: workOrderSchema.shape.tipo.optional(),
  }), req.query);
  const where = ['w.tenant_id = ?'];
  const params = [req.tenantId];
  if (f.equipment_id) { where.push('w.equipment_id = ?'); params.push(f.equipment_id); }
  if (f.unit_id) { where.push('e.unit_id = ?'); params.push(f.unit_id); }
  if (f.status === 'abertas') where.push(`w.status <> '${DONE}'`);
  else if (f.status) { where.push('w.status = ?'); params.push(f.status); }
  if (f.prioridade) { where.push('w.prioridade = ?'); params.push(f.prioridade); }
  if (f.tipo) { where.push('w.tipo = ?'); params.push(f.tipo); }
  if (q) { where.push('(w.titulo LIKE ? OR e.name LIKE ? OR w.responsavel LIKE ?)'); params.push(like(q), like(q), like(q)); }
  res.json(await paginate({
    select: `w.*, e.name AS equipment_name, e.unit_id,
      (SELECT COUNT(*) FROM work_order_checklist c WHERE c.work_order_id = w.id) AS checklist_total,
      (SELECT COUNT(*) FROM work_order_checklist c WHERE c.work_order_id = w.id AND c.done = TRUE) AS checklist_done,
      (SELECT COALESCE(SUM(p.quantity * p.unit_price), 0) FROM work_order_parts p WHERE p.work_order_id = w.id) AS parts_cost`,
    from: 'work_orders w JOIN equipments e ON e.id = w.equipment_id',
    where, params,
    // Não concluídas primeiro, das mais críticas para as menos
    orderBy: `w.status = '${DONE}', FIELD(w.prioridade, 'Crítica', 'Alta', 'Média', 'Baixa'), w.id DESC`,
    page, pageSize,
  }));
});

router.get('/work-orders/:id', requireRole(...TENANT_ROLES), tenantScope, async (req, res) => {
  const workOrderId = idParam(req);
  const [os] = await query(
    `SELECT w.*, e.name AS equipment_name, e.unit_id, p.title AS preventive_plan_title
     FROM work_orders w JOIN equipments e ON e.id = w.equipment_id
     LEFT JOIN preventive_plans p ON p.id = w.preventive_plan_id
     WHERE w.id = ? AND w.tenant_id = ?`,
    [workOrderId, req.tenantId]
  );
  if (!os) throw new HttpError(404, 'O.S. não encontrada');
  const [parts, checklist, comments, attachments] = await Promise.all([
    query('SELECT id, inventory_id, item_name, quantity, unit_price, created_at FROM work_order_parts WHERE work_order_id = ? ORDER BY id', [workOrderId]),
    query('SELECT id, description, done, done_by, done_at FROM work_order_checklist WHERE work_order_id = ? ORDER BY sort_order, id', [workOrderId]),
    query('SELECT id, user_id, user_name, body, created_at FROM work_order_comments WHERE work_order_id = ? ORDER BY id', [workOrderId]),
    query('SELECT id, url, filename, content_type, size_bytes, uploaded_by, uploaded_by_name, created_at FROM work_order_attachments WHERE work_order_id = ? ORDER BY id', [workOrderId]),
  ]);
  const partsCost = parts.reduce((sum, p) => sum + p.quantity * Number(p.unit_price), 0);
  res.json({
    ...os,
    parts,
    parts_cost: Math.round(partsCost * 100) / 100,
    checklist: checklist.map((c) => ({ ...c, done: Boolean(c.done) })),
    comments,
    attachments,
  });
});

// --- CRIAÇÃO, ALTERAÇÃO E EXCLUSÃO ---
router.post('/work-orders', requireRole(...TENANT_ROLES), tenantScope, async (req, res) => {
  const { client_ref: clientRef, ...d } = parse(workOrderSchema.extend({
    // Gerado no aparelho para O.S. abertas sem internet: reenvio não duplica a O.S.
    client_ref: z.string().regex(/^[A-Za-z0-9-]{8,40}$/, 'identificador inválido').optional(),
  }), req.body);
  await assertEquipmentInTenant(d.equipment_id, req.tenantId);
  // Usuário operacional apenas abre chamados; status inicial é sempre "Aberta"
  if (!isBackoffice(req.user) && req.user.role === ROLES.USER) d.status = 'Aberta';
  if (d.status === DONE) throw new HttpError(400, 'Abra a O.S. e conclua-a informando o tempo de reparo');

  const existing = async () => {
    if (!clientRef) return null;
    const [row] = await query('SELECT * FROM work_orders WHERE tenant_id = ? AND client_ref = ?', [req.tenantId, clientRef]);
    return row || null;
  };
  const already = await existing();
  if (already) return res.status(200).json({ ...already, duplicate: true });

  let result;
  try {
    result = await query(
      'INSERT INTO work_orders (tenant_id, equipment_id, titulo, descricao, tipo, prioridade, status, responsavel, data_criacao, client_ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [req.tenantId, d.equipment_id, d.titulo, d.descricao ?? null, d.tipo, d.prioridade, d.status, d.responsavel ?? null, d.data_criacao || today(), clientRef ?? null]
    );
  } catch (err) {
    // Dois envios simultâneos do mesmo aparelho: devolve a O.S. que entrou primeiro
    if (err.code === 'ER_DUP_ENTRY' && clientRef) return res.status(200).json({ ...(await existing()), duplicate: true });
    throw err;
  }
  await audit(req, { action: 'create', entity: 'work_order', entityId: result.insertId, changes: d });
  if (d.prioridade === 'Crítica') {
    const [eq] = await query('SELECT name FROM equipments WHERE id = ?', [d.equipment_id]);
    notifications.criticalWorkOrder(req.tenantId, { id: result.insertId, ...d }, eq?.name);
  }
  res.status(201).json({ id: result.insertId, ...d, tenant_id: req.tenantId });
});

router.put('/work-orders/:id', requireRole(...MANAGERS), tenantScope, async (req, res) => {
  const workOrderId = idParam(req);
  const d = parse(workOrderSchema.partial().extend({ status: statusEnum.optional() }), req.body);
  if (d.equipment_id) await assertEquipmentInTenant(d.equipment_id, req.tenantId);

  const before = await db.transaction(async (q) => {
    const current = await loadWorkOrder(q, workOrderId, req.tenantId, true);

    const willBeDone = (d.status ?? current.status) === DONE;
    const wasDone = current.status === DONE;
    const repairTime = d.tempo_reparo ?? current.tempo_reparo;
    if (willBeDone && !repairTime) throw new HttpError(400, 'Informe o tempo de reparo (horas) para concluir a O.S.');
    if (willBeDone && !wasDone) {
      const [{ pending }] = await q('SELECT COUNT(*) AS pending FROM work_order_checklist WHERE work_order_id = ? AND done = FALSE', [workOrderId]);
      if (Number(pending) > 0) throw new HttpError(409, `Conclua os ${pending} item(ns) pendente(s) do checklist antes de concluir a O.S.`, 'CHECKLIST_PENDING');
    }

    const fields = { ...d };
    if (willBeDone && !wasDone) fields.data_conclusao = today();
    if (!willBeDone && wasDone) fields.data_conclusao = null;
    const { sql, params } = buildUpdate(fields, ['equipment_id', 'titulo', 'descricao', 'tipo', 'prioridade', 'status', 'responsavel', 'data_criacao', 'tempo_reparo', 'data_conclusao']);
    await q(`UPDATE work_orders SET ${sql} WHERE id = ? AND tenant_id = ?`, [...params, workOrderId, req.tenantId]);

    // O reparo registrado acompanha a O.S.: um por O.S. concluída, removido se ela for reaberta
    await q('DELETE FROM repairs WHERE work_order_id = ? AND tenant_id = ?', [workOrderId, req.tenantId]);
    if (willBeDone) {
      await q(
        'INSERT INTO repairs (tenant_id, equipment_id, work_order_id, tipo, tempo_reparo, data_reparo) VALUES (?, ?, ?, ?, ?, ?)',
        [req.tenantId, d.equipment_id ?? current.equipment_id, workOrderId, d.tipo ?? current.tipo, repairTime, fields.data_conclusao ?? current.data_conclusao ?? today()]
      );
    }
    // Preventiva executada: o plano passa a contar o próximo ciclo a partir de hoje
    if (willBeDone && !wasDone && current.preventive_plan_id) {
      await onPreventiveCompleted(q, current.preventive_plan_id, fields.data_conclusao);
    }
    return current;
  });

  await audit(req, { action: d.status ? `status:${d.status}` : 'update', entity: 'work_order', entityId: workOrderId, changes: d });
  if (d.prioridade === 'Crítica' && before.prioridade !== 'Crítica') {
    const [eq] = await query('SELECT name FROM equipments WHERE id = ?', [before.equipment_id]);
    notifications.criticalWorkOrder(req.tenantId, { ...before, ...d }, eq?.name);
  }
  res.json({ message: 'OS atualizada' });
});

router.delete('/work-orders/:id', requireRole(...MANAGERS), tenantScope, async (req, res) => {
  const workOrderId = idParam(req);
  await db.transaction(async (q) => {
    await loadWorkOrder(q, workOrderId, req.tenantId, true);
    // Peças usadas voltam para o estoque antes de a O.S. ser apagada
    const parts = await q('SELECT inventory_id, quantity FROM work_order_parts WHERE work_order_id = ? AND inventory_id IS NOT NULL', [workOrderId]);
    for (const part of parts) {
      await moveStock(q, { tenantId: req.tenantId, inventoryId: part.inventory_id, delta: part.quantity, type: 'estorno', workOrderId, user: req.user, note: `Exclusão da O.S. #${workOrderId}` });
    }
    await q('DELETE FROM repairs WHERE work_order_id = ? AND tenant_id = ?', [workOrderId, req.tenantId]);
    await q('DELETE FROM work_orders WHERE id = ? AND tenant_id = ?', [workOrderId, req.tenantId]);
  });
  await audit(req, { action: 'delete', entity: 'work_order', entityId: workOrderId });
  res.json({ message: 'Excluída com sucesso' });
});

// --- PEÇAS (baixa automática no estoque) ---
router.post('/work-orders/:id/parts', requireRole(...MANAGERS), tenantScope, async (req, res) => {
  const workOrderId = idParam(req);
  const d = parse(z.object({ inventory_id: id, quantity: z.coerce.number().int().positive().max(100000) }), req.body);

  const result = await db.transaction(async (q) => {
    const os = await loadWorkOrder(q, workOrderId, req.tenantId, true);
    assertNotDone(os);
    // Peça de outra unidade não pode ser usada (estoque compartilhado pode)
    const [eq] = await q('SELECT unit_id FROM equipments WHERE id = ?', [os.equipment_id]);
    const [item] = await q('SELECT unit_id FROM inventory WHERE id = ? AND tenant_id = ?', [d.inventory_id, req.tenantId]);
    if (item && item.unit_id && item.unit_id !== eq.unit_id) throw new HttpError(400, 'Esta peça pertence ao estoque de outra unidade');

    const stock = await moveStock(q, { tenantId: req.tenantId, inventoryId: d.inventory_id, delta: -d.quantity, type: 'saida', workOrderId, user: req.user, note: `O.S. #${workOrderId}` });
    const part = await q(
      'INSERT INTO work_order_parts (tenant_id, work_order_id, inventory_id, item_name, quantity, unit_price, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.tenantId, workOrderId, d.inventory_id, stock.item.name, d.quantity, stock.item.unit_price, req.user.id]
    );
    return { partId: part.insertId, stock };
  });

  if (crossedMinimum(result.stock)) notifications.lowStock(req.tenantId, result.stock.item);
  await audit(req, { action: 'add_part', entity: 'work_order', entityId: workOrderId, changes: { item: result.stock.item.name, quantity: d.quantity } });
  res.status(201).json({ id: result.partId, item_name: result.stock.item.name, quantity: d.quantity, unit_price: result.stock.item.unit_price, stock_after: result.stock.after });
});

router.delete('/work-orders/:id/parts/:partId', requireRole(...MANAGERS), tenantScope, async (req, res) => {
  const workOrderId = idParam(req);
  const partId = subParam(req, 'partId');
  const part = await db.transaction(async (q) => {
    const os = await loadWorkOrder(q, workOrderId, req.tenantId, true);
    assertNotDone(os);
    const [row] = await q('SELECT * FROM work_order_parts WHERE id = ? AND work_order_id = ?', [partId, workOrderId]);
    if (!row) throw new HttpError(404, 'Peça não encontrada nesta O.S.');
    if (row.inventory_id) {
      await moveStock(q, { tenantId: req.tenantId, inventoryId: row.inventory_id, delta: row.quantity, type: 'estorno', workOrderId, user: req.user, note: `Peça removida da O.S. #${workOrderId}` });
    }
    await q('DELETE FROM work_order_parts WHERE id = ?', [partId]);
    return row;
  });
  await audit(req, { action: 'remove_part', entity: 'work_order', entityId: workOrderId, changes: { item: part.item_name, quantity: part.quantity } });
  res.json({ message: 'Peça removida e devolvida ao estoque' });
});

// --- CHECKLIST ---
router.post('/work-orders/:id/checklist', requireRole(...MANAGERS), tenantScope, async (req, res) => {
  const workOrderId = idParam(req);
  const { description } = parse(z.object({ description: text(500) }), req.body);
  const os = await loadWorkOrder(query, workOrderId, req.tenantId);
  assertNotDone(os);
  const result = await query(
    'INSERT INTO work_order_checklist (work_order_id, description, sort_order) SELECT ?, ?, COALESCE(MAX(sort_order), 0) + 1 FROM work_order_checklist WHERE work_order_id = ?',
    [workOrderId, description, workOrderId]
  );
  res.status(201).json({ id: result.insertId, description, done: false });
});

router.put('/work-orders/:id/checklist/:itemId', requireRole(...MANAGERS), tenantScope, async (req, res) => {
  const workOrderId = idParam(req);
  const itemId = subParam(req, 'itemId');
  const { done } = parse(z.object({ done: z.boolean() }), req.body);
  const os = await loadWorkOrder(query, workOrderId, req.tenantId);
  assertNotDone(os);
  assertAffected(await query(
    'UPDATE work_order_checklist SET done = ?, done_by = ?, done_at = ? WHERE id = ? AND work_order_id = ?',
    [done, done ? req.user.name : null, done ? new Date() : null, itemId, workOrderId]
  ), 'Item do checklist não encontrado');
  res.json({ message: 'Checklist atualizado' });
});

// --- COMENTÁRIOS (todos os perfis, inclusive quem abriu o chamado) ---
router.post('/work-orders/:id/comments', requireRole(...TENANT_ROLES), tenantScope, async (req, res) => {
  const workOrderId = idParam(req);
  const { body } = parse(z.object({ body: text(5000) }), req.body);
  await loadWorkOrder(query, workOrderId, req.tenantId);
  const result = await query(
    'INSERT INTO work_order_comments (tenant_id, work_order_id, user_id, user_name, body) VALUES (?, ?, ?, ?, ?)',
    [req.tenantId, workOrderId, req.user.id, req.user.name, body]
  );
  res.status(201).json({ id: result.insertId, user_id: req.user.id, user_name: req.user.name, body });
});

// --- ANEXOS (fotos e PDF) ---
router.post('/work-orders/:id/attachments', requireRole(...TENANT_ROLES), tenantScope, upload.single('file'), async (req, res) => {
  const workOrderId = idParam(req);
  await loadWorkOrder(query, workOrderId, req.tenantId);
  const [{ total }] = await query('SELECT COUNT(*) AS total FROM work_order_attachments WHERE work_order_id = ?', [workOrderId]);
  if (Number(total) >= MAX_ATTACHMENTS) throw new HttpError(400, `Limite de ${MAX_ATTACHMENTS} anexos por O.S.`);
  const file = await saveUploadedFile(req.file, req.tenantId);
  const filename = (req.file.originalname || '').slice(0, 255) || null;
  const result = await query(
    `INSERT INTO work_order_attachments (tenant_id, work_order_id, url, filename, content_type, size_bytes, uploaded_by, uploaded_by_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.tenantId, workOrderId, file.url, filename, file.contentType, file.size, req.user.id, req.user.name]
  );
  await audit(req, { action: 'add_attachment', entity: 'work_order', entityId: workOrderId, changes: { filename } });
  res.status(201).json({ id: result.insertId, url: file.url, filename, content_type: file.contentType });
});

router.delete('/work-orders/:id/attachments/:attachmentId', requireRole(...TENANT_ROLES), tenantScope, async (req, res) => {
  const workOrderId = idParam(req);
  const attachmentId = subParam(req, 'attachmentId');
  const [row] = await query('SELECT * FROM work_order_attachments WHERE id = ? AND work_order_id = ? AND tenant_id = ?', [attachmentId, workOrderId, req.tenantId]);
  if (!row) throw new HttpError(404, 'Anexo não encontrado');
  // Quem enviou pode remover; gestores removem qualquer um
  const canManage = isBackoffice(req.user) || MANAGERS.includes(req.user.role);
  if (!canManage && row.uploaded_by !== req.user.id) throw new HttpError(403, 'Você só pode remover anexos que enviou');
  await query('DELETE FROM work_order_attachments WHERE id = ?', [attachmentId]);
  await storage.remove(row.url.replace(/^\/uploads\//, '')).catch(() => {});
  await audit(req, { action: 'remove_attachment', entity: 'work_order', entityId: workOrderId, changes: { filename: row.filename } });
  res.json({ message: 'Anexo removido' });
});

module.exports = router;
