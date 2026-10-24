const express = require('express');
const { query, assertAffected, buildUpdate } = require('../utils/routeHelpers');
const { getUsage } = require('../utils/plans');
const { audit } = require('../utils/audit');
const { ROLES, requireRole, requireMaster, tenantScope } = require('../middleware/rbac');
const { parse, z, text } = require('../utils/validate');

const router = express.Router();

// Limite vazio (null) = ilimitado
// z.null() vem primeiro: z.coerce.number() transformaria null em 0 (bloquearia tudo)
const limit = z.union([z.null(), z.coerce.number().int().min(0)]).optional();

router.get('/plans', async (req, res) => {
  res.json(await query('SELECT * FROM plans ORDER BY sort_order, price_monthly'));
});

router.put('/admin/plans/:id', requireMaster, async (req, res) => {
  const planId = parse(z.object({ id: z.string().min(1).max(50) }), req.params).id;
  const d = parse(z.object({
    name: text(100).optional(),
    price_monthly: z.coerce.number().min(0).optional(),
    max_users: limit,
    max_equipments: limit,
    max_units: limit,
    trial_days: z.coerce.number().int().min(0).max(365).optional(),
    active: z.boolean().optional(),
  }), req.body);
  const { sql, params } = buildUpdate(d, ['name', 'price_monthly', 'max_users', 'max_equipments', 'max_units', 'trial_days', 'active']);
  assertAffected(await query(`UPDATE plans SET ${sql} WHERE id = ?`, [...params, planId]), 'Plano não encontrado');
  await audit(req, { action: 'update', entity: 'plan', entityId: planId, changes: d, tenantId: null });
  res.json({ message: 'Plano atualizado' });
});

// Uso do cliente frente aos limites do plano (exibido em Configurações > Faturamento)
router.get('/billing/usage', requireRole(ROLES.ADMIN), tenantScope, async (req, res) => {
  res.json(await getUsage(req.tenantId));
});

module.exports = router;
