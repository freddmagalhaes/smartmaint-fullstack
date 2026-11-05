const bcrypt = require('bcrypt');
const crypto = require('crypto');

// Versões anteriores criavam contas com a senha padrão "123456" (inclusive o usuário master do
// database.sql público). Essas contas são bloqueadas com uma senha aleatória e precisam redefinir
// a senha por "Esqueci minha senha" ou pelo comando `npm run set-password`.
const LEGACY_DEFAULTS = ['123456'];

module.exports = {
  id: '003_invalidate_default_passwords',
  up: async (q) => {
    const users = await q('SELECT id, email, password FROM users');
    const affected = [];
    for (const user of users) {
      for (const legacy of LEGACY_DEFAULTS) {
        if (await bcrypt.compare(legacy, user.password).catch(() => false)) {
          const hash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
          await q('UPDATE users SET password = ?, token_version = token_version + 1 WHERE id = ?', [hash, user.id]);
          affected.push(user.email);
          break;
        }
      }
    }
    if (affected.length) {
      console.warn(
        `[migrations] ${affected.length} conta(s) usavam a senha padrão e foram bloqueadas: ${affected.join(', ')}.\n` +
        '             Redefina com "Esqueci minha senha" ou: NEW_PASSWORD=\'...\' npm run set-password -- <email>'
      );
    }
  },
};
