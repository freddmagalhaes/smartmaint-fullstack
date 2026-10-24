const express = require('express');
const bcrypt = require('bcrypt');
const { query, buildUpdate } = require('../utils/routeHelpers');
const { HttpError } = require('../utils/errorHandler');
const { hashPassword } = require('../utils/passwords');
const { signToken } = require('../middleware/auth');
const { publicUser } = require('./authRoutes');
const { parse, z, text, password } = require('../utils/validate');
const { audit } = require('../utils/audit');

const router = express.Router();

// --- MEU PERFIL ---
router.get('/me', (req, res) => {
  res.json({
    ...publicUser(req.user),
    tenant_status: req.user.tenant_status || null,
    notifications_enabled: Boolean(req.user.notifications_enabled),
  });
});

router.put('/me', async (req, res) => {
  const d = parse(z.object({ name: text().optional(), notifications_enabled: z.boolean().optional() }), req.body);
  const { sql, params } = buildUpdate(d, ['name', 'notifications_enabled']);
  await query(`UPDATE users SET ${sql} WHERE id = ?`, [...params, req.user.id]);
  res.json({
    ...publicUser(req.user),
    name: d.name ?? req.user.name,
    notifications_enabled: d.notifications_enabled ?? Boolean(req.user.notifications_enabled),
  });
});

router.put('/me/password', async (req, res) => {
  const data = parse(z.object({
    currentPassword: z.string().min(1).max(128),
    newPassword: password,
  }), req.body);

  const [user] = await query('SELECT password, token_version FROM users WHERE id = ?', [req.user.id]);
  if (!(await bcrypt.compare(data.currentPassword, user.password))) {
    throw new HttpError(400, 'Senha atual incorreta');
  }
  const tokenVersion = user.token_version + 1;
  await query('UPDATE users SET password = ?, token_version = ? WHERE id = ?', [await hashPassword(data.newPassword), tokenVersion, req.user.id]);
  await audit(req, { action: 'password_change', entity: 'user', entityId: req.user.id });
  // Outras sessões são encerradas; esta recebe um token novo
  res.json({ message: 'Senha alterada com sucesso', token: signToken({ id: req.user.id, token_version: tokenVersion }) });
});

module.exports = router;
