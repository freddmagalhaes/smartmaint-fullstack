const db = require('../db');
const { HttpError } = require('../utils/errorHandler');

const ROLES = {
  ROOT: 'Dono',            // Dono do sistema (is_master)
  SUPPORT: 'Suporte',      // Backoffice / suporte ao cliente
  ADMIN: 'Administrador',  // Responsável da empresa contratante
  MANAGER: 'Gerente',      // Gerente / supervisor
  USER: 'Usuário',         // Abre e acompanha chamados
};

// Perfis que um cliente pode atribuir aos próprios usuários
const TENANT_ROLES = [ROLES.ADMIN, ROLES.MANAGER, ROLES.USER];
const MANAGERS = [ROLES.ADMIN, ROLES.MANAGER];

const isBackoffice = (user) => Boolean(user?.is_master) || user?.role === ROLES.SUPPORT;

/** Libera a rota para os perfis informados. Backoffice (Root/Suporte) sempre tem acesso. */
const requireRole = (...roles) => (req, res, next) => {
  if (isBackoffice(req.user) || roles.includes(req.user.role)) return next();
  return res.status(403).json({ error: 'Você não tem permissão para esta ação' });
};

const requireBackoffice = (req, res, next) => {
  if (isBackoffice(req.user)) return next();
  return res.status(403).json({ error: 'Proibido' });
};

const requireMaster = (req, res, next) => {
  if (req.user.is_master) return next();
  return res.status(403).json({ error: 'Apenas o Root pode realizar esta ação' });
};

/**
 * Define req.tenantId. Usuários de clientes ficam sempre presos ao próprio tenant;
 * o backoffice precisa informar tenant_id (query ou body) e o tenant precisa existir.
 */
const tenantScope = async (req, res, next) => {
  if (!isBackoffice(req.user)) {
    req.tenantId = req.user.tenant_id;
    return next();
  }
  const tenantId = req.query.tenant_id || req.body?.tenant_id;
  if (!tenantId || typeof tenantId !== 'string') throw new HttpError(400, 'tenant_id é obrigatório');
  const [rows] = await db.query('SELECT id FROM tenants WHERE id = ?', [tenantId]);
  if (rows.length === 0) throw new HttpError(404, 'Cliente não encontrado');
  req.tenantId = tenantId;
  next();
};

module.exports = {
  ROLES, TENANT_ROLES, MANAGERS,
  isBackoffice, requireRole, requireBackoffice, requireMaster, tenantScope,
};
