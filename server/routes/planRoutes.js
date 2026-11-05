const express = require('express');
const router = express.Router();
const { getTenantId } = require('../utils/routeHelpers');
const { handleQueryError } = require('../utils/errorHandler');
const { getLimits } = require('../utils/plans');
const { getUsage, loadTenant } = require('../utils/planLimits');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// Plano, limites e uso do tenant (próprio; master/suporte podem consultar outro via ?tenant_id)
router.get('/plan', async (req, res) => {
  const tenantId = getTenantId(req);
  if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });
  try {
    const tenant = await loadTenant(tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant não encontrado' });
    const { plan, assets, users, features } = getLimits(tenant);
    res.json({ plan, limits: { assets, users }, usage: await getUsage(tenantId), features });
  } catch (err) { handleQueryError(res, err, 'Erro ao consultar plano'); }
});

module.exports = router;
