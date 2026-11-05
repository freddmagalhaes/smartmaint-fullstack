const express = require('express');
const db = require('../db');
const { query, assertEquipmentInTenant, assertAffected, buildUpdate } = require('../utils/routeHelpers');
const { HttpError } = require('../utils/errorHandler');
const { MANAGERS, requireRole, tenantScope } = require('../middleware/rbac');
const { parse, z, text, optionalText, id, idParam } = require('../utils/validate');
const { pageParams, paginate, like } = require('../utils/pagination');
const { audit } = require('../utils/audit');

const router = express.Router();

const intervalDays = z.coerce.number().int().min(1).max(3650);
const planStatus = z.enum(['Ativo', 'Pausado']);
const checklistSchema = z.array(z.string().trim().min(1).max(500)).max(50);
const leadDays = z.coerce.number().int().min(0).max(60);

/** Substitui os itens do checklist do plano (aplicado às próximas O.S. geradas). */
const replaceChecklist = async (q, planId, items) => {
  await q('DELETE FROM preventive_checklist_items WHERE plan_id = ?', [planId]);
  for (const [index, description] of items.entries()) {
    await q('INSERT INTO preventive_checklist_items (plan_id, description, sort_order) VALUES (?, ?, ?)', [planId, description, index + 1]);
  }
};

router.use('/preventive-plans', requireRole(...MANAGERS), tenantScope);

router.get('/preventive-plans', async (req, res) => {
  const { page, pageSize, q } = pageParams(req);
  const f = parse(z.object({
    unit_id: id.optional(),
    equipment_id: id.optional(),
    status: planStatus.optional(),
    due: z.enum(['atrasados', '7dias']).optional(),
  }), req.query);
  const where = ['p.tenant_id = ?'];
  const params = [req.tenantId];
  if (f.unit_id) { where.push('e.unit_id = ?'); params.push(f.unit_id); }
  if (f.equipment_id) { where.push('p.equipment_id = ?'); params.push(f.equipment_id); }
  if (f.status) { where.push('p.status = ?'); params.push(f.status); }
  if (f.due === 'atrasados') where.push('p.next_due < CURRENT_DATE');
  if (f.due === '7dias') where.push('p.next_due <= DATE_ADD(CURRENT_DATE, INTERVAL 7 DAY)');
  if (q) { where.push('(p.title LIKE ? OR e.name LIKE ?)'); params.push(like(q), like(q)); }
  res.json(await paginate({
    select: `p.*, e.name AS equipment_name, e.unit_id,
      (SELECT COUNT(*) FROM preventive_checklist_items c WHERE c.plan_id = p.id) AS checklist_count,
      (SELECT w.id FROM work_orders w WHERE w.preventive_plan_id = p.id AND w.status <> 'Concluída' ORDER BY w.id DESC LIMIT 1) AS open_work_order_id`,
    from: 'preventive_plans p JOIN equipments e ON p.equipment_id = e.id AND e.tenant_id = p.tenant_id',
    where, params, orderBy: 'p.next_due, p.id', page, pageSize,
  }));
});

router.get('/preventive-plans/:id', async (req, res) => {
  const planId = idParam(req);
  const [plan] = await query(
    'SELECT p.*, e.name AS equipment_name FROM preventive_plans p JOIN equipments e ON e.id = p.equipment_id WHERE p.id = ? AND p.tenant_id = ?',
    [planId, req.tenantId]
  );
  if (!plan) throw new HttpError(404, 'Plano não encontrado');
  const checklist = await query('SELECT description FROM preventive_checklist_items WHERE plan_id = ? ORDER BY sort_order, id', [planId]);
  res.json({ ...plan, checklist: checklist.map((c) => c.description) });
});

router.post('/preventive-plans', async (req, res) => {
  const d = parse(z.object({
    equipment_id: id,
    title: text(),
    description: optionalText(5000),
    interval_days: intervalDays,
    status: planStatus.default('Ativo'),
    auto_generate: z.boolean().default(true),
    lead_days: leadDays.default(0),
    checklist: checklistSchema.default([]),
  }), req.body);
  await assertEquipmentInTenant(d.equipment_id, req.tenantId);
  const result = await db.transaction(async (q) => {
    const created = await q(
      `INSERT INTO preventive_plans (tenant_id, equipment_id, title, description, interval_days, next_due, status, auto_generate, lead_days)
       VALUES (?, ?, ?, ?, ?, DATE_ADD(CURRENT_DATE, INTERVAL ? DAY), ?, ?, ?)`,
      [req.tenantId, d.equipment_id, d.title, d.description ?? null, d.interval_days, d.interval_days, d.status, d.auto_generate, d.lead_days]
    );
    await replaceChecklist(q, created.insertId, d.checklist);
    return created;
  });
  await audit(req, { action: 'create', entity: 'preventive_plan', entityId: result.insertId, changes: d });
  res.status(201).json({ id: result.insertId, ...d, tenant_id: req.tenantId });
});

router.put('/preventive-plans/:id', async (req, res) => {
  const planId = idParam(req);
  const d = parse(z.object({
    title: text().optional(),
    description: optionalText(5000),
    interval_days: intervalDays.optional(),
    status: planStatus.optional(),
    auto_generate: z.boolean().optional(),
    lead_days: leadDays.optional(),
    next_due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    checklist: checklistSchema.optional(),
    reset_due: z.boolean().optional(),
  }), req.body);

  // reset_due = manutenção executada hoje: recalcula o próximo vencimento a partir do intervalo (já atualizado)
  const columns = ['title', 'description', 'interval_days', 'status', 'auto_generate', 'lead_days', 'next_due'];
  const hasFields = columns.some((c) => d[c] !== undefined);
  if (!hasFields && !d.reset_due && d.checklist === undefined) throw new HttpError(400, 'Nenhum campo para atualizar');
  await db.transaction(async (q) => {
    const [plan] = await q('SELECT id FROM preventive_plans WHERE id = ? AND tenant_id = ? FOR UPDATE', [planId, req.tenantId]);
    if (!plan) throw new HttpError(404, 'Plano não encontrado');
    const fields = hasFields ? buildUpdate(d, columns) : { sql: '', params: [] };
    const sets = [fields.sql, d.reset_due && 'last_executed = CURRENT_DATE, next_due = DATE_ADD(CURRENT_DATE, INTERVAL interval_days DAY)']
      .filter(Boolean).join(', ');
    if (sets) await q(`UPDATE preventive_plans SET ${sets} WHERE id = ? AND tenant_id = ?`, [...fields.params, planId, req.tenantId]);
    if (d.checklist !== undefined) await replaceChecklist(q, planId, d.checklist);
  });
  await audit(req, { action: d.reset_due ? 'executed' : 'update', entity: 'preventive_plan', entityId: planId, changes: d });
  res.json({ message: 'Plano atualizado' });
});

router.delete('/preventive-plans/:id', async (req, res) => {
  const planId = idParam(req);
  assertAffected(await query('DELETE FROM preventive_plans WHERE id = ? AND tenant_id = ?', [planId, req.tenantId]), 'Plano não encontrado');
  await audit(req, { action: 'delete', entity: 'preventive_plan', entityId: planId });
  res.json({ message: 'Excluído com sucesso' });
});

module.exports = router;
