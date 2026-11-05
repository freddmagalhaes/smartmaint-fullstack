const express = require('express');
const { query, assertAffected, buildUpdate } = require('../utils/routeHelpers');
const { getUsage, getFeatures } = require('../utils/plans');
const { audit } = require('../utils/audit');
const { ROLES, TENANT_ROLES, requireRole, requireMaster, tenantScope } = require('../middleware/rbac');
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
    price_annual: z.union([z.null(), z.coerce.number().min(0)]).optional(), // total por ano; vazio = sem cobrança anual
    max_users: limit,
    max_equipments: limit,
    max_units: limit,
    trial_days: z.coerce.number().int().min(0).max(365).optional(),
    has_fmea: z.boolean().optional(),
    has_simulator: z.boolean().optional(),
    has_import: z.boolean().optional(),
    active: z.boolean().optional(),
  }), req.body);
  const { sql, params } = buildUpdate(d, ['name', 'price_monthly', 'price_annual', 'max_users', 'max_equipments', 'max_units', 'trial_days', 'has_fmea', 'has_simulator', 'has_import', 'active']);
  assertAffected(await query(`UPDATE plans SET ${sql} WHERE id = ?`, [...params, planId]), 'Plano não encontrado');
  await audit(req, { action: 'update', entity: 'plan', entityId: planId, changes: d, tenantId: null });
  res.json({ message: 'Plano atualizado' });
});

// Uso do cliente frente aos limites do plano (exibido em Configurações > Faturamento)
router.get('/billing/usage', requireRole(ROLES.ADMIN), tenantScope, async (req, res) => {
  res.json(await getUsage(req.tenantId));
});

// Recursos do plano do cliente (a interface bloqueia FMEA, simulador e importação de quem não os tem).
// Qualquer perfil do cliente pode consultar; o servidor aplica o bloqueio de verdade nas rotas.
router.get('/plan/features', requireRole(...TENANT_ROLES), tenantScope, async (req, res) => {
  res.json(await getFeatures(req.tenantId));
});

module.exports = router;
