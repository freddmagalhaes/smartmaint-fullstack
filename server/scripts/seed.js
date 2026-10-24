/**
 * Cria o usuário Root (master) e, opcionalmente, um cliente de demonstração.
 *
 *   MASTER_EMAIL=voce@empresa.com MASTER_PASSWORD='senha-forte' npm run seed
 *   MASTER_EMAIL=... MASTER_PASSWORD=... DEMO_PASSWORD='outra-senha' npm run seed -- --demo
 */
const db = require('../db');
const { runMigrations } = require('../migrations');
const { hashPassword } = require('../utils/passwords');

const requirePassword = (name) => {
  const value = process.env[name];
  if (!value || value.length < 8) {
    console.error(`Defina ${name} com ao menos 8 caracteres.`);
    process.exit(1);
  }
  return value;
};

const seed = async () => {
  await runMigrations();
  const [masters] = await db.query('SELECT id, email FROM users WHERE is_master = TRUE');
  if (masters.length > 0) {
    console.log(`Usuário Root já existe (${masters[0].email}); nada a fazer.`);
  } else {
    const email = process.env.MASTER_EMAIL;
    if (!email) {
      console.error('Defina MASTER_EMAIL.');
      process.exit(1);
    }
    const password = requirePassword('MASTER_PASSWORD');
    await db.query(
      "INSERT INTO users (tenant_id, name, email, password, role, is_master) VALUES (NULL, 'Root', ?, ?, 'Dono', TRUE)",
      [email.toLowerCase(), await hashPassword(password)]
    );
    console.log(`Usuário Root criado: ${email}`);
  }

  if (process.argv.includes('--demo')) {
    const password = requirePassword('DEMO_PASSWORD');
    await db.query("INSERT IGNORE INTO tenants (id, name, plan_type, contact_email) VALUES ('demo', 'Empresa Demonstração', 'Pro', 'admin@demo.smartmaint.local')");
    await db.query(
      "INSERT IGNORE INTO users (tenant_id, name, email, password, role) VALUES ('demo', 'Admin Demo', 'admin@demo.smartmaint.local', ?, 'Administrador')",
      [await hashPassword(password)]
    );
    console.log('Cliente de demonstração: admin@demo.smartmaint.local');
  }
};

seed()
  .then(() => db.end())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
