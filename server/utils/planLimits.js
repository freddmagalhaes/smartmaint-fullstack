const db = require('../db');
const { query, getTenantId } = require('./routeHelpers');
const { getLimits } = require('./plans');

const RESOURCES = {
  assets: { table: 'equipments', message: (n) => `Limite de ${n} ativos do seu plano atingido. Faça upgrade para cadastrar mais.` },
  users: { table: 'users', message: (n) => `Limite de ${n} usuários do seu plano atingido. Faça upgrade para adicionar mais.` },
};

const loadTenant = async (tenantId) => {
  const rows = await query('SELECT id, plan_type, extra_assets, extra_users FROM tenants WHERE id = ?', [tenantId]);
  return rows[0] || null;
};

// Uso atual do tenant (para exibir no painel e nos testes)
const getUsage = async (tenantId) => {
  const [[a], [u]] = await Promise.all([
    db.query('SELECT COUNT(*) AS n FROM equipments WHERE tenant_id = ?', [tenantId]).then(([r]) => r),
    db.query('SELECT COUNT(*) AS n FROM users WHERE tenant_id = ?', [tenantId]).then(([r]) => r),
  ]);
  return { assets: a.n, users: u.n };
};

/**
 * Executa `fn(conn, tenant)` numa transação com o tenant travado (FOR UPDATE).
 * Contagem de uso + gravação dentro dela ficam serializadas por cliente, então requisições
 * simultâneas não conseguem ultrapassar o limite do plano.
 * Retorna { notFound: true } se o tenant não existe; senão o retorno de `fn`.
 * Se `fn` devolver { rollback: true, ... }, a transação é desfeita (uso em pré-visualização/recusas).
 */
const withTenantLock = async (tenantId, fn) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [tenants] = await conn.query(
      'SELECT id, plan_type, extra_assets, extra_users FROM tenants WHERE id = ? FOR UPDATE',
      [tenantId]
    );
    if (tenants.length === 0) {
      await conn.rollback();
      return { notFound: true };
    }
    const result = await fn(conn, tenants[0]);
    if (result && result.rollback) await conn.rollback();
    else await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
};

/**
 * Insere um registro respeitando o limite do plano.
 * Retorna { insertId } ou { limitReached: true, limit, message } ou { notFound: true }.
 */
const insertWithinLimit = (tenantId, resource, insertSql, insertParams) => {
  const { table, message } = RESOURCES[resource];
  return withTenantLock(tenantId, async (conn, tenant) => {
    const limit = getLimits(tenant)[resource];
    if (limit !== null) {
      const [[row]] = await conn.query(`SELECT COUNT(*) AS n FROM ${table} WHERE tenant_id = ?`, [tenantId]);
      if (row.n >= limit) return { rollback: true, limitReached: true, limit, message: message(limit) };
    }
    const [result] = await conn.query(insertSql, insertParams);
    return { insertId: result.insertId };
  });
};

// Middleware: bloqueia rotas de módulos que o plano do tenant acessado não inclui
const requireFeature = (feature) => async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return next(); // sem tenant definido a própria rota responde
    const tenant = await loadTenant(tenantId);
    if (tenant && !getLimits(tenant).features[feature]) {
      return res.status(403).json({
        code: 'FEATURE_NOT_IN_PLAN',
        error: 'Este recurso não está incluído no seu plano. Faça upgrade para usá-lo.',
      });
    }
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { withTenantLock, insertWithinLimit, requireFeature, getUsage, loadTenant };
