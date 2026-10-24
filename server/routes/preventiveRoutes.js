const express = require('express');
const { query, assertEquipmentInTenant, assertAffected, buildUpdate } = require('../utils/routeHelpers');
const { MANAGERS, requireRole, tenantScope } = require('../middleware/rbac');
const { parse, z, text, optionalText, id, idParam } = require('../utils/validate');

const router = express.Router();

const intervalDays = z.coerce.number().int().min(1).max(3650);
const planStatus = z.enum(['Ativo', 'Pausado']);

router.use('/preventive-plans', requireRole(...MANAGERS), tenantScope);

router.get('/preventive-plans', async (req, res) => {
  res.json(await query(
    `SELECT p.*, e.name AS equipment_name FROM preventive_plans p
     JOIN equipments e ON p.equipment_id = e.id AND e.tenant_id = p.tenant_id
     WHERE p.tenant_id = ? ORDER BY p.next_due`,
    [req.tenantId]
  ));
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
  res.json({ message: 'Plano atualizado' });
});

router.delete('/preventive-plans/:id', async (req, res) => {
  assertAffected(await query('DELETE FROM preventive_plans WHERE id = ? AND tenant_id = ?', [idParam(req), req.tenantId]), 'Plano não encontrado');
  res.json({ message: 'Excluído com sucesso' });
});

module.exports = router;
