const express = require('express');
const router = express.Router();
const db = require('./db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authMiddleware = require('./middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'smartmaint_super_secret_key_2026';

const query = async (sql, params) => {
  const [rows] = await db.query(sql, params);
  return rows;
};

// --- AUTH ---
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const rows = await query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length > 0) {
      const user = rows[0];
      const isValid = await bcrypt.compare(password, user.password);
      
      if (isValid) {
        // Bloqueio de Inadimplência (não se aplica a Root/Suporte)
        if (!user.is_master && user.role !== 'Suporte' && user.tenant_id) {
          const tenantRows = await query('SELECT status FROM tenants WHERE id = ?', [user.tenant_id]);
          if (tenantRows.length > 0) {
            const tStatus = tenantRows[0].status;
            if (tStatus === 'Inadimplente' || tStatus === 'Cancelado') {
              return res.status(403).json({ error: 'Acesso bloqueado. Entre em contato com o suporte.' });
            }
          }
        }

        const token = jwt.sign(
          { id: user.id, tenant_id: user.tenant_id, role: user.role, is_master: user.is_master },
          JWT_SECRET,
          { expiresIn: '24h' }
        );
        delete user.password;
        res.json({ ...user, token });
      } else {
        res.status(401).json({ message: 'Credenciais inválidas' });
      }
    } else {
      res.status(401).json({ message: 'Credenciais inválidas' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper: determina o tenant_id correto
const getTenantId = (req) => {
  if (req.user.is_master || req.user.role === 'Suporte') {
    return req.query.tenant_id || req.body.tenant_id;
  }
  return req.user.tenant_id;
};

// Helper: checa se é Root ou Suporte (backoffice)
const isBackoffice = (req) => req.user.is_master || req.user.role === 'Suporte';

router.use(authMiddleware);

// ============================================================================
// BACKOFFICE ADMIN ROUTES (Root + Suporte)
// ============================================================================

// --- TENANTS (Clientes) ---
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/admin/tenants', async (req, res) => {
  if (!isBackoffice(req)) return res.status(403).json({ error: 'Proibido' });
  const { id, name, plan_type, contact_email, contact_phone } = req.body;
  try {
    await query(
      'INSERT INTO tenants (id, name, plan_type, contact_email, contact_phone) VALUES (?, ?, ?, ?, ?)',
      [id, name, plan_type || 'Pro', contact_email, contact_phone]
    );
    // Cria um administrador padrão para o novo tenant
    const hashedPassword = await bcrypt.hash('123456', 10);
    await query(
      'INSERT INTO users (tenant_id, name, email, role, password) VALUES (?, ?, ?, ?, ?)',
      [id, `Admin ${name}`, contact_email || `admin@${id}.com`, 'Administrador', hashedPassword]
    );
    res.json({ message: 'Cliente cadastrado', id });
  } catch (err) { res.status(500).json({ error: err.message }); }
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/admin/tenants/:id/status', async (req, res) => {
  if (!isBackoffice(req)) return res.status(403).json({ error: 'Proibido' });
  try {
    const { status } = req.body;
    await query('UPDATE tenants SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ message: 'Status atualizado' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/admin/tenants/:id', async (req, res) => {
  if (!req.user.is_master) return res.status(403).json({ error: 'Apenas o Root pode excluir clientes' });
  try {
    await query('DELETE FROM tenants WHERE id = ?', [req.params.id]);
    res.json({ message: 'Cliente excluído permanentemente' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Gestão de Contrato
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- INVOICES (Faturas) ---
router.get('/admin/invoices', async (req, res) => {
  if (!isBackoffice(req)) return res.status(403).json({ error: 'Proibido' });
  const { tenant_id } = req.query;
  try {
    let sql = 'SELECT i.*, t.name as tenant_name FROM invoices i JOIN tenants t ON i.tenant_id = t.id';
    let params = [];
    if (tenant_id) {
      sql += ' WHERE i.tenant_id = ?';
      params.push(tenant_id);
    }
    sql += ' ORDER BY i.vencimento DESC';
    const rows = await query(sql, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/admin/invoices', async (req, res) => {
  if (!isBackoffice(req)) return res.status(403).json({ error: 'Proibido' });
  const { tenant_id, valor, vencimento, status, mes_ref } = req.body;
  try {
    const result = await query(
      'INSERT INTO invoices (tenant_id, valor, vencimento, status, mes_ref) VALUES (?, ?, ?, ?, ?)',
      [tenant_id, valor, vencimento, status || 'Pendente', mes_ref]
    );
    res.json({ id: result.insertId, ...req.body });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/admin/invoices/:id/status', async (req, res) => {
  if (!isBackoffice(req)) return res.status(403).json({ error: 'Proibido' });
  try {
    const { status } = req.body;
    await query('UPDATE invoices SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ message: 'Fatura atualizada' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- BACKOFFICE USERS (equipe do suporte) ---
router.get('/admin/users', async (req, res) => {
  if (!req.user.is_master) return res.status(403).json({ error: 'Proibido' });
  try {
    const rows = await query('SELECT id, name, email, role, is_master, created_at FROM users WHERE is_master = TRUE OR role = "Suporte"');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ============================================================================
// OPERATIONAL ROUTES (Rotas do sistema operacional do cliente)
// ============================================================================

// --- TENANTS ---
router.get('/tenants', async (req, res) => {
  try {
    if (isBackoffice(req)) {
      const rows = await query('SELECT * FROM tenants');
      res.json(rows);
    } else {
      const rows = await query('SELECT * FROM tenants WHERE id = ?', [req.user.tenant_id]);
      res.json(rows);
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- EQUIPAMENTOS ---
router.get('/equipments', async (req, res) => {
  const tenant_id = getTenantId(req);
  if (!tenant_id) return res.status(400).json({ error: 'Tenant ID required' });
  try {
    const rows = await query('SELECT * FROM equipments WHERE tenant_id = ?', [tenant_id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/equipments', async (req, res) => {
  const tenant_id = getTenantId(req);
  const { name, type, model, serie, image, total_op_time, data_inicio } = req.body;
  try {
    const result = await query(
      'INSERT INTO equipments (tenant_id, name, type, model, serie, image, total_op_time, data_inicio) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [tenant_id, name, type, model, serie, image, total_op_time, data_inicio]
    );
    res.json({ id: result.insertId, ...req.body, tenant_id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/equipments/:id', async (req, res) => {
  const { name, type, model, serie, total_op_time } = req.body;
  const tenant_id = getTenantId(req);
  try {
    await query(
      'UPDATE equipments SET name=?, type=?, model=?, serie=?, total_op_time=? WHERE id=? AND tenant_id=?',
      [name, type, model, serie, total_op_time, req.params.id, tenant_id]
    );
    res.json({ message: 'Atualizado com sucesso' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/equipments/:id', async (req, res) => {
  const tenant_id = getTenantId(req);
  try {
    await query('DELETE FROM equipments WHERE id = ? AND tenant_id = ?', [req.params.id, tenant_id]);
    res.json({ message: 'Excluído com sucesso' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- FALHAS ---
router.get('/failures', async (req, res) => {
  const tenant_id = getTenantId(req);
  try {
    const rows = await query('SELECT * FROM failures WHERE tenant_id = ?', [tenant_id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/failures', async (req, res) => {
  const tenant_id = getTenantId(req);
  const { equipment_id, descricao, tempo_operacao, data_falha } = req.body;
  try {
    const result = await query(
      'INSERT INTO failures (tenant_id, equipment_id, descricao, tempo_operacao, data_falha) VALUES (?, ?, ?, ?, ?)',
      [tenant_id, equipment_id, descricao, tempo_operacao, data_falha || new Date().toISOString().split('T')[0]]
    );
    res.json({ id: result.insertId, ...req.body, tenant_id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/failures/:id', async (req, res) => {
  const tenant_id = getTenantId(req);
  try {
    await query('DELETE FROM failures WHERE id = ? AND tenant_id = ?', [req.params.id, tenant_id]);
    res.json({ message: 'Excluído com sucesso' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- REPAROS ---
router.get('/repairs', async (req, res) => {
  const tenant_id = getTenantId(req);
  try {
    const rows = await query('SELECT * FROM repairs WHERE tenant_id = ?', [tenant_id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- FMEA ---
router.get('/fmea', async (req, res) => {
  const tenant_id = getTenantId(req);
  try {
    const rows = await query('SELECT * FROM fmea WHERE tenant_id = ?', [tenant_id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/fmea', async (req, res) => {
  const tenant_id = getTenantId(req);
  const { equipment_id, componente, modo_falha, severity, ocorrencia, deteccao } = req.body;
  try {
    const result = await query(
      'INSERT INTO fmea (tenant_id, equipment_id, componente, modo_falha, severity, ocorrencia, deteccao) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [tenant_id, equipment_id, componente, modo_falha, severity, ocorrencia, deteccao]
    );
    res.json({ id: result.insertId, ...req.body, tenant_id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/fmea/:id', async (req, res) => {
  const tenant_id = getTenantId(req);
  try {
    await query('DELETE FROM fmea WHERE id = ? AND tenant_id = ?', [req.params.id, tenant_id]);
    res.json({ message: 'Excluído com sucesso' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- ORDENS DE SERVIÇO ---
router.get('/work-orders', async (req, res) => {
  const tenant_id = getTenantId(req);
  try {
    const rows = await query('SELECT * FROM work_orders WHERE tenant_id = ?', [tenant_id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/work-orders', async (req, res) => {
  const tenant_id = getTenantId(req);
  const { equipment_id, titulo, tipo, prioridade, status, responsavel, data_criacao } = req.body;
  try {
    const result = await query(
      'INSERT INTO work_orders (tenant_id, equipment_id, titulo, tipo, prioridade, status, responsavel, data_criacao) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [tenant_id, equipment_id, titulo, tipo, prioridade, status, responsavel, data_criacao || new Date().toISOString().split('T')[0]]
    );
    res.json({ id: result.insertId, ...req.body, tenant_id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/work-orders/:id', async (req, res) => {
  const tenant_id = getTenantId(req);
  const { status, titulo, prioridade, responsavel } = req.body;
  try {
    await query(
      'UPDATE work_orders SET status=COALESCE(?, status), titulo=COALESCE(?, titulo), prioridade=COALESCE(?, prioridade), responsavel=COALESCE(?, responsavel) WHERE id=? AND tenant_id=?',
      [status, titulo, prioridade, responsavel, req.params.id, tenant_id]
    );
    
    if (status === 'Concluída') {
      const [os] = await query('SELECT * FROM work_orders WHERE id = ? AND tenant_id = ?', [req.params.id, tenant_id]);
      if (os) {
        await query(
          'INSERT INTO repairs (tenant_id, equipment_id, tipo, tempo_reparo, data_reparo) VALUES (?, ?, ?, ?, ?)',
          [tenant_id, os.equipment_id, os.tipo, 4, new Date().toISOString().split('T')[0]]
        );
      }
    }
    
    res.json({ message: 'OS atualizada' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/work-orders/:id', async (req, res) => {
  const tenant_id = getTenantId(req);
  try {
    await query('DELETE FROM work_orders WHERE id = ? AND tenant_id = ?', [req.params.id, tenant_id]);
    res.json({ message: 'Excluída com sucesso' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- USUÁRIOS / EQUIPE ---
router.get('/users', async (req, res) => {
  const tenant_id = getTenantId(req);
  try {
    const rows = await query('SELECT id, name, email, role, tenant_id, is_master FROM users WHERE tenant_id = ?', [tenant_id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/users', async (req, res) => {
  const tenant_id = getTenantId(req);
  const { name, email, role, password } = req.body;
  try {
    // Somente Admin, Root ou Suporte podem criar
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
