const express = require('express');
const { pageParams, paginate, like } = require('../utils/pagination');
const { ROLES, isBackoffice, requireRole } = require('../middleware/rbac');
const { parse, z, date, id } = require('../utils/validate');

const router = express.Router();

const parseChanges = (value) => {
  if (value === null || typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return value; }
};

/**
 * Log de auditoria. Administradores veem o do próprio cliente; o backoffice vê o de
 * qualquer cliente (tenant_id) ou o próprio log do backoffice (scope=backoffice).
 */
router.get('/audit', requireRole(ROLES.ADMIN), async (req, res) => {
  const { page, pageSize, q } = pageParams(req);
  const f = parse(z.object({
    tenant_id: z.string().max(50).optional(),
    scope: z.enum(['backoffice']).optional(),
    entity: z.string().max(50).optional(),
    user_id: id.optional(),
    from: date.optional(),
    to: date.optional(),
  }), req.query);

  const where = [];
  const params = [];
  if (!isBackoffice(req.user)) {
    where.push('a.tenant_id = ?');
    params.push(req.user.tenant_id);
  } else if (f.scope === 'backoffice') {
    where.push('a.tenant_id IS NULL');
  } else if (f.tenant_id) {
    where.push('a.tenant_id = ?');
    params.push(f.tenant_id);
  }
  if (f.entity) { where.push('a.entity = ?'); params.push(f.entity); }
  if (f.user_id) { where.push('a.user_id = ?'); params.push(f.user_id); }
  if (f.from) { where.push('a.created_at >= ?'); params.push(f.from); }
  if (f.to) { where.push('a.created_at < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(f.to); }
  if (q) { where.push('(a.user_name LIKE ? OR a.entity_id = ?)'); params.push(like(q), q); }

  const result = await paginate({
    select: 'a.id, a.tenant_id, a.user_id, a.user_name, a.action, a.entity, a.entity_id, a.changes, a.ip, a.created_at',
    from: 'audit_logs a',
    where, params, orderBy: 'a.id DESC', page, pageSize,
  });
  result.items = result.items.map((row) => ({ ...row, changes: parseChanges(row.changes) }));
  res.json(result);
});

module.exports = router;
