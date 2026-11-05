// Cria (ou redefine a senha de) o usuário master do backoffice.
// Uso: MASTER_EMAIL=voce@empresa.com MASTER_PASSWORD='senha-forte' npm run create-master
// Em Docker: docker compose exec -e MASTER_EMAIL=... -e MASTER_PASSWORD=... api npm run create-master
require('dotenv').config();
const bcrypt = require('bcrypt');
const db = require('../db');

const email = process.env.MASTER_EMAIL;
const password = process.env.MASTER_PASSWORD;
const name = process.env.MASTER_NAME || 'Master';

(async () => {
  if (!email || !password) {
    console.error('Defina MASTER_EMAIL e MASTER_PASSWORD.');
    process.exit(1);
  }
  if (password.length < 12) {
    console.error('MASTER_PASSWORD deve ter pelo menos 12 caracteres.');
    process.exit(1);
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    const [rows] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (rows.length > 0) {
      await db.query('UPDATE users SET password = ?, is_master = TRUE, tenant_id = NULL, role = "Dono" WHERE id = ?', [hash, rows[0].id]);
      console.log(`Usuário ${email} atualizado como master.`);
    } else {
      await db.query(
        'INSERT INTO users (tenant_id, name, email, password, role, is_master) VALUES (NULL, ?, ?, ?, "Dono", TRUE)',
        [name, email, hash]
      );
      console.log(`Usuário master ${email} criado.`);
    }
    process.exit(0);
  } catch (err) {
    console.error('Falha ao criar master:', err.message);
    process.exit(1);
  }
})();
