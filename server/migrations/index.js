const db = require('../db');

const migrations = [
  require('./001_initial'),
  require('./002_hardening'),
  require('./003_invalidate_default_passwords'),
  require('./004_multicliente'),
];

const helpers = (q) => ({
  columnExists: async (table, column) => {
    const rows = await q(
      'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      [table, column]
    );
    return rows.length > 0;
  },
  async addColumn(table, column, definition) {
    if (!(await this.columnExists(table, column))) {
      await q(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    }
  },
  addIndex: async (table, name, columns) => {
    const rows = await q(
      'SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?',
      [table, name]
    );
    if (rows.length === 0) await q(`ALTER TABLE \`${table}\` ADD INDEX \`${name}\` ${columns}`);
  },
  // Remove a FK existente na coluna (nome gerado automaticamente pelo MySQL) e cria a nova definição
  replaceForeignKey: async (table, column, definition) => {
    const fks = await q(
      `SELECT CONSTRAINT_NAME AS name FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
      [table, column]
    );
    for (const fk of fks) await q(`ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${fk.name}\``);
    await q(`ALTER TABLE \`${table}\` ADD ${definition}`);
  },
});

const runMigrations = async ({ log = console.log } = {}) => {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id VARCHAR(100) PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  // Lock nomeado evita que duas instâncias apliquem migrations ao mesmo tempo
  const conn = await db.getConnection();
  try {
    const [[lock]] = await conn.query("SELECT GET_LOCK('smartmaint_migrations', 60) AS ok");
    if (!lock.ok) throw new Error('Não foi possível obter o lock de migrations');

    const [appliedRows] = await conn.query('SELECT id FROM schema_migrations');
    const applied = new Set(appliedRows.map((r) => r.id));
    const q = async (sql, params) => (await conn.query(sql, params))[0];

    for (const migration of migrations) {
      if (applied.has(migration.id)) continue;
      log(`[migrations] aplicando ${migration.id}`);
      // DDL no MySQL faz commit implícito; por isso cada passo das migrations é idempotente
      await migration.up(q, helpers(q));
      await q('INSERT INTO schema_migrations (id) VALUES (?)', [migration.id]);
    }
  } finally {
    await conn.query("SELECT RELEASE_LOCK('smartmaint_migrations')").catch(() => {});
    conn.release();
  }
};

module.exports = { runMigrations };

if (require.main === module) {
  runMigrations()
    .then(() => { console.log('[migrations] banco atualizado'); process.exit(0); })
    .catch((err) => { console.error('[migrations] falha:', err); process.exit(1); });
}
