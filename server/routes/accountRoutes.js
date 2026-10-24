const express = require('express');
const bcrypt = require('bcrypt');
const { query } = require('../utils/routeHelpers');
const { HttpError } = require('../utils/errorHandler');
const { hashPassword } = require('../utils/passwords');
const { signToken } = require('../middleware/auth');
const { publicUser } = require('./authRoutes');
const { parse, z, text, password } = require('../utils/validate');

const router = express.Router();

// --- MEU PERFIL ---
router.get('/me', (req, res) => {
  res.json({ ...publicUser(req.user), tenant_status: req.user.tenant_status || null });
});

router.put('/me', async (req, res) => {
  const { name } = parse(z.object({ name: text() }), req.body);
  await query('UPDATE users SET name = ? WHERE id = ?', [name, req.user.id]);
  res.json({ ...publicUser(req.user), name });
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
  // Outras sessões são encerradas; esta recebe um token novo
  res.json({ message: 'Senha alterada com sucesso', token: signToken({ id: req.user.id, token_version: tokenVersion }) });
});

module.exports = router;
