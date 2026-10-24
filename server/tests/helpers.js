// Ambiente de teste: precisa ser definido antes de carregar qualquer módulo da aplicação
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'smartmaint_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-test-secret-test-secret-123';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_fake';
process.env.UPLOAD_DIR = path.join(os.tmpdir(), `smartmaint-test-uploads-${process.pid}`);
process.env.RATE_LIMIT_LOGIN_MAX = '1000';
delete process.env.SMTP_HOST;
delete process.env.S3_BUCKET;

const mysql = require('mysql2/promise');
const request = require('supertest');

const PASSWORD = 'Senha-de-teste-123';

/** Recria o banco de teste do zero, aplica as migrations e cria os dados base. */
const setupDatabase = async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  });
  await conn.query(`DROP DATABASE IF EXISTS \`${process.env.DB_NAME}\``);
  await conn.query(`CREATE DATABASE \`${process.env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.end();

  const { runMigrations } = require('../migrations');
  await runMigrations({ log: () => {} });

  const db = require('../db');
  const { hashPassword } = require('../utils/passwords');
  const hash = await hashPassword(PASSWORD);
  await db.query("INSERT INTO tenants (id, name) VALUES ('acme', 'ACME'), ('globex', 'Globex')");
  const users = [
    [null, 'Root', 'root@test.com', 'Dono', true],
    [null, 'Suporte', 'suporte@test.com', 'Suporte', false],
    ['acme', 'Admin ACME', 'admin@acme.com', 'Administrador', false],
    ['acme', 'Gerente ACME', 'gerente@acme.com', 'Gerente', false],
    ['acme', 'Operador ACME', 'user@acme.com', 'Usuário', false],
    ['globex', 'Admin Globex', 'admin@globex.com', 'Administrador', false],
  ];
  for (const [tenant, name, email, role, master] of users) {
    await db.query('INSERT INTO users (tenant_id, name, email, password, role, is_master) VALUES (?, ?, ?, ?, ?, ?)', [tenant, name, email, hash, role, master]);
  }
  await db.query("INSERT INTO units (tenant_id, name) VALUES ('acme', 'Planta Contagem'), ('globex', 'Unidade Principal')");
  await db.query(`INSERT INTO equipments (tenant_id, unit_id, name)
    SELECT 'acme', id, 'Compressor ACME' FROM units WHERE tenant_id = 'acme'
    UNION ALL SELECT 'globex', id, 'Prensa Globex' FROM units WHERE tenant_id = 'globex'`);
};

const getApp = () => require('../app');

const login = async (email, password = PASSWORD) => {
  const res = await request(getApp()).post('/api/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login ${email} falhou: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token;
};

/** Cliente HTTP autenticado: api(token).get('/api/...') */
const api = (token) => {
  const agent = request(getApp());
  const wrap = (method) => (url) => agent[method](url).set('Authorization', `Bearer ${token}`);
  return { get: wrap('get'), post: wrap('post'), put: wrap('put'), delete: wrap('delete') };
};

const teardown = async () => {
  await require('../db').end();
};

module.exports = { setupDatabase, getApp, login, api, teardown, PASSWORD, request };
