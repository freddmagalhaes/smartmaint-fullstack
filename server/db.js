const mysql = require('mysql2');
const { config } = require('./config');

const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE) || 10,
  queueLimit: 0,
  // Datas como texto 'YYYY-MM-DD' evitam deslocamento de fuso horário entre servidor e navegador
  dateStrings: ['DATE'],
});

const db = pool.promise();

/**
 * Executa `fn` dentro de uma transação. Faz rollback automático em caso de erro.
 * `fn` recebe uma função `q(sql, params)` que retorna as linhas.
 */
db.transaction = async (fn) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const q = async (sql, params) => (await conn.query(sql, params))[0];
    const result = await fn(q);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

module.exports = db;
