const { query } = require('./routeHelpers');
const { HttpError } = require('./errorHandler');

const RESOURCES = {
  users: { column: 'max_users', label: 'usuários', count: 'SELECT COUNT(*) AS n FROM users WHERE tenant_id = ?' },
  equipments: { column: 'max_equipments', label: 'equipamentos', count: 'SELECT COUNT(*) AS n FROM equipments WHERE tenant_id = ?' },
  units: { column: 'max_units', label: 'unidades', count: 'SELECT COUNT(*) AS n FROM units WHERE tenant_id = ?' },
};

/** Plano do cliente. Cliente sem plano cadastrado não tem limites (nunca bloqueia clientes antigos). */
const getTenantPlan = async (tenantId) => {
  const [row] = await query(
    'SELECT p.* FROM tenants t JOIN plans p ON p.id = t.plan_type WHERE t.id = ?',
    [tenantId]
  );
  return row || null;
};

/** Uso atual e limites do plano: { plan, usage: { users: { used, limit }, ... } } */
const getUsage = async (tenantId) => {
  const plan = await getTenantPlan(tenantId);
  const usage = {};
  for (const [key, def] of Object.entries(RESOURCES)) {
    const [{ n }] = await query(def.count, [tenantId]);
    usage[key] = { used: Number(n), limit: plan ? plan[def.column] : null };
  }
  return { plan, usage };
};

/** Lança 403 (code PLAN_LIMIT) se criar mais um recurso ultrapassar o limite do plano. */
const assertWithinLimit = async (tenantId, resource) => {
  const def = RESOURCES[resource];
  const plan = await getTenantPlan(tenantId);
  const limit = plan?.[def.column];
  if (limit === null || limit === undefined) return;
  const [{ n }] = await query(def.count, [tenantId]);
  if (Number(n) >= limit) {
    throw new HttpError(
      403,
      `O plano ${plan.name} permite até ${limit} ${def.label}. Faça upgrade do plano para adicionar mais.`,
      'PLAN_LIMIT'
    );
  }
};

module.exports = { getTenantPlan, getUsage, assertWithinLimit };
