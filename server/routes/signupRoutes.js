const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('../db');
const { handleQueryError } = require('../utils/errorHandler');
const { signToken } = require('../utils/session');
const { DEFAULT_PLAN } = require('../utils/plans');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// "Indústria Ágil Ltda." -> "industria-agil-ltda"
const slugify = (text) =>
  text
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'empresa';

const validate = ({ company_name, name, email, password, accept_terms }) => {
  const isStr = (v) => typeof v === 'string';
  if (!isStr(company_name) || company_name.trim().length < 2 || company_name.trim().length > 100) return 'Informe o nome da empresa (2 a 100 caracteres).';
  if (!isStr(name) || name.trim().length < 2 || name.trim().length > 100) return 'Informe seu nome (2 a 100 caracteres).';
  if (!isStr(email) || email.length > 255 || !EMAIL_RE.test(email.trim())) return 'Informe um e-mail válido.';
  if (!isStr(password) || password.length < 10) return 'A senha deve ter pelo menos 10 caracteres.';
  // bcrypt só considera os primeiros 72 bytes: acima disso senhas diferentes seriam equivalentes
  if (Buffer.byteLength(password, 'utf8') > 72) return 'A senha deve ter no máximo 72 bytes.';
  if (accept_terms !== true) return 'É necessário aceitar os Termos de Uso e a Política de Privacidade.';
  return null;
};

// Cadastro autoatendido: cria o cliente em período de teste e o primeiro administrador.
// Só os campos validados acima são lidos do corpo: papel, tenant, status e trial são definidos aqui.
router.post('/signup', async (req, res) => {
  if (process.env.SIGNUP_ENABLED === 'false') return res.status(404).json({ error: 'Cadastro indisponível.' });

  const invalid = validate(req.body || {});
  if (invalid) return res.status(400).json({ error: invalid });

  const company = req.body.company_name.trim();
  const name = req.body.name.trim();
  const email = req.body.email.trim().toLowerCase();
  const trialDays = Math.max(1, Number(process.env.TRIAL_DAYS) || 14);
  const hash = await bcrypt.hash(req.body.password, 10);

  const conn = await db.getConnection();
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const tenantId = `${slugify(company)}-${crypto.randomBytes(2).toString('hex')}`;
      await conn.beginTransaction();
      try {
        await conn.query(
          `INSERT INTO tenants (id, name, status, plan_type, contact_email, contrato_inicio, trial_ends_at)
           VALUES (?, ?, 'Trial', ?, ?, CURRENT_DATE, DATE_ADD(NOW(), INTERVAL ? DAY))`,
          [tenantId, company, DEFAULT_PLAN, email, trialDays]
        );
        const [result] = await conn.query(
          `INSERT INTO users (tenant_id, name, email, password, role, is_master, terms_accepted_at)
           VALUES (?, ?, ?, ?, 'Administrador', FALSE, NOW())`,
          [tenantId, name, email, hash]
        );
        await conn.commit();

        const [[tenant]] = await conn.query('SELECT trial_ends_at FROM tenants WHERE id = ?', [tenantId]);
        const user = { id: result.insertId, tenant_id: tenantId, name, email, role: 'Administrador', is_master: 0 };
        return res.status(201).json({ ...user, trial_ends_at: tenant.trial_ends_at, token: signToken(user) });
      } catch (err) {
        await conn.rollback();
        if (err.code === 'ER_DUP_ENTRY') {
          if (/email/i.test(err.sqlMessage || '')) return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
          continue; // colisão do id do tenant (raríssima): tenta outro sufixo
        }
        throw err;
      }
    }
    return res.status(500).json({ error: 'Não foi possível concluir o cadastro. Tente novamente.' });
  } catch (err) {
    handleQueryError(res, err, 'Erro ao realizar cadastro');
  } finally {
    conn.release();
  }
});

module.exports = router;
