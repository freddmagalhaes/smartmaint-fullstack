const express = require('express');
const { query, assertEquipmentInTenant, assertAffected, buildUpdate } = require('../utils/routeHelpers');
const { MANAGERS, requireRole, tenantScope } = require('../middleware/rbac');
const { parse, z, text, optionalText, id, idParam } = require('../utils/validate');
const { pageParams, paginate, like } = require('../utils/pagination');
const { audit } = require('../utils/audit');

const router = express.Router();

const intervalDays = z.coerce.number().int().min(1).max(3650);
const planStatus = z.enum(['Ativo', 'Pausado']);

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
    select: 'p.*, e.name AS equipment_name, e.unit_id',
    from: 'preventive_plans p JOIN equipments e ON p.equipment_id = e.id AND e.tenant_id = p.tenant_id',
    where, params, orderBy: 'p.next_due, p.id', page, pageSize,
  }));
});

router.post('/preventive-plans', async (req, res) => {
  const d = parse(z.object({
    equipment_id: id,
    title: text(),
    description: optionalText(5000),
    interval_days: intervalDays,
    status: planStatus.default('Ativo'),
  }), req.body);
  await assertEquipmentInTenant(d.equipment_id, req.tenantId);
  const result = await query(
    'INSERT INTO preventive_plans (tenant_id, equipment_id, title, description, interval_days, next_due, status) VALUES (?, ?, ?, ?, ?, DATE_ADD(CURRENT_DATE, INTERVAL ? DAY), ?)',
    [req.tenantId, d.equipment_id, d.title, d.description ?? null, d.interval_days, d.interval_days, d.status]
  );
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
    reset_due: z.boolean().optional(),
  }), req.body);

  // reset_due = manutenção executada hoje: recalcula o próximo vencimento a partir do intervalo (já atualizado)
  const columns = ['title', 'description', 'interval_days', 'status'];
  const hasFields = columns.some((c) => d[c] !== undefined);
  const fields = hasFields || !d.reset_due ? buildUpdate(d, columns) : { sql: '', params: [] };
  const sets = [fields.sql, d.reset_due && 'last_executed = CURRENT_DATE, next_due = DATE_ADD(CURRENT_DATE, INTERVAL interval_days DAY)']
    .filter(Boolean).join(', ');
  assertAffected(await query(`UPDATE preventive_plans SET ${sets} WHERE id = ? AND tenant_id = ?`, [...fields.params, planId, req.tenantId]), 'Plano não encontrado');
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
