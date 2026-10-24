const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { config } = require('../config');
const { sendInviteEmail } = require('./email');

const BCRYPT_ROUNDS = 12;
const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

const hashPassword = (plain) => bcrypt.hash(plain, BCRYPT_ROUNDS);

// Senha aleatória para contas criadas por convite: ninguém a conhece até o usuário definir a própria
const randomPasswordHash = () => hashPassword(crypto.randomBytes(32).toString('hex'));

/** Gera um token de definição de senha (guardado como hash) e devolve o link para o e-mail. */
const createPasswordLink = async (q, userId, ttlMs) => {
  const token = crypto.randomBytes(32).toString('hex');
  const hash = await bcrypt.hash(token, 10);
  await q('UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?', [hash, new Date(Date.now() + ttlMs), userId]);
  return `${config.frontendUrl}/reset-password?token=${token}&id=${userId}`;
};

/**
 * Prepara a senha de um usuário novo. Com senha informada, usa-a; sem senha, cria uma
 * senha aleatória e o convite é enviado por e-mail (ver `sendInvite`).
 */
const initialPassword = async (password) => ({
  hash: password ? await hashPassword(password) : await randomPasswordHash(),
  invite: !password,
});

const sendInvite = async (q, user, company) => {
  const url = await createPasswordLink(q, user.id, INVITE_TTL_MS);
  return sendInviteEmail(user.email, user.name, company, url);
};

module.exports = { hashPassword, createPasswordLink, initialPassword, sendInvite, RESET_TTL_MS };
