const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setupDatabase, getApp, login, api, teardown, PASSWORD, request } = require('./helpers');

let tokens = {};
let acmeEquipmentId;
let globexEquipmentId;

before(async () => {
  await setupDatabase();
  for (const key of ['root', 'suporte', 'admin@acme', 'gerente@acme', 'user@acme', 'admin@globex']) {
    const email = key.includes('@') ? `${key}.com` : `${key}@test.com`;
    tokens[key] = await login(email);
  }
  const db = require('../db');
  const [eqs] = await db.query('SELECT id, tenant_id FROM equipments');
  acmeEquipmentId = eqs.find((e) => e.tenant_id === 'acme').id;
  globexEquipmentId = eqs.find((e) => e.tenant_id === 'globex').id;
});

after(teardown);

describe('infraestrutura', () => {
  it('health check responde sem autenticação', async () => {
    const res = await request(getApp()).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'OK');
  });

  it('rota inexistente: 401 sem token e 404 com token', async () => {
    assert.equal((await request(getApp()).get('/api/nao-existe')).status, 401);
    assert.equal((await api(tokens['admin@acme']).get('/api/nao-existe')).status, 404);
  });
});

describe('autenticação', () => {
  it('rejeita senha errada', async () => {
    const res = await request(getApp()).post('/api/login').send({ email: 'admin@acme.com', password: 'errada' });
    assert.equal(res.status, 401);
  });

  it('não expõe hash de senha nem token de recuperação', async () => {
    const res = await request(getApp()).post('/api/login').send({ email: 'admin@acme.com', password: PASSWORD });
    assert.equal(res.status, 200);
    for (const field of ['password', 'reset_token', 'reset_token_expiry', 'token_version']) {
      assert.equal(res.body[field], undefined, field);
    }
    assert.equal(res.body.role, 'Administrador');
  });

  it('valida entrada (e-mail inválido)', async () => {
    const res = await request(getApp()).post('/api/login').send({ email: 'x', password: 'y' });
    assert.equal(res.status, 400);
  });

  it('troca de senha encerra sessões antigas', async () => {
    const oldToken = await login('gerente@acme.com');
    const res = await api(oldToken).put('/api/me/password').send({ currentPassword: PASSWORD, newPassword: 'Nova-senha-456' });
    assert.equal(res.status, 200);
    assert.equal((await api(oldToken).get('/api/me')).status, 401);
    assert.equal((await api(res.body.token).get('/api/me')).status, 200);
    // restaura
    await api(res.body.token).put('/api/me/password').send({ currentPassword: 'Nova-senha-456', newPassword: PASSWORD });
    tokens['gerente@acme'] = await login('gerente@acme.com');
  });

  it('cliente bloqueado perde acesso imediatamente, inclusive com token válido', async () => {
    const token = tokens['admin@globex'];
    assert.equal((await api(tokens.root).put('/api/admin/tenants/globex/status').send({ status: 'Inadimplente' })).status, 200);
    const res = await api(token).get('/api/equipments');
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'TENANT_BLOCKED');
    assert.equal((await request(getApp()).post('/api/login').send({ email: 'admin@globex.com', password: PASSWORD })).status, 403);
    await api(tokens.root).put('/api/admin/tenants/globex/status').send({ status: 'Ativo' });
  });
});

describe('isolamento entre clientes', () => {
  it('usuário de cliente ignora tenant_id de outro cliente', async () => {
    const res = await api(tokens['admin@acme']).get('/api/equipments?tenant_id=globex');
    assert.equal(res.status, 200);
    assert.ok(res.body.items.length > 0);
    assert.ok(res.body.items.every((e) => e.tenant_id === 'acme'));
  });

  it('não permite vincular equipamento de outro cliente', async () => {
    const res = await api(tokens['admin@acme']).post('/api/preventive-plans').send({ equipment_id: globexEquipmentId, title: 'x', interval_days: 30 });
    assert.equal(res.status, 400);
    const os = await api(tokens['admin@acme']).post('/api/work-orders').send({ equipment_id: globexEquipmentId, titulo: 'x', tipo: 'Corretiva', prioridade: 'Alta' });
    assert.equal(os.status, 400);
  });

  it('não permite excluir dados de outro cliente', async () => {
    const res = await api(tokens['admin@acme']).delete(`/api/equipments/${globexEquipmentId}`);
    assert.equal(res.status, 404);
  });

  it('backoffice precisa informar um tenant_id existente', async () => {
    assert.equal((await api(tokens.suporte).get('/api/equipments')).status, 400);
    assert.equal((await api(tokens.suporte).get('/api/equipments?tenant_id=inexistente')).status, 404);
    const res = await api(tokens.suporte).get('/api/equipments?tenant_id=globex');
    assert.equal(res.status, 200);
    assert.equal(res.body.items[0].tenant_id, 'globex');
  });
});

describe('permissões por perfil', () => {
  it('Usuário vê equipamentos e abre O.S., mas não altera cadastros', async () => {
    const user = api(tokens['user@acme']);
    assert.equal((await user.get('/api/equipments')).status, 200);
    assert.equal((await user.post('/api/equipments').send({ name: 'Hack' })).status, 403);
    assert.equal((await user.delete(`/api/equipments/${acmeEquipmentId}`)).status, 403);
    assert.equal((await user.get('/api/inventory')).status, 403);
    assert.equal((await user.get('/api/fmea')).status, 403);

    const os = await user.post('/api/work-orders').send({ equipment_id: acmeEquipmentId, titulo: 'Vazamento', tipo: 'Corretiva', prioridade: 'Alta', status: 'Em Execução' });
    assert.equal(os.status, 201);
    assert.equal(os.body.status, 'Aberta');
    assert.equal((await user.put(`/api/work-orders/${os.body.id}`).send({ status: 'Pausada' })).status, 403);
  });

  it('Gerente gerencia estoque mas não FMEA nem equipe', async () => {
    const mgr = api(tokens['gerente@acme']);
    assert.equal((await mgr.post('/api/inventory').send({ name: 'Rolamento', quantity: 3 })).status, 201);
    assert.equal((await mgr.get('/api/fmea')).status, 403);
    assert.equal((await mgr.post('/api/users').send({ name: 'X', email: 'x@acme.com', role: 'Usuário' })).status, 403);
  });

  it('lista de usuários só mostra e-mail para administradores', async () => {
    const asUser = await api(tokens['user@acme']).get('/api/users');
    assert.equal(asUser.status, 200);
    assert.equal(asUser.body[0].email, undefined);
    const asAdmin = await api(tokens['admin@acme']).get('/api/users');
    assert.ok(asAdmin.body[0].email);
  });

  it('rotas de backoffice são bloqueadas para clientes', async () => {
    assert.equal((await api(tokens['admin@acme']).get('/api/admin/tenants')).status, 403);
    assert.equal((await api(tokens.suporte).get('/api/admin/tenants')).status, 200);
    assert.equal((await api(tokens.suporte).delete('/api/admin/tenants/acme')).status, 403);
  });
});

describe('usuários e convites', () => {
  it('cria usuário sem senha (convite) e com perfil Gerente', async () => {
    const res = await api(tokens['admin@acme']).post('/api/users').send({ name: 'Novo', email: 'novo@acme.com', role: 'Gerente' });
    assert.equal(res.status, 201);
    assert.equal(res.body.invite_sent, false); // SMTP não configurado nos testes
    // a senha padrão antiga não funciona
    const loginRes = await request(getApp()).post('/api/login').send({ email: 'novo@acme.com', password: '123456' });
    assert.equal(loginRes.status, 401);
  });

  it('não permite atribuir perfis de sistema nem senha fraca', async () => {
    const admin = api(tokens['admin@acme']);
    assert.equal((await admin.post('/api/users').send({ name: 'X', email: 'x1@acme.com', role: 'Dono' })).status, 400);
    assert.equal((await admin.post('/api/users').send({ name: 'X', email: 'x2@acme.com', role: 'Suporte' })).status, 400);
    assert.equal((await admin.post('/api/users').send({ name: 'X', email: 'x3@acme.com', role: 'Usuário', password: '123' })).status, 400);
  });

  it('e-mail duplicado retorna 409', async () => {
    const res = await api(tokens['admin@acme']).post('/api/users').send({ name: 'X', email: 'admin@globex.com', role: 'Usuário' });
    assert.equal(res.status, 409);
  });

  it('Root cria agente de suporte (perfil existe no banco)', async () => {
    const res = await api(tokens.root).post('/api/admin/users').send({ name: 'Agente', email: 'agente@test.com', password: 'Senha-forte-789' });
    assert.equal(res.status, 201);
    assert.equal(res.body.role, 'Suporte');
    assert.ok(await login('agente@test.com', 'Senha-forte-789'));
  });

  it('cadastro de cliente cria administrador por convite, em transação', async () => {
    const res = await api(tokens.suporte).post('/api/admin/tenants').send({ id: 'initech', name: 'Initech', contact_email: 'ti@initech.com' });
    assert.equal(res.status, 201);
    // e-mail já usado: nada é criado
    const dup = await api(tokens.suporte).post('/api/admin/tenants').send({ id: 'outra', name: 'Outra', contact_email: 'ti@initech.com' });
    assert.equal(dup.status, 409);
    const db = require('../db');
    const [rows] = await db.query("SELECT id FROM tenants WHERE id = 'outra'");
    assert.equal(rows.length, 0);
  });
});

describe('ordens de serviço e MTTR', () => {
  it('conclusão exige tempo de reparo e gera um único reparo com o valor informado', async () => {
    const admin = api(tokens['admin@acme']);
    const os = await admin.post('/api/work-orders').send({ equipment_id: acmeEquipmentId, titulo: 'Troca de rolamento', tipo: 'Corretiva', prioridade: 'Média' });
    assert.equal(os.status, 201);

    assert.equal((await admin.put(`/api/work-orders/${os.body.id}`).send({ status: 'Concluída' })).status, 400);
    assert.equal((await admin.put(`/api/work-orders/${os.body.id}`).send({ status: 'Concluída', tempo_reparo: 2.5 })).status, 200);
    // salvar de novo não duplica o reparo
    assert.equal((await admin.put(`/api/work-orders/${os.body.id}`).send({ titulo: 'Troca de rolamento (ok)' })).status, 200);

    const repairs = (await admin.get('/api/repairs')).body.items.filter((r) => r.work_order_id === os.body.id);
    assert.equal(repairs.length, 1);
    assert.equal(Number(repairs[0].tempo_reparo), 2.5);

    // reabrir remove o reparo
    await admin.put(`/api/work-orders/${os.body.id}`).send({ status: 'Em Execução' });
    const after = (await admin.get('/api/repairs')).body.items.filter((r) => r.work_order_id === os.body.id);
    assert.equal(after.length, 0);
  });

  it('ignora campos extras enviados pelo cliente', async () => {
    const admin = api(tokens['admin@acme']);
    const res = await admin.post('/api/equipments').send({ name: 'Bomba', tenant_id: 'globex', id: 999, created_at: 'x' });
    assert.equal(res.status, 201);
    assert.equal(res.body.tenant_id, 'acme');
  });
});

describe('planos preventivos', () => {
  it('registrar execução recalcula o próximo vencimento', async () => {
    const admin = api(tokens['admin@acme']);
    const plan = await admin.post('/api/preventive-plans').send({ equipment_id: acmeEquipmentId, title: 'Lubrificação', interval_days: 15 });
    assert.equal(plan.status, 201);
    assert.equal((await admin.put(`/api/preventive-plans/${plan.body.id}`).send({ reset_due: true })).status, 200);
    const saved = (await admin.get('/api/preventive-plans')).body.items.find((p) => p.id === plan.body.id);
    assert.ok(saved.last_executed);
  });
});

describe('uploads', () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a0f00000000049454e44ae426082', 'hex');

  it('aceita imagem real e serve o arquivo', async () => {
    const res = await api(tokens['admin@acme']).post('/api/upload').attach('file', png, 'foto.png');
    assert.equal(res.status, 201);
    assert.match(res.body.url, /^\/uploads\/acme\/[0-9a-f-]{36}\.png$/);
    const file = await request(getApp()).get(res.body.url);
    assert.equal(file.status, 200);
    assert.equal(file.headers['content-type'], 'image/png');
  });

  it('rejeita arquivo disfarçado (extensão .png com conteúdo HTML)', async () => {
    const res = await api(tokens['admin@acme']).post('/api/upload').attach('file', Buffer.from('<script>alert(1)</script>'), 'foto.png');
    assert.equal(res.status, 400);
  });

  it('bloqueia path traversal', async () => {
    assert.equal((await request(getApp()).get('/uploads/..%2F..%2Fetc/passwd')).status, 404);
  });
});
