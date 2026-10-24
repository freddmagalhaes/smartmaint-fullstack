const express = require('express');
const db = require('../db');
const { query, assertAffected, buildUpdate } = require('../utils/routeHelpers');
const { HttpError } = require('../utils/errorHandler');
const { initialPassword, sendInvite } = require('../utils/passwords');
const {
  ROLES, TENANT_ROLES, isBackoffice, requireRole, requireBackoffice, requireMaster, tenantScope,
} = require('../middleware/rbac');
const { parse, z, text, optionalText, date, nonNegative, password, email, idParam } = require('../utils/validate');

const router = express.Router();

const TENANT_STATUSES = ['Ativo', 'Inadimplente', 'Cancelado', 'Trial'];
const tenantSlug = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,49}$/, 'use apenas letras minúsculas, números e hífen (2 a 50 caracteres)');
const tenantParam = (req) => parse(z.object({ id: tenantSlug }), req.params).id;

// --- BACKOFFICE: CLIENTES ---
router.get('/admin/tenants', requireBackoffice, async (req, res) => {
  const rows = await query(`
    SELECT t.*,
           (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) AS users_count,
           (SELECT COUNT(*) FROM equipments e WHERE e.tenant_id = t.id) AS equipments_count,
           (SELECT COUNT(*) FROM invoices i WHERE i.tenant_id = t.id AND i.status IN ('Pendente', 'Atrasada')) AS pending_invoices,
           (SELECT COALESCE(SUM(i.valor), 0) FROM invoices i WHERE i.tenant_id = t.id AND i.status IN ('Pendente', 'Atrasada')) AS pending_value
    FROM tenants t ORDER BY t.name
  `);
  res.json(rows);
});

router.post('/admin/tenants', requireBackoffice, async (req, res) => {
  const data = parse(z.object({
    id: tenantSlug,
    name: text(),
    plan_type: optionalText(50),
    contact_email: email,
    contact_phone: optionalText(50),
    admin_name: optionalText(),
  }), req.body);

  const exists = await query('SELECT id FROM users WHERE email = ?', [data.contact_email]);
  if (exists.length > 0) throw new HttpError(409, 'Já existe um usuário com este e-mail');

  const { hash } = await initialPassword();
  const admin = await db.transaction(async (q) => {
    await q(
      'INSERT INTO tenants (id, name, plan_type, contact_email, contact_phone) VALUES (?, ?, ?, ?, ?)',
      [data.id, data.name, data.plan_type || 'Pro', data.contact_email, data.contact_phone || null]
    );
    const adminName = data.admin_name || `Admin ${data.name}`;
    const result = await q(
      'INSERT INTO users (tenant_id, name, email, role, password) VALUES (?, ?, ?, ?, ?)',
      [data.id, adminName, data.contact_email, ROLES.ADMIN, hash]
    );
    return { id: result.insertId, name: adminName, email: data.contact_email };
  });

  const inviteSent = await sendInvite(query, admin, data.name);
  res.status(201).json({ message: 'Cliente cadastrado', id: data.id, invite_sent: inviteSent });
});

router.put('/admin/tenants/:id', requireBackoffice, async (req, res) => {
  const tenantId = tenantParam(req);
  const data = parse(z.object({
    name: text().optional(),
    plan_type: text(50).optional(),
    contact_email: email.optional(),
    contact_phone: optionalText(50),
  }), req.body);
  const { sql, params } = buildUpdate(data, ['name', 'plan_type', 'contact_email', 'contact_phone']);
  assertAffected(await query(`UPDATE tenants SET ${sql} WHERE id = ?`, [...params, tenantId]), 'Cliente não encontrado');
  res.json({ message: 'Cliente atualizado' });
});

router.put('/admin/tenants/:id/status', requireBackoffice, async (req, res) => {
  const tenantId = tenantParam(req);
  const { status } = parse(z.object({ status: z.enum(TENANT_STATUSES) }), req.body);
  assertAffected(await query('UPDATE tenants SET status = ? WHERE id = ?', [status, tenantId]), 'Cliente não encontrado');
  res.json({ message: 'Status atualizado' });
});

router.delete('/admin/tenants/:id', requireMaster, async (req, res) => {
  const tenantId = tenantParam(req);
  assertAffected(await query('DELETE FROM tenants WHERE id = ?', [tenantId]), 'Cliente não encontrado');
  res.json({ message: 'Cliente excluído permanentemente' });
});

router.put('/admin/tenants/:id/contract', requireBackoffice, async (req, res) => {
  const tenantId = tenantParam(req);
  const data = parse(z.object({
    contrato_inicio: date.or(z.literal('')).optional(),
    contrato_fim: date.or(z.literal('')).optional(),
    renovacao_auto: z.union([z.boolean(), z.number().int().min(0).max(1).transform(Boolean)]).optional(),
    valor_mensal: nonNegative.optional(),
    plan_type: text(50).optional(),
    status: z.enum(TENANT_STATUSES).optional(),
  }), req.body);
  // Campo de data vazio no formulário significa "sem data"
  for (const key of ['contrato_inicio', 'contrato_fim']) if (data[key] === '') data[key] = null;

  const { sql, params } = buildUpdate(data, ['contrato_inicio', 'contrato_fim', 'renovacao_auto', 'valor_mensal', 'plan_type', 'status']);
  assertAffected(await query(`UPDATE tenants SET ${sql} WHERE id = ?`, [...params, tenantId]), 'Cliente não encontrado');
  res.json({ message: 'Contrato atualizado' });
});

// --- BACKOFFICE: EQUIPE DE SUPORTE ---
router.get('/admin/users', requireMaster, async (req, res) => {
  const rows = await query("SELECT id, name, email, role, is_master, created_at FROM users WHERE is_master = TRUE OR role = 'Suporte' ORDER BY name");
  res.json(rows);
});

router.post('/admin/users', requireMaster, async (req, res) => {
  const data = parse(z.object({ name: text(), email, password: password.optional().or(z.literal('')) }), req.body);
  const { hash, invite } = await initialPassword(data.password || null);
  const result = await query(
    "INSERT INTO users (tenant_id, name, email, role, password, is_master) VALUES (NULL, ?, ?, 'Suporte', ?, FALSE)",
    [data.name, data.email, hash]
  );
  const user = { id: result.insertId, name: data.name, email: data.email };
  const inviteSent = invite ? await sendInvite(query, user, null) : false;
  res.status(201).json({ ...user, role: ROLES.SUPPORT, invite_sent: inviteSent });
});

// --- DADOS DO CLIENTE ---
router.get('/tenants', async (req, res) => {
  const rows = isBackoffice(req.user)
    ? await query('SELECT * FROM tenants ORDER BY name')
    : await query('SELECT * FROM tenants WHERE id = ?', [req.user.tenant_id]);
  res.json(rows);
});

router.put('/tenant', requireRole(ROLES.ADMIN), tenantScope, async (req, res) => {
  const data = parse(z.object({
    name: text().optional(),
    cnpj: optionalText(20),
    contact_email: email.optional(),
    contact_phone: optionalText(50),
  }), req.body);
  const { sql, params } = buildUpdate(data, ['name', 'cnpj', 'contact_email', 'contact_phone']);
  await query(`UPDATE tenants SET ${sql} WHERE id = ?`, [...params, req.tenantId]);
  res.json({ message: 'Dados da empresa atualizados' });
});

// --- EQUIPE DO CLIENTE ---
router.get('/users', tenantScope, async (req, res) => {
  // Todos os perfis veem nomes (ex.: responsável da O.S.); e-mails só para administradores
  const canSeeEmail = isBackoffice(req.user) || req.user.role === ROLES.ADMIN;
  const columns = canSeeEmail ? 'id, name, email, role, tenant_id' : 'id, name, role, tenant_id';
  res.json(await query(`SELECT ${columns} FROM users WHERE tenant_id = ? ORDER BY name`, [req.tenantId]));
});

router.post('/users', requireRole(ROLES.ADMIN), tenantScope, async (req, res) => {
  const data = parse(z.object({
    name: text(),
    email,
    role: z.enum(TENANT_ROLES),
    password: password.optional().or(z.literal('')),
  }), req.body);

  const { hash, invite } = await initialPassword(data.password || null);
  const result = await query(
    'INSERT INTO users (tenant_id, name, email, role, password) VALUES (?, ?, ?, ?, ?)',
    [req.tenantId, data.name, data.email, data.role, hash]
  );
  const user = { id: result.insertId, name: data.name, email: data.email };
  let inviteSent = false;
  if (invite) {
    const [tenant] = await query('SELECT name FROM tenants WHERE id = ?', [req.tenantId]);
    inviteSent = await sendInvite(query, user, tenant?.name);
  }
  res.status(201).json({ ...user, role: data.role, tenant_id: req.tenantId, invite_sent: inviteSent });
});

router.put('/users/:id', requireRole(ROLES.ADMIN), tenantScope, async (req, res) => {
  const userId = idParam(req);
  const data = parse(z.object({ name: text().optional(), email: email.optional(), role: z.enum(TENANT_ROLES).optional() }), req.body);
  if (userId === req.user.id && data.role && data.role !== req.user.role) {
    throw new HttpError(400, 'Você não pode alterar o seu próprio perfil de acesso');
  }
  const { sql, params } = buildUpdate(data, ['name', 'email', 'role']);
  assertAffected(
    await query(`UPDATE users SET ${sql} WHERE id = ? AND tenant_id = ? AND is_master = FALSE`, [...params, userId, req.tenantId]),
    'Usuário não encontrado'
  );
  res.json({ message: 'Usuário atualizado' });
});

router.delete('/users/:id', requireRole(ROLES.ADMIN), tenantScope, async (req, res) => {
  const userId = idParam(req);
  if (userId === req.user.id) throw new HttpError(400, 'Você não pode excluir o seu próprio usuário');
  assertAffected(
    await query('DELETE FROM users WHERE id = ? AND tenant_id = ? AND is_master = FALSE', [userId, req.tenantId]),
    'Usuário não encontrado'
  );
  res.json({ message: 'Usuário excluído' });
});

module.exports = router;
