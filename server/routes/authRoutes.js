const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const { query } = require('../utils/routeHelpers');
const { HttpError } = require('../utils/errorHandler');
const { sendPasswordResetEmail } = require('../utils/email');
const { hashPassword, createPasswordLink, RESET_TTL_MS } = require('../utils/passwords');
const { signToken, BLOCKED_STATUSES, legalPending } = require('../middleware/auth');
const { isBackoffice } = require('../middleware/rbac');
const { parse, z, email, password, id } = require('../utils/validate');
const { config } = require('../config');
const { audit } = require('../utils/audit');

const router = express.Router();

// Hash fixo usado quando o e-mail não existe, para o tempo de resposta não revelar contas cadastradas
const DUMMY_HASH = bcrypt.hashSync('smartmaint-dummy-password', 12);

const publicUser = (u) => ({
  id: u.id,
  tenant_id: u.tenant_id,
  name: u.name,
  email: u.email,
  role: u.role,
  is_master: Boolean(u.is_master),
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.rateLimit.loginMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
});

const recoveryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas solicitações. Tente novamente mais tarde.' },
});

router.post('/login', loginLimiter, async (req, res) => {
  const { email: userEmail, password: plain } = parse(z.object({
    email,
    password: z.string().min(1).max(128),
  }), req.body);

  const rows = await query('SELECT * FROM users WHERE email = ?', [userEmail]);
  const user = rows[0];
  const isValid = await bcrypt.compare(plain, user ? user.password : DUMMY_HASH);
  if (!user || !isValid) {
    if (user) await audit({ ip: req.ip, user }, { action: 'login_failed', entity: 'user', entityId: user.id, tenantId: user.tenant_id });
    throw new HttpError(401, 'Credenciais inválidas');
  }

  let tenantStatus = null;
  if (!isBackoffice(user)) {
    const tenantRows = await query('SELECT status FROM tenants WHERE id = ?', [user.tenant_id]);
    if (tenantRows.length === 0 || BLOCKED_STATUSES.includes(tenantRows[0].status)) {
      throw new HttpError(403, 'Acesso bloqueado. Entre em contato com o suporte.', 'TENANT_BLOCKED');
    }
    tenantStatus = tenantRows[0].status;
  }
  if (!user.email_verified) {
    throw new HttpError(403, 'Confirme seu e-mail pelo link que enviamos para acessar.', 'EMAIL_NOT_VERIFIED');
  }

  await audit({ ip: req.ip, user }, { action: 'login', entity: 'user', entityId: user.id, tenantId: user.tenant_id });
  res.json({ ...publicUser(user), tenant_status: tenantStatus, legal_pending: legalPending(user), token: signToken(user) });
});

router.post('/auth/forgot-password', recoveryLimiter, async (req, res) => {
  const genericResponse = { message: 'Se o e-mail existir, um link de recuperação será enviado.' };
  const parsed = z.object({ email }).safeParse(req.body ?? {});
  if (!parsed.success) return res.json(genericResponse);

  const rows = await query('SELECT id, name, email FROM users WHERE email = ?', [parsed.data.email]);
  if (rows.length > 0) {
    const user = rows[0];
    const url = await createPasswordLink(query, user.id, RESET_TTL_MS);
    await sendPasswordResetEmail(user.email, user.name, url);
  }
  res.json(genericResponse);
});

router.post('/auth/reset-password', recoveryLimiter, async (req, res) => {
  const data = parse(z.object({
    id,
    token: z.string().min(1).max(200),
    newPassword: password,
  }), req.body);

  const rows = await query('SELECT tenant_id, reset_token, reset_token_expiry FROM users WHERE id = ?', [data.id]);
  const user = rows[0];
  if (!user || !user.reset_token || !user.reset_token_expiry) throw new HttpError(400, 'Link inválido ou expirado.');
  if (new Date() > new Date(user.reset_token_expiry)) throw new HttpError(400, 'Link expirado. Solicite novamente.');
  if (!(await bcrypt.compare(data.token, user.reset_token))) throw new HttpError(400, 'Link inválido ou expirado.');

  // token_version + 1 encerra todas as sessões abertas com a senha antiga.
  // O link chegou por e-mail, então o e-mail também fica confirmado.
  await query(
    `UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL, token_version = token_version + 1,
       email_verified = TRUE, email_verify_token = NULL, email_verify_expiry = NULL WHERE id = ?`,
    [await hashPassword(data.newPassword), data.id]
  );
  await audit({ ip: req.ip, user: { id: data.id } }, { action: 'password_reset', entity: 'user', entityId: data.id, tenantId: user.tenant_id });
  res.json({ message: 'Senha alterada com sucesso!' });
});

module.exports = { router, publicUser };
