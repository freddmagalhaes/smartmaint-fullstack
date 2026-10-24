const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { query } = require('../utils/routeHelpers');
const { HttpError } = require('../utils/errorHandler');
const { hashPassword } = require('../utils/passwords');
const { sendEmail, escapeHtml } = require('../utils/email');
const { signToken } = require('../middleware/auth');
const { ROLES } = require('../middleware/rbac');
const { publicUser } = require('./authRoutes');
const { parse, z, text, optionalText, email, password } = require('../utils/validate');
const { publicLegalInfo, recordAcceptance } = require('../utils/legal');
const { config } = require('../config');
const { audit } = require('../utils/audit');

const publicRouter = express.Router();
const legalRouter = express.Router();

const VERIFY_TTL_MS = 48 * 60 * 60 * 1000;

const limiter = (limit, windowMs = 60 * 60 * 1000) => rateLimit({
  windowMs,
  limit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas solicitações. Tente novamente mais tarde.' },
});
const signupLimiter = limiter(Number(process.env.RATE_LIMIT_SIGNUP_MAX) || 5);
const verifyLimiter = limiter(20);

// O token do e-mail vai no link; no banco fica só o hash (SHA-256 permite buscar pelo token)
const tokenHash = (token) => crypto.createHash('sha256').update(token).digest('hex');

const createVerifyToken = async (q, userId) => {
  const token = crypto.randomBytes(32).toString('hex');
  await q('UPDATE users SET email_verify_token = ?, email_verify_expiry = ? WHERE id = ?', [tokenHash(token), new Date(Date.now() + VERIFY_TTL_MS), userId]);
  return `${config.frontendUrl}/verificar-email?token=${token}`;
};

const sendVerifyEmail = (to, name, url) => sendEmail(to, 'Confirme seu e-mail - SmartMaint', `
  <h2>Olá, ${escapeHtml(name)}</h2>
  <p>Falta pouco para começar a usar o SmartMaint. Confirme seu e-mail pelo botão abaixo:</p>
  <p><a href="${escapeHtml(url)}" style="padding: 10px 20px; background: #1e3a8a; color: white; text-decoration: none; border-radius: 5px;">Confirmar e-mail</a></p>
  <p>O link vale por 48 horas. Se você não se cadastrou, ignore este e-mail.</p>
`);

// Quem tenta se cadastrar com um e-mail que já tem conta recebe um aviso, sem revelar isso na tela
const sendAlreadyRegisteredEmail = (to, name) => sendEmail(to, 'Você já tem uma conta no SmartMaint', `
  <h2>Olá, ${escapeHtml(name)}</h2>
  <p>Recebemos um pedido de cadastro com este e-mail, mas ele já tem uma conta no SmartMaint.</p>
  <p>Para entrar, acesse ${escapeHtml(config.frontendUrl)}/login. Se esqueceu a senha, use "Esqueci minha senha".</p>
  <p>Se não foi você, ignore este e-mail.</p>
`);

/** Identificador do cliente a partir do nome da empresa (ex.: "Metalúrgica São José" → metalurgica-sao-jose-4f2a). */
const tenantIdFor = (company) => {
  const base = company.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'cliente';
  return `${base}-${crypto.randomBytes(2).toString('hex')}`;
};

const signupAvailable = () => config.signup.enabled && (Boolean(config.smtp.host) || !config.isProduction);

// --- PÚBLICO ---
publicRouter.get('/public/info', (req, res) => {
  res.json({ legal: publicLegalInfo(), signup_enabled: signupAvailable() });
});

publicRouter.post('/signup', signupLimiter, async (req, res) => {
  if (!signupAvailable()) throw new HttpError(503, 'Cadastro indisponível no momento. Fale com a nossa equipe.');
  const d = parse(z.object({
    company: text(100),
    name: text(),
    email,
    password,
    phone: optionalText(30),
    accept_terms: z.literal(true, { message: 'é preciso aceitar os Termos de Uso e a Política de Privacidade' }),
    website: z.string().max(500).optional(), // campo invisível: só robôs preenchem
  }), req.body);

  const message = { message: 'Enviamos um link de confirmação para o seu e-mail. Confirme para acessar.' };
  if (d.website) return res.status(201).json(message);
  const [existing] = await query('SELECT id, name FROM users WHERE email = ?', [d.email]);
  if (existing) {
    await sendAlreadyRegisteredEmail(d.email, existing.name);
    return res.status(201).json(message);
  }

  const hash = await hashPassword(d.password);
  const { userId, tenantId, url } = await db.transaction(async (q) => {
    let id = tenantIdFor(d.company);
    while ((await q('SELECT 1 FROM tenants WHERE id = ?', [id])).length) id = tenantIdFor(d.company);
    await q(
      "INSERT INTO tenants (id, name, status, plan_type, contact_email, contact_phone, signup_source) VALUES (?, ?, 'Pendente', 'Pro', ?, ?, 'self')",
      [id, d.company, d.email, d.phone || null]
    );
    await q("INSERT INTO units (tenant_id, name) VALUES (?, 'Unidade Principal')", [id]);
    const result = await q(
      'INSERT INTO users (tenant_id, name, email, role, password, email_verified) VALUES (?, ?, ?, ?, ?, FALSE)',
      [id, d.name, d.email, ROLES.ADMIN, hash]
    );
    await recordAcceptance(q, { userId: result.insertId, tenantId: id, ip: req.ip, userAgent: req.get('user-agent') });
    return { userId: result.insertId, tenantId: id, url: await createVerifyToken(q, result.insertId) };
  });

  await sendVerifyEmail(d.email, d.name, url);
  await audit({ ip: req.ip, user: { id: userId, name: d.name } }, { action: 'signup', entity: 'tenant', entityId: tenantId, tenantId, changes: { company: d.company, email: d.email } });
  res.status(201).json(message);
});

publicRouter.post('/signup/verify', verifyLimiter, async (req, res) => {
  const { token } = parse(z.object({ token: z.string().regex(/^[a-f0-9]{64}$/, 'link inválido') }), req.body);
  const [user] = await query('SELECT * FROM users WHERE email_verify_token = ?', [tokenHash(token)]);
  if (!user || !user.email_verify_expiry || new Date(user.email_verify_expiry) < new Date()) {
    throw new HttpError(400, 'Link inválido ou expirado. Peça um novo na tela de login.');
  }
  await query('UPDATE users SET email_verified = TRUE, email_verify_token = NULL, email_verify_expiry = NULL WHERE id = ?', [user.id]);
  await audit({ ip: req.ip, user }, { action: 'email_verified', entity: 'user', entityId: user.id, tenantId: user.tenant_id });
  const [tenant] = await query('SELECT status FROM tenants WHERE id = ?', [user.tenant_id]);
  // Confirmar o e-mail já entra no sistema
  res.json({ ...publicUser(user), tenant_status: tenant?.status || null, legal_pending: false, token: signToken(user) });
});

publicRouter.post('/signup/resend', verifyLimiter, async (req, res) => {
  const generic = { message: 'Se houver um cadastro aguardando confirmação, enviamos um novo link.' };
  const parsed = z.object({ email }).safeParse(req.body ?? {});
  if (!parsed.success) return res.json(generic);
  const [user] = await query('SELECT id, name, email FROM users WHERE email = ? AND email_verified = FALSE', [parsed.data.email]);
  if (user) await sendVerifyEmail(user.email, user.name, await createVerifyToken(query, user.id));
  res.json(generic);
});

// --- AUTENTICADO: ACEITE DOS DOCUMENTOS LEGAIS ---
legalRouter.post('/legal/accept', async (req, res) => {
  parse(z.object({ accept: z.literal(true, { message: 'confirme o aceite' }) }), req.body);
  await db.transaction((q) => recordAcceptance(q, { userId: req.user.id, tenantId: req.user.tenant_id, ip: req.ip, userAgent: req.get('user-agent') }));
  await audit(req, { action: 'legal_accept', entity: 'user', entityId: req.user.id, tenantId: req.user.tenant_id });
  res.json({ legal_pending: false });
});

module.exports = { publicRouter, legalRouter };
