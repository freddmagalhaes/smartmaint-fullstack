const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setupDatabase, login, api, teardown } = require('./helpers');

// O limite do plano precisa valer mesmo quando várias requisições do mesmo cliente chegam ao mesmo tempo.
// Antes da correção, "contar e depois gravar" em passos separados deixava todas passarem (ex.: limite 5, ficou com 13).

let db;
const tokens = {};
const count = async (table, tenant) => (await db.query(`SELECT COUNT(*) AS n FROM ${table} WHERE tenant_id = ?`, [tenant]))[0][0].n;
const setLimits = (limits) => db.query('UPDATE plans SET max_users = ?, max_equipments = ?, max_units = ? WHERE id = \'Pro\'', [limits.users ?? null, limits.equipments ?? null, limits.units ?? null]);
const statuses = (responses) => responses.map((r) => r.status).sort();
const tally = (responses) => responses.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {});

before(async () => {
  await setupDatabase();
  db = require('../db');
  for (const [key, email] of [['admin', 'admin@acme.com'], ['globex', 'admin@globex.com']]) tokens[key] = await login(email);
});

after(teardown);

beforeEach(async () => {
  // Estado conhecido: acme e globex no plano Pro, sem limites; sem sobras de testes anteriores
  await db.query("UPDATE tenants SET plan_type = 'Pro' WHERE id IN ('acme', 'globex')");
  await setLimits({});
});

describe('limite de equipamentos com requisições simultâneas', () => {
  it('12 criações simultâneas com 4 vagas: exatamente 4 entram', async () => {
    const antes = await count('equipments', 'acme');
    await setLimits({ equipments: antes + 4 });
    const rs = await Promise.all(Array.from({ length: 12 }, (_, i) => api(tokens.admin).post('/api/equipments').send({ name: `Par ${i}` })));
    assert.deepEqual(tally(rs), { 201: 4, 403: 8 }, JSON.stringify(statuses(rs)));
    assert.ok(rs.filter((r) => r.status === 403).every((r) => r.body.code === 'PLAN_LIMIT'));
    assert.equal(await count('equipments', 'acme'), antes + 4);
  });

  it('30 criações simultâneas não travam (sem bloqueio mútuo) e respeitam o limite', async () => {
    const antes = await count('equipments', 'acme');
    await setLimits({ equipments: antes + 10 });
    const rs = await Promise.all(Array.from({ length: 30 }, (_, i) => api(tokens.admin).post('/api/equipments').send({ name: `Carga ${i}` })));
    assert.ok(rs.every((r) => [201, 403].includes(r.status)), `status inesperados: ${JSON.stringify(tally(rs))}`);
    assert.equal(rs.filter((r) => r.status === 201).length, 10);
    assert.equal(await count('equipments', 'acme'), antes + 10);
  });

  it('sem limite (ilimitado) todas as criações simultâneas entram', async () => {
    const antes = await count('equipments', 'acme');
    const rs = await Promise.all(Array.from({ length: 8 }, (_, i) => api(tokens.admin).post('/api/equipments').send({ name: `Livre ${i}` })));
    assert.deepEqual(statuses(rs), Array(8).fill(201));
    assert.equal(await count('equipments', 'acme'), antes + 8);
  });

  it('o limite de um cliente não atrapalha o outro: acme cheio, globex segue criando', async () => {
    const acme = await count('equipments', 'acme');
    await setLimits({ equipments: acme }); // acme já está no limite; globex tem o mesmo plano
    const globex = await count('equipments', 'globex');
    await db.query("UPDATE tenants SET plan_type = 'Enterprise' WHERE id = 'globex'"); // globex ilimitado
    const rs = await Promise.all([
      ...Array.from({ length: 5 }, (_, i) => api(tokens.admin).post('/api/equipments').send({ name: `Cheio ${i}` })),
      ...Array.from({ length: 5 }, (_, i) => api(tokens.globex).post('/api/equipments').send({ name: `Outro ${i}` })),
    ]);
    assert.deepEqual(rs.slice(0, 5).map((r) => r.status), Array(5).fill(403));
    assert.deepEqual(rs.slice(5).map((r) => r.status), Array(5).fill(201));
    assert.equal(await count('equipments', 'acme'), acme);
    assert.equal(await count('equipments', 'globex'), globex + 5);
  });
});

describe('limite de usuários e unidades com requisições simultâneas', () => {
  it('10 usuários simultâneos com 3 vagas: exatamente 3 entram', async () => {
    const antes = await count('users', 'acme');
    await setLimits({ users: antes + 3 });
    const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => api(tokens.admin).post('/api/users').send({ name: `U${i}`, email: `par${i}@acme.com`, role: 'Usuário' })));
    assert.deepEqual(tally(rs), { 201: 3, 403: 7 }, JSON.stringify(statuses(rs)));
    assert.equal(await count('users', 'acme'), antes + 3);
  });

  it('8 unidades simultâneas com 2 vagas: exatamente 2 entram', async () => {
    const antes = await count('units', 'acme');
    await setLimits({ units: antes + 2 });
    const rs = await Promise.all(Array.from({ length: 8 }, (_, i) => api(tokens.admin).post('/api/units').send({ name: `Planta ${i}` })));
    assert.deepEqual(tally(rs), { 201: 2, 403: 6 }, JSON.stringify(statuses(rs)));
    assert.equal(await count('units', 'acme'), antes + 2);
  });
});

describe('importação com requisições simultâneas', () => {
  // Com várias unidades (os testes acima criam plantas), a importação exige dizer em qual unidade entram as linhas
  let unitId;
  before(async () => { unitId = (await db.query("SELECT id FROM units WHERE tenant_id = 'acme' ORDER BY id LIMIT 1"))[0][0].id; });
  const lote = (prefixo) => ({ rows: [1, 2, 3].map((i) => ({ name: `${prefixo} ${i}` })), default_unit_id: unitId });

  it('duas importações de 3 linhas com 4 vagas: só uma entra e nada fica pela metade', async () => {
    const antes = await count('equipments', 'acme');
    await setLimits({ equipments: antes + 4 });
    const rs = await Promise.all([api(tokens.admin).post('/api/equipments/import').send(lote('P')), api(tokens.admin).post('/api/equipments/import').send(lote('Q'))]);
    assert.deepEqual(statuses(rs).filter((s) => s === 201).length, 1, JSON.stringify(statuses(rs)));
    assert.ok(rs.some((r) => r.status === 403 && r.body.code === 'PLAN_LIMIT'), JSON.stringify(rs.map((r) => [r.status, r.body.code])));
    assert.equal(await count('equipments', 'acme'), antes + 3, 'só um lote inteiro entrou');
  });

  it('a pré-visualização (dry_run) continua apontando o excesso com o nome do plano', async () => {
    const antes = await count('equipments', 'acme');
    await setLimits({ equipments: antes + 2 });
    const res = await api(tokens.admin).post('/api/equipments/import').send({ ...lote('V'), dry_run: true });
    assert.equal(res.status, 422);
    assert.match(res.body.errors.at(-1).message, /Profissional/);
    assert.equal(await count('equipments', 'acme'), antes);
  });
});

describe('a trava não deixa rastro', () => {
  it('uma gravação que falha (e-mail repetido) desfaz tudo e libera a trava para as próximas', async () => {
    const antes = await count('users', 'acme');
    await setLimits({ users: antes + 5 });
    const ok = await api(tokens.admin).post('/api/users').send({ name: 'Primeiro', email: 'repetido@acme.com', role: 'Usuário' });
    assert.equal(ok.status, 201);
    const dup = await api(tokens.admin).post('/api/users').send({ name: 'Repetido', email: 'repetido@acme.com', role: 'Usuário' });
    assert.ok(dup.status >= 400 && dup.status < 500, `status ${dup.status}`);
    assert.equal(await count('users', 'acme'), antes + 1, 'a falha não consumiu vaga');
    const depois = await api(tokens.admin).post('/api/users').send({ name: 'Depois', email: 'depois@acme.com', role: 'Usuário' });
    assert.equal(depois.status, 201, 'a trava foi liberada');
  });

  it('no limite, as recusas sequenciais seguem informando o plano (comportamento antigo preservado)', async () => {
    const antes = await count('equipments', 'acme');
    await setLimits({ equipments: antes });
    const res = await api(tokens.admin).post('/api/equipments').send({ name: 'Sobra' });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'PLAN_LIMIT');
    assert.match(res.body.error, /Profissional.*equipamentos/);
  });
});
