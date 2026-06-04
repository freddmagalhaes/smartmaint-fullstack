const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { query, getTenantId, isBackoffice } = require('../utils/routeHelpers');
const { handleQueryError } = require('../utils/errorHandler');
const authMiddleware = require('../middleware/auth');

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
  try {
    await query(
      'INSERT INTO tenants (id, name, plan_type, contact_email, contact_phone) VALUES (?, ?, ?, ?, ?)',
      [id, name, plan_type || 'Pro', contact_email, contact_phone]
    );
    const hashedPassword = await bcrypt.hash('123456', 10);
    await query(
      'INSERT INTO users (tenant_id, name, email, role, password) VALUES (?, ?, ?, ?, ?)',
      [id, `Admin ${name}`, contact_email || `admin@${id}.com`, 'Administrador', hashedPassword]
    );
    res.json({ message: 'Cliente cadastrado', id });
  } catch (err) { handleQueryError(res, err, 'Erro ao criar cliente'); }
});

router.put('/admin/tenants/:id', async (req, res) => {
  if (!isBackoffice(req)) return res.status(403).json({ error: 'Proibido' });
  const { name, plan_type, contact_email, contact_phone } = req.body;
  try {
    await query(
      'UPDATE tenants SET name=COALESCE(?,name), plan_type=COALESCE(?,plan_type), contact_email=COALESCE(?,contact_email), contact_phone=COALESCE(?,contact_phone) WHERE id=?',
      [name, plan_type, contact_email, contact_phone, req.params.id]
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
  const { contrato_inicio, contrato_fim, renovacao_auto, valor_mensal, plan_type, status } = req.body;
  try {
    await query(
      `UPDATE tenants SET 
        contrato_inicio=COALESCE(?,contrato_inicio), 
        contrato_fim=COALESCE(?,contrato_fim), 
        renovacao_auto=COALESCE(?,renovacao_auto), 
        valor_mensal=COALESCE(?,valor_mensal), 
        plan_type=COALESCE(?,plan_type),
        status=COALESCE(?,status)
      WHERE id=?`,
      [contrato_inicio, contrato_fim, renovacao_auto, valor_mensal, plan_type, status, req.params.id]
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
    const hashedPassword = await bcrypt.hash(password || '123456', 10);
    const result = await query(
      'INSERT INTO users (tenant_id, name, email, role, password, is_master) VALUES (NULL, ?, ?, "Suporte", ?, FALSE)',
      [name, email, hashedPassword]
    );
    res.json({ id: result.insertId, name, email, role: 'Suporte' });
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
    const hashedPassword = await bcrypt.hash(password || '123456', 10);
    const result = await query(
      'INSERT INTO users (tenant_id, name, email, role, password) VALUES (?, ?, ?, ?, ?)',
      [tenant_id, name, email, role, hashedPassword]
    );
    res.json({ id: result.insertId, name, email, role, tenant_id });
  } catch (err) { handleQueryError(res, err, 'Erro ao criar usuário'); }
});

module.exports = router;
