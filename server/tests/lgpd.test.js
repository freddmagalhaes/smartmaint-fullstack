const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { setupDatabase, getApp, login, api, teardown, request } = require('./helpers');

let db;
let rootToken;
const SENHA = 'Senha-nova-cliente-1';

const publicPost = (url, body) => request(getApp()).post(url).send(body);
const one = async (sql, params) => (await db.query(sql, params))[0][0];

/** Simula o clique no link do e-mail: grava um token conhecido para o usuário. */
const knownVerifyToken = async (emailAddress, { expired = false } = {}) => {
  const token = crypto.randomBytes(32).toString('hex');
  await db.query(
    'UPDATE users SET email_verify_token = ?, email_verify_expiry = ? WHERE email = ?',
    [crypto.createHash('sha256').update(token).digest('hex'), new Date(Date.now() + (expired ? -1 : 1) * 3600000), emailAddress]
  );
  return token;
};

before(async () => {
  await setupDatabase();
  db = require('../db');
  rootToken = await login('root@test.com');
});

after(teardown);

describe('cadastro pelo próprio cliente', () => {
  const novo = { company: 'Metalúrgica São José', name: 'Ana Souza', email: 'ana@metalurgica.com.br', password: SENHA, phone: '(31) 99999-0000', accept_terms: true };
  let sessionToken;

  it('informações públicas: versão dos documentos e cadastro aberto', async () => {
    const res = await request(getApp()).get('/api/public/info');
    assert.equal(res.status, 200);
    assert.match(res.body.legal.version, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(res.body.signup_enabled, true);
  });

  it('exige aceitar os Termos e a Política de Privacidade', async () => {
    const res = await publicPost('/api/signup', { ...novo, accept_terms: false });
    assert.equal(res.status, 400);
  });

  it('robô que preenche o campo invisível não cria conta', async () => {
    const res = await publicPost('/api/signup', { ...novo, email: 'robo@spam.com', website: 'http://spam' });
    assert.equal(res.status, 201);
    assert.equal(await one("SELECT id FROM users WHERE email = 'robo@spam.com'"), undefined);
  });

  it('cria empresa pendente, unidade e administrador com e-mail a confirmar', async () => {
    const res = await publicPost('/api/signup', novo);
    assert.equal(res.status, 201, JSON.stringify(res.body));

    const user = await one('SELECT * FROM users WHERE email = ?', [novo.email]);
    assert.equal(user.role, 'Administrador');
    assert.equal(user.email_verified, 0);
    assert.ok(user.email_verify_token);
    const tenant = await one('SELECT * FROM tenants WHERE id = ?', [user.tenant_id]);
    assert.match(tenant.id, /^metalurgica-sao-jose-[a-f0-9]{4}$/);
    assert.equal(tenant.status, 'Pendente');
    assert.equal(tenant.signup_source, 'self');
    assert.ok(await one('SELECT id FROM units WHERE tenant_id = ?', [tenant.id]));

    const acceptance = await one('SELECT * FROM legal_acceptances WHERE user_id = ?', [user.id]);
    assert.ok(acceptance, 'aceite registrado no cadastro');
    assert.ok(acceptance.ip);
  });

  it('e-mail já cadastrado recebe a mesma resposta, sem criar outra conta', async () => {
    const res = await publicPost('/api/signup', { ...novo, company: 'Outra' });
    assert.equal(res.status, 201);
    const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM users WHERE email = ?', [novo.email]);
    assert.equal(n, 1);
  });

  it('não entra antes de confirmar o e-mail', async () => {
    const res = await publicPost('/api/login', { email: novo.email, password: SENHA });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'EMAIL_NOT_VERIFIED');
  });

  it('reenvio do link troca o token, com resposta genérica', async () => {
    const before = (await one('SELECT email_verify_token FROM users WHERE email = ?', [novo.email])).email_verify_token;
    const res = await publicPost('/api/signup/resend', { email: novo.email });
    assert.equal(res.status, 200);
    const afterToken = (await one('SELECT email_verify_token FROM users WHERE email = ?', [novo.email])).email_verify_token;
    assert.notEqual(afterToken, before);
    const unknown = await publicPost('/api/signup/resend', { email: 'ninguem@x.com' });
    assert.equal(unknown.body.message, res.body.message);
  });

  it('link expirado é recusado', async () => {
    const token = await knownVerifyToken(novo.email, { expired: true });
    const res = await publicPost('/api/signup/verify', { token });
    assert.equal(res.status, 400);
  });

  it('confirmar o e-mail já entra no sistema', async () => {
    const token = await knownVerifyToken(novo.email);
    const res = await publicPost('/api/signup/verify', { token });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.tenant_status, 'Pendente');
    assert.ok(res.body.token);
    sessionToken = res.body.token;

    const reuse = await publicPost('/api/signup/verify', { token });
    assert.equal(reuse.status, 400, 'link vale uma única vez');
    assert.equal((await publicPost('/api/login', { email: novo.email, password: SENHA })).status, 200);
  });

  it('sem assinatura, só o faturamento fica disponível', async () => {
    const blocked = await api(sessionToken).get('/api/equipments');
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.code, 'SUBSCRIPTION_REQUIRED');
    for (const url of ['/api/billing/subscription', '/api/plans', '/api/tenants', '/api/me']) {
      assert.equal((await api(sessionToken).get(url)).status, 200, url);
    }
  });

  it('primeira fatura paga libera o sistema', async () => {
    await db.query("UPDATE plans SET price_monthly = 199 WHERE id = 'Pro'");
    const sub = await api(sessionToken).post('/api/billing/subscription').send({ method: 'pix' });
    assert.equal(sub.status, 201, JSON.stringify(sub.body));
    assert.equal((await api(sessionToken).get('/api/equipments')).status, 403, 'continua pendente até pagar');

    const paid = await api(rootToken).put(`/api/admin/invoices/${sub.body.invoice_id}/status`).send({ status: 'Paga' });
    assert.equal(paid.status, 200);
    assert.equal((await api(sessionToken).get('/api/equipments')).status, 200);
  });

  it('redefinir a senha pelo link do e-mail também confirma o e-mail', async () => {
    await publicPost('/api/signup', { ...novo, company: 'Esquecida', email: 'esqueci@empresa.com' });
    const user = await one("SELECT id FROM users WHERE email = 'esqueci@empresa.com'");
    const { createPasswordLink } = require('../utils/passwords');
    const { query } = require('../utils/routeHelpers');
    const url = new URL(await createPasswordLink(query, user.id, 3600000));
    const res = await publicPost('/api/auth/reset-password', { id: user.id, token: url.searchParams.get('token'), newPassword: 'Outra-senha-123' });
    assert.equal(res.status, 200);
    assert.equal((await publicPost('/api/login', { email: 'esqueci@empresa.com', password: 'Outra-senha-123' })).status, 200);
  });

  it('cadastros abandonados são apagados após o prazo; clientes pagantes, nunca', async () => {
    const { purgeAbandonedSignups } = require('../utils/signup');
    await publicPost('/api/signup', { ...novo, company: 'Abandonada', email: 'sumiu@abandonada.com' });
    const abandoned = (await one("SELECT tenant_id FROM users WHERE email = 'sumiu@abandonada.com'")).tenant_id;
    await db.query("UPDATE tenants SET created_at = DATE_SUB(NOW(), INTERVAL 40 DAY) WHERE signup_source = 'self'");

    assert.equal(await purgeAbandonedSignups(), 2, 'a abandonada e a do teste anterior, que nunca assinou');
    assert.equal(await one('SELECT id FROM tenants WHERE id = ?', [abandoned]), undefined);
    assert.equal(await one("SELECT id FROM users WHERE email = 'sumiu@abandonada.com'"), undefined);
    assert.ok(await one('SELECT id FROM users WHERE email = ?', [novo.email]), 'cliente que pagou continua');
  });
});

describe('aceite dos Termos de Uso e da Política de Privacidade', () => {
  let adminAcme;
  let memberToken;

  before(async () => {
    adminAcme = await login('admin@acme.com');
    const res = await api(adminAcme).post('/api/users').send({ name: 'Técnico Novo', email: 'tecnico@acme.com', role: 'Usuário', password: SENHA });
    assert.equal(res.status, 201);
  });

  it('membro novo da equipe precisa aceitar no primeiro acesso', async () => {
    const res = await publicPost('/api/login', { email: 'tecnico@acme.com', password: SENHA });
    assert.equal(res.body.legal_pending, true);
    memberToken = res.body.token;

    const blocked = await api(memberToken).get('/api/work-orders');
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.code, 'LEGAL_ACCEPTANCE_REQUIRED');
    const me = await api(memberToken).get('/api/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.legal_pending, true);
  });

  it('aceite é registrado e libera o acesso', async () => {
    assert.equal((await api(memberToken).post('/api/legal/accept').send({})).status, 400);
    const res = await api(memberToken).post('/api/legal/accept').send({ accept: true });
    assert.equal(res.status, 200);

    const user = await one("SELECT id, legal_version_accepted FROM users WHERE email = 'tecnico@acme.com'");
    assert.equal(user.legal_version_accepted, require('../utils/legal').LEGAL_VERSION);
    assert.ok(await one('SELECT id FROM legal_acceptances WHERE user_id = ?', [user.id]));
    assert.equal((await api(memberToken).get('/api/work-orders')).status, 200);
    assert.equal((await api(memberToken).get('/api/me')).body.legal_pending, false);
  });

  it('nova versão dos documentos pede o aceite de novo', async () => {
    await db.query("UPDATE users SET legal_version_accepted = '2020-01-01' WHERE email = 'tecnico@acme.com'");
    assert.equal((await api(memberToken).get('/api/work-orders')).status, 403);
  });

  it('equipe do backoffice não passa pelo aceite de cliente', async () => {
    await db.query("UPDATE users SET legal_version_accepted = NULL WHERE email = 'root@test.com'");
    assert.equal((await api(rootToken).get('/api/admin/tenants')).status, 200);
  });
});

describe('exportação dos dados do cliente', () => {
  it('administrador baixa a planilha completa', async () => {
    const adminAcme = await login('admin@acme.com');
    const res = await api(adminAcme).get('/api/export').buffer(true).parse((r, cb) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /spreadsheetml/);
    assert.match(res.headers['content-disposition'], /smartmaint-acme-\d{4}-\d{2}-\d{2}\.xlsx/);
    assert.equal(res.body.subarray(0, 2).toString(), 'PK', 'arquivo .xlsx (zip)');
    assert.ok(await one("SELECT id FROM audit_logs WHERE action = 'export' AND tenant_id = 'acme'"), 'exportação fica no log de auditoria');
  });

  it('gerente e operador não exportam', async () => {
    const gerente = await login('gerente@acme.com');
    assert.equal((await api(gerente).get('/api/export')).status, 403);
  });

  it('cada cliente exporta só os próprios dados', async () => {
    const adminGlobex = await login('admin@globex.com');
    const res = await api(adminGlobex).get('/api/export?tenant_id=acme');
    assert.match(res.headers['content-disposition'], /smartmaint-globex-/);
  });
});
