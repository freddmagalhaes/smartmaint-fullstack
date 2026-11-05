const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { query, getTenantId, isBackoffice, generateTempPassword } = require('../utils/routeHelpers');
const { handleQueryError } = require('../utils/errorHandler');
const authMiddleware = require('../middleware/auth');
const { isValidPlan, normalizePlan, DEFAULT_PLAN } = require('../utils/plans');
const { insertWithinLimit } = require('../utils/planLimits');

router.use(authMiddleware);

// --- BACKOFFICE ADMIN ROUTES ---
router.get('/admin/tenants', async (req, res) => {
  if (!isBackoffice(req)) return res.status(403).json({ error: 'Proibido' });
  try {
    const sql = `
      SELECT t.*, 
             (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) as users_count,
             (SELECT COUNT(*) FROM equipments e WHERE e.tenant_id = t.id) as equipments_count,
             (SELECT COUNT(*) FROM invoices i WHERE i.tenant_id = t.id AND i.status = 'Pendente') as pending_invoices,
             (SELECT COALESCE(SUM(i.valor), 0) FROM invoices i WHERE i.tenant_id = t.id AND i.status = 'Pendente') as pending_value
      FROM tenants t
    `;
    const rows = await query(sql);
    res.json(rows);
  } catch (err) { handleQueryError(res, err, 'Erro ao listar clientes'); }
});

router.post('/admin/tenants', async (req, res) => {
  if (!isBackoffice(req)) return res.status(403).json({ error: 'Proibido' });
  const { id, name, plan_type, contact_email, contact_phone } = req.body;
  if (plan_type && !isValidPlan(plan_type)) return res.status(400).json({ error: 'Plano inválido' });
  try {
    await query(
      'INSERT INTO tenants (id, name, plan_type, contact_email, contact_phone) VALUES (?, ?, ?, ?, ?)',
      [id, name, plan_type ? normalizePlan(plan_type) : DEFAULT_PLAN, contact_email, contact_phone]
    );
    const tempPassword = generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    await query(
      'INSERT INTO users (tenant_id, name, email, role, password) VALUES (?, ?, ?, ?, ?)',
      [id, `Admin ${name}`, contact_email || `admin@${id}.com`, 'Administrador', hashedPassword]
    );
    // A senha provisória só é exibida nesta resposta; o cliente pode trocá-la via "esqueci minha senha"
    res.json({ message: 'Cliente cadastrado', id, temp_password: tempPassword });
  } catch (err) { handleQueryError(res, err, 'Erro ao criar cliente'); }
});

router.put('/admin/tenants/:id', async (req, res) => {
  if (!isBackoffice(req)) return res.status(403).json({ error: 'Proibido' });
  const { name, plan_type, contact_email, contact_phone } = req.body;
  if (plan_type && !isValidPlan(plan_type)) return res.status(400).json({ error: 'Plano inválido' });
  try {
    await query(
      'UPDATE tenants SET name=COALESCE(?,name), plan_type=COALESCE(?,plan_type), contact_email=COALESCE(?,contact_email), contact_phone=COALESCE(?,contact_phone) WHERE id=?',
      [name, plan_type ? normalizePlan(plan_type) : null, contact_email, contact_phone, req.params.id]
    );
    res.json({ message: 'Cliente atualizado' });
  } catch (err) { handleQueryError(res, err, 'Erro ao atualizar cliente'); }
});

router.put('/admin/tenants/:id/status', async (req, res) => {
  if (!isBackoffice(req)) return res.status(403).json({ error: 'Proibido' });
  try {
    const { status } = req.body;
    await query('UPDATE tenants SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ message: 'Status atualizado' });
  } catch (err) { handleQueryError(res, err, 'Erro ao atualizar status'); }
});

router.delete('/admin/tenants/:id', async (req, res) => {
  if (!req.user.is_master) return res.status(403).json({ error: 'Apenas o Root pode excluir clientes' });
  try {
    await query('DELETE FROM tenants WHERE id = ?', [req.params.id]);
    res.json({ message: 'Cliente excluído permanentemente' });
  } catch (err) { handleQueryError(res, err, 'Erro ao excluir cliente'); }
});

router.put('/admin/tenants/:id/contract', async (req, res) => {
  if (!isBackoffice(req)) return res.status(403).json({ error: 'Proibido' });
  const { contrato_inicio, contrato_fim, renovacao_auto, valor_mensal, plan_type, status, extra_assets, extra_users } = req.body;
  if (plan_type && !isValidPlan(plan_type)) return res.status(400).json({ error: 'Plano inválido' });
  const isCount = (v) => v === undefined || v === null || v === '' || (Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 100000);
  if (!isCount(extra_assets) || !isCount(extra_users)) return res.status(400).json({ error: 'Excedentes devem ser inteiros não negativos' });
  const toCount = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
  try {
    await query(
      `UPDATE tenants SET 
        contrato_inicio=COALESCE(?,contrato_inicio), 
        contrato_fim=COALESCE(?,contrato_fim), 
        renovacao_auto=COALESCE(?,renovacao_auto), 
        valor_mensal=COALESCE(?,valor_mensal), 
        plan_type=COALESCE(?,plan_type),
        status=COALESCE(?,status),
        extra_assets=COALESCE(?,extra_assets),
        extra_users=COALESCE(?,extra_users)
      WHERE id=?`,
      [contrato_inicio, contrato_fim, renovacao_auto, valor_mensal, plan_type ? normalizePlan(plan_type) : null, status, toCount(extra_assets), toCount(extra_users), req.params.id]
    );
    res.json({ message: 'Contrato atualizado' });
  } catch (err) { handleQueryError(res, err, 'Erro ao atualizar contrato'); }
});

router.get('/admin/users', async (req, res) => {
  if (!req.user.is_master) return res.status(403).json({ error: 'Proibido' });
  try {
    const rows = await query('SELECT id, name, email, role, is_master, created_at FROM users WHERE is_master = TRUE OR role = "Suporte"');
    res.json(rows);
  } catch (err) { handleQueryError(res, err, 'Erro ao listar usuários backoffice'); }
});

router.post('/admin/users', async (req, res) => {
  if (!req.user.is_master) return res.status(403).json({ error: 'Apenas Root pode criar agentes de backoffice' });
  const { name, email, password } = req.body;
  try {
    const tempPassword = password ? null : generateTempPassword();
    const hashedPassword = await bcrypt.hash(password || tempPassword, 10);
    const result = await query(
      'INSERT INTO users (tenant_id, name, email, role, password, is_master) VALUES (NULL, ?, ?, "Suporte", ?, FALSE)',
      [name, email, hashedPassword]
    );
    res.json({ id: result.insertId, name, email, role: 'Suporte', ...(tempPassword && { temp_password: tempPassword }) });
  } catch (err) { handleQueryError(res, err, 'Erro ao criar agente de backoffice'); }
});

// --- TENANTS & USUÁRIOS DO CLIENTE ---
router.get('/tenants', async (req, res) => {
  try {
    if (isBackoffice(req)) {
      const rows = await query('SELECT * FROM tenants');
      res.json(rows);
    } else {
      const rows = await query('SELECT * FROM tenants WHERE id = ?', [req.user.tenant_id]);
      res.json(rows);
    }
  } catch (err) { handleQueryError(res, err, 'Erro ao listar dados do tenant'); }
});

router.get('/users', async (req, res) => {
  const tenant_id = getTenantId(req);
  try {
    const rows = await query('SELECT id, name, email, role, tenant_id, is_master FROM users WHERE tenant_id = ?', [tenant_id]);
    res.json(rows);
  } catch (err) { handleQueryError(res, err, 'Erro ao listar usuários'); }
});

router.post('/users', async (req, res) => {
  const tenant_id = getTenantId(req);
  const { name, email, role, password } = req.body;
  try {
    const allowed = ['Administrador', 'Dono', 'Suporte'];
    if (!allowed.includes(req.user.role) && !req.user.is_master) {
      return res.status(403).json({ error: 'Sem permissão' });
    }
    if (!tenant_id) return res.status(400).json({ error: 'Tenant ID required' });
    // Usuários de cliente só podem ter papéis de cliente. "Suporte" é backoffice (acesso a todos os tenants)
    // e só é criado por /admin/users.
    const rolesCliente = ['Dono', 'Administrador', 'Usuário'];
    if (!rolesCliente.includes(role)) {
      return res.status(400).json({ error: 'Papel inválido' });
    }
    const tempPassword = password ? null : generateTempPassword();
    const hashedPassword = await bcrypt.hash(password || tempPassword, 10);
    const r = await insertWithinLimit(
      tenant_id, 'users',
      'INSERT INTO users (tenant_id, name, email, role, password) VALUES (?, ?, ?, ?, ?)',
      [tenant_id, name, email, role, hashedPassword]
    );
    if (r.notFound) return res.status(404).json({ error: 'Tenant não encontrado' });
    if (r.limitReached) return res.status(403).json({ code: 'PLAN_LIMIT_USERS', error: r.message, limit: r.limit });
    res.json({ id: r.insertId, name, email, role, tenant_id, ...(tempPassword && { temp_password: tempPassword }) });
  } catch (err) { handleQueryError(res, err, 'Erro ao criar usuário'); }
});

module.exports = router;
