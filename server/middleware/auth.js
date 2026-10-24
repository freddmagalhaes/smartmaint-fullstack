const jwt = require('jsonwebtoken');
const db = require('../db');
const { config } = require('../config');
const { isBackoffice } = require('./rbac');
const { LEGAL_VERSION } = require('../utils/legal');

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
    `SELECT u.id, u.tenant_id, u.name, u.email, u.role, u.is_master, u.token_version, u.notifications_enabled,
            u.legal_version_accepted, t.status AS tenant_status
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

/** Usuário do cliente que ainda não aceitou a versão vigente dos Termos e da Política de Privacidade. */
const legalPending = (user) => !isBackoffice(user) && user.legal_version_accepted !== LEGAL_VERSION;

/** Até aceitar os documentos legais, o usuário só acessa o próprio perfil e o aceite. */
const requireLegalAcceptance = (req, res, next) => {
  if (legalPending(req.user)) {
    return res.status(403).json({ error: 'Aceite os Termos de Uso e a Política de Privacidade para continuar.', code: 'LEGAL_ACCEPTANCE_REQUIRED' });
  }
  next();
};

// Conta criada pelo cadastro e ainda sem assinatura: só faturamento, planos e dados da empresa
const PENDING_ALLOWED = [/^\/billing\//, /^\/plans$/, /^\/tenants?$/, /^\/export$/];

const requireSubscription = (req, res, next) => {
  if (!isBackoffice(req.user) && req.user.tenant_status === 'Pendente' && !PENDING_ALLOWED.some((re) => re.test(req.path))) {
    return res.status(403).json({ error: 'Escolha um plano para começar a usar o SmartMaint.', code: 'SUBSCRIPTION_REQUIRED' });
  }
  next();
};

module.exports = { authMiddleware, signToken, BLOCKED_STATUSES, legalPending, requireLegalAcceptance, requireSubscription };
