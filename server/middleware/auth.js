const jwt = require('jsonwebtoken');
const db = require('../db');
const { config } = require('../config');
const { isBackoffice } = require('./rbac');

const BLOCKED_STATUSES = ['Inadimplente', 'Cancelado'];

const signToken = (user) => jwt.sign(
  { id: user.id, v: user.token_version || 0 },
  config.jwtSecret,
  { expiresIn: config.jwtExpiresIn }
);

/**
 * Valida o JWT e recarrega o usuário do banco a cada requisição, para que
 * troca de senha, exclusão de usuário e bloqueio do cliente tenham efeito imediato.
 */
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido ou inválido' });
  }

  let payload;
  try {
    payload = jwt.verify(authHeader.slice(7), config.jwtSecret);
  } catch {
    return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
  }

  const [rows] = await db.query(
    `SELECT u.id, u.tenant_id, u.name, u.email, u.role, u.is_master, u.token_version, u.notifications_enabled, t.status AS tenant_status
     FROM users u LEFT JOIN tenants t ON t.id = u.tenant_id WHERE u.id = ?`,
    [payload.id]
  );
  const user = rows[0];
  if (!user || user.token_version !== payload.v) {
    return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
  }
  user.is_master = Boolean(user.is_master);

  if (!isBackoffice(user) && (!user.tenant_id || BLOCKED_STATUSES.includes(user.tenant_status))) {
    return res.status(403).json({ error: 'Acesso bloqueado. Entre em contato com o suporte.', code: 'TENANT_BLOCKED' });
  }

  req.user = user;
  next();
};

module.exports = { authMiddleware, signToken, BLOCKED_STATUSES };
