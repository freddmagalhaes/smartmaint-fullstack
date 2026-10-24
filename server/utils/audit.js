const db = require('../db');
const logger = require('./logger');

const SENSITIVE = /pass|token|secret|senha/i;

const sanitize = (value) => {
  if (!value || typeof value !== 'object') return value ?? null;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, SENSITIVE.test(k) ? '[oculto]' : v])
  );
};

/**
 * Registra uma ação no log de auditoria. Nunca interrompe a requisição: uma falha
 * ao auditar é registrada no log da aplicação e a operação principal segue.
 *
 * @param {object} req requisição (usuário, tenant e IP)
 * @param {{action: string, entity: string, entityId?: any, changes?: object, tenantId?: string}} entry
 */
const audit = async (req, { action, entity, entityId = null, changes = null, tenantId }) => {
  try {
    const user = req.user || {};
    await db.query(
      'INSERT INTO audit_logs (tenant_id, user_id, user_name, action, entity, entity_id, changes, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        tenantId !== undefined ? tenantId : (req.tenantId || user.tenant_id || null),
        user.id || null,
        user.name || null,
        action,
        entity,
        entityId === null ? null : String(entityId),
        changes ? JSON.stringify(sanitize(changes)) : null,
        req.ip || null,
      ]
    );
  } catch (err) {
    logger.error({ err, action, entity }, 'falha ao gravar auditoria');
  }
};

module.exports = { audit };
