const db = require('../db');
const { query } = require('./routeHelpers');
const { HttpError } = require('./errorHandler');

// Recursos que o plano pode incluir (coluna em `plans`). Plano sem a coluna marcada bloqueia o recurso.
const FEATURES = {
  fmea: { column: 'has_fmea', label: 'A Análise FMEA' },
  simulator: { column: 'has_simulator', label: 'O Simulador de confiabilidade' },
  import: { column: 'has_import', label: 'A importação por planilha' },
};

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

const limitError = (plan, def, limit) => new HttpError(
  403,
  `O plano ${plan.name} permite até ${limit} ${def.label}. Faça upgrade do plano para adicionar mais.`,
  'PLAN_LIMIT'
);

/**
 * Recusa rápida (sem travar nada) se criar mais um recurso ultrapassar o limite do plano.
 * ATENÇÃO: sozinha ela NÃO impede o estouro quando há requisições simultâneas (conta e grava em passos
 * separados). Quem grava deve usar `withinLimit`; esta função serve só para recusar barato antes de um
 * trabalho caro (ex.: gerar o hash de senha).
 */
const assertWithinLimit = async (tenantId, resource) => {
  const def = RESOURCES[resource];
  const plan = await getTenantPlan(tenantId);
  const limit = plan?.[def.column];
  if (limit === null || limit === undefined) return;
  const [{ n }] = await query(def.count, [tenantId]);
  if (Number(n) >= limit) throw limitError(plan, def, limit);
};

/**
 * Cria `adding` registros de um recurso limitado SEM deixar o plano ser ultrapassado, mesmo com
 * requisições simultâneas: a contagem e a gravação acontecem na mesma transação, com a linha do cliente
 * travada (SELECT ... FOR UPDATE), então as criações do mesmo cliente passam uma de cada vez.
 *
 * `fn(q)` faz as gravações usando `q` (a conexão da transação) e devolve o resultado. Tudo que não depende
 * do limite (validações, hash de senha) deve ser feito ANTES, para a trava durar o mínimo possível.
 * Lança 403 PLAN_LIMIT se `adding` registros novos passarem do limite.
 */
const withinLimit = (tenantId, resource, adding, fn) => {
  const def = RESOURCES[resource];
  return db.transaction(async (q) => {
    await q('SELECT id FROM tenants WHERE id = ? FOR UPDATE', [tenantId]);
    const [plan] = await q('SELECT p.* FROM tenants t JOIN plans p ON p.id = t.plan_type WHERE t.id = ?', [tenantId]);
    const limit = plan?.[def.column];
    if (limit !== null && limit !== undefined) {
      const [{ n }] = await q(def.count, [tenantId]);
      if (Number(n) + adding > limit) throw limitError(plan, def, limit);
    }
    return fn(q);
  });
};

/** Recursos liberados no plano do cliente. Cliente sem plano cadastrado não tem restrições. */
const getFeatures = async (tenantId) => {
  const plan = await getTenantPlan(tenantId);
  const features = {};
  for (const [key, def] of Object.entries(FEATURES)) features[key] = plan ? Boolean(plan[def.column]) : true;
  return { plan_id: plan?.id ?? null, plan_name: plan?.name ?? null, features };
};

/** Middleware (depois de tenantScope): 403 PLAN_FEATURE se o plano do cliente não inclui o recurso. */
const requirePlanFeature = (feature) => async (req, res, next) => {
  try {
    const def = FEATURES[feature];
    const plan = await getTenantPlan(req.tenantId);
    if (plan && !plan[def.column]) {
      throw new HttpError(403, `${def.label} não está incluída no plano ${plan.name}. Faça upgrade do plano para usar.`, 'PLAN_FEATURE');
    }
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { FEATURES, getTenantPlan, getUsage, getFeatures, assertWithinLimit, withinLimit, requirePlanFeature };
