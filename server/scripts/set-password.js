/**
 * Define a senha de um usuário pelo terminal (ex.: recuperar o acesso Root sem SMTP configurado).
 *
 *   NEW_PASSWORD='nova-senha-forte' npm run set-password -- usuario@empresa.com
 */
const db = require('../db');
const { hashPassword } = require('../utils/passwords');

const run = async () => {
  const email = (process.argv[2] || '').toLowerCase();
  const password = process.env.NEW_PASSWORD;
  if (!email || !password || password.length < 8) {
    console.error("Uso: NEW_PASSWORD='senha com 8+ caracteres' npm run set-password -- <email>");
    process.exit(1);
  }
  // token_version + 1 encerra as sessões abertas com a senha anterior
  const [result] = await db.query(
    'UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL, token_version = token_version + 1 WHERE email = ?',
    [await hashPassword(password), email]
  );
  if (result.affectedRows === 0) {
    console.error(`Usuário não encontrado: ${email}`);
    process.exit(1);
  }
  console.log(`Senha atualizada para ${email}.`);
};

run()
  .then(() => db.end())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
