const express = require('express');
const db = require('../db');
const { query, assertEquipmentInTenant, assertAffected, buildUpdate } = require('../utils/routeHelpers');
const { HttpError } = require('../utils/errorHandler');
const { ROLES, MANAGERS, TENANT_ROLES, isBackoffice, requireRole, tenantScope } = require('../middleware/rbac');
const { parse, z, text, optionalText, id, date, idParam } = require('../utils/validate');
const { pageParams, paginate, like } = require('../utils/pagination');
const { audit } = require('../utils/audit');

const router = express.Router();

const DONE = 'Concluída';
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
    select: 'w.*, e.name AS equipment_name, e.unit_id',
    from: 'work_orders w JOIN equipments e ON e.id = w.equipment_id',
    where, params,
    // Não concluídas primeiro, das mais críticas para as menos
    orderBy: `w.status = '${DONE}', FIELD(w.prioridade, 'Crítica', 'Alta', 'Média', 'Baixa'), w.id DESC`,
    page, pageSize,
  }));
});

router.post('/work-orders', requireRole(...TENANT_ROLES), tenantScope, async (req, res) => {
  const d = parse(workOrderSchema, req.body);
  await assertEquipmentInTenant(d.equipment_id, req.tenantId);
  // Usuário operacional apenas abre chamados; status inicial é sempre "Aberta"
  if (!isBackoffice(req.user) && req.user.role === ROLES.USER) d.status = 'Aberta';
  if (d.status === DONE) throw new HttpError(400, 'Abra a O.S. e conclua-a informando o tempo de reparo');

  const result = await query(
    'INSERT INTO work_orders (tenant_id, equipment_id, titulo, descricao, tipo, prioridade, status, responsavel, data_criacao) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [req.tenantId, d.equipment_id, d.titulo, d.descricao ?? null, d.tipo, d.prioridade, d.status, d.responsavel ?? null, d.data_criacao || today()]
  );
  await audit(req, { action: 'create', entity: 'work_order', entityId: result.insertId, changes: d });
  res.status(201).json({ id: result.insertId, ...d, tenant_id: req.tenantId });
});

router.put('/work-orders/:id', requireRole(...MANAGERS), tenantScope, async (req, res) => {
  const workOrderId = idParam(req);
  const d = parse(workOrderSchema.partial().extend({ status: statusEnum.optional() }), req.body);
  if (d.equipment_id) await assertEquipmentInTenant(d.equipment_id, req.tenantId);

  await db.transaction(async (q) => {
    const [current] = await q('SELECT * FROM work_orders WHERE id = ? AND tenant_id = ? FOR UPDATE', [workOrderId, req.tenantId]);
    if (!current) throw new HttpError(404, 'O.S. não encontrada');

    const willBeDone = (d.status ?? current.status) === DONE;
    const wasDone = current.status === DONE;
    const repairTime = d.tempo_reparo ?? current.tempo_reparo;
    if (willBeDone && !repairTime) throw new HttpError(400, 'Informe o tempo de reparo (horas) para concluir a O.S.');

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
  });

  await audit(req, { action: d.status ? `status:${d.status}` : 'update', entity: 'work_order', entityId: workOrderId, changes: d });
  res.json({ message: 'OS atualizada' });
});

router.delete('/work-orders/:id', requireRole(...MANAGERS), tenantScope, async (req, res) => {
  const workOrderId = idParam(req);
  await db.transaction(async (q) => {
    await q('DELETE FROM repairs WHERE work_order_id = ? AND tenant_id = ?', [workOrderId, req.tenantId]);
    assertAffected(await q('DELETE FROM work_orders WHERE id = ? AND tenant_id = ?', [workOrderId, req.tenantId]), 'O.S. não encontrada');
  });
  await audit(req, { action: 'delete', entity: 'work_order', entityId: workOrderId });
  res.json({ message: 'Excluída com sucesso' });
});

module.exports = router;
