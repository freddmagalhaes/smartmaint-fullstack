const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../utils/routeHelpers');
const { handleQueryError } = require('../utils/errorHandler');
const { sendEmail } = require('../utils/email');

const JWT_SECRET = process.env.JWT_SECRET;

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const rows = await query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length > 0) {
      const user = rows[0];
      const isValid = await bcrypt.compare(password, user.password);
      
      if (isValid) {
        if (!user.is_master && user.role !== 'Suporte' && user.tenant_id) {
          const tenantRows = await query('SELECT status FROM tenants WHERE id = ?', [user.tenant_id]);
          if (tenantRows.length > 0) {
            const tStatus = tenantRows[0].status;
            if (tStatus === 'Inadimplente' || tStatus === 'Cancelado') {
              return res.status(403).json({ error: 'Acesso bloqueado. Entre em contato com o suporte.' });
            }
          }
        }

        const token = jwt.sign(
          { id: user.id, tenant_id: user.tenant_id, role: user.role, is_master: user.is_master },
          JWT_SECRET,
          { expiresIn: '24h' }
        );
        delete user.password;
        res.json({ ...user, token });
      } else {
        res.status(401).json({ message: 'Credenciais inválidas' });
      }
    } else {
      res.status(401).json({ message: 'Credenciais inválidas' });
    }
  } catch (err) {
    handleQueryError(res, err, 'Erro ao realizar login');
  }
});

router.post('/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    const rows = await query('SELECT id, name FROM users WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.json({ message: 'Se o e-mail existir, um link de recuperação será enviado.' });
    }
    
    const user = rows[0];
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hash = await bcrypt.hash(resetToken, 10);
    const expiry = new Date(Date.now() + 3600000);
    
    await query('UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?', [hash, expiry, user.id]);
    
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}&id=${user.id}`;
    
    const emailHtml = `
      <h2>Olá, ${user.name}</h2>
      <p>Você solicitou a redefinição de senha da sua conta SmartMaint.</p>
      <p>Clique no link abaixo para criar uma nova senha:</p>
      <a href="${resetUrl}" style="padding: 10px 20px; background: #1e3a8a; color: white; text-decoration: none; border-radius: 5px;">Redefinir Senha</a>
      <p>Este link expira em 1 hora.</p>
      <p>Se não foi você, ignore este e-mail.</p>
    `;
    
    await sendEmail(email, 'Recuperação de Senha - SmartMaint', emailHtml);
    res.json({ message: 'Se o e-mail existir, um link de recuperação será enviado.' });
  } catch (err) {
    handleQueryError(res, err, 'Erro ao processar solicitação de recuperação de senha');
  }
});

router.post('/auth/reset-password', async (req, res) => {
  const { id, token, newPassword } = req.body;
  try {
    const rows = await query('SELECT reset_token, reset_token_expiry FROM users WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(400).json({ error: 'Usuário não encontrado.' });
    
    const user = rows[0];
    if (!user.reset_token || !user.reset_token_expiry) return res.status(400).json({ error: 'Token inválido ou expirado.' });
    
    if (new Date() > new Date(user.reset_token_expiry)) {
      return res.status(400).json({ error: 'Token expirado. Solicite novamente.' });
    }
    
    const isValid = await bcrypt.compare(token, user.reset_token);
    if (!isValid) return res.status(400).json({ error: 'Token inválido.' });
    
    const newHash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?', [newHash, id]);
    
    res.json({ message: 'Senha alterada com sucesso!' });
  } catch (err) {
    handleQueryError(res, err, 'Erro ao redefinir senha');
  }
});

module.exports = router;
