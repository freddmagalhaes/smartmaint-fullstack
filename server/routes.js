const express = require('express');
const router = express.Router();
const db = require('./db');

// --- HELPER PARA QUERIES ---
const query = async (sql, params) => {
  const [rows] = await db.query(sql, params);
  return rows;
};

// --- AUTH ---
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const rows = await query('SELECT * FROM users WHERE email = ? AND password = ?', [email, password]);
    if (rows.length > 0) {
      res.json(rows[0]);
    } else {
      res.status(401).json({ message: 'Credenciais inválidas' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- TENANTS ---
router.get('/tenants', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM tenants');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- EQUIPAMENTOS ---
router.get('/equipments', async (req, res) => {
  const { tenant_id } = req.query;
  try {
    const rows = await query('SELECT * FROM equipments WHERE tenant_id = ?', [tenant_id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/equipments', async (req, res) => {
  const { tenant_id, name, type, model, serie, image, total_op_time, data_inicio } = req.body;
  try {
    const result = await query(
      'INSERT INTO equipments (tenant_id, name, type, model, serie, image, total_op_time, data_inicio) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [tenant_id, name, type, model, serie, image, total_op_time, data_inicio]
    );
    res.json({ id: result.insertId, ...req.body });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/equipments/:id', async (req, res) => {
  const { name, type, model, serie, total_op_time } = req.body;
  try {
    await query(
      'UPDATE equipments SET name=?, type=?, model=?, serie=?, total_op_time=? WHERE id=?',
      [name, type, model, serie, total_op_time, req.params.id]
    );
    res.json({ message: 'Atualizado com sucesso' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/equipments/:id', async (req, res) => {
  try {
    await query('DELETE FROM equipments WHERE id = ?', [req.params.id]);
    res.json({ message: 'Excluído com sucesso' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- FALHAS ---
router.get('/failures', async (req, res) => {
  const { tenant_id } = req.query;
  try {
    const rows = await query('SELECT * FROM failures WHERE tenant_id = ?', [tenant_id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/failures', async (req, res) => {
  const { tenant_id, equipment_id, descricao, tempo_operacao, data_falha } = req.body;
  try {
    const result = await query(
      'INSERT INTO failures (tenant_id, equipment_id, descricao, tempo_operacao, data_falha) VALUES (?, ?, ?, ?, ?)',
      [tenant_id, equipment_id, descricao, tempo_operacao, data_falha || new Date().toISOString().split('T')[0]]
    );
    res.json({ id: result.insertId, ...req.body });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/failures/:id', async (req, res) => {
  try {
    await query('DELETE FROM failures WHERE id = ?', [req.params.id]);
    res.json({ message: 'Excluído com sucesso' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- FMEA ---
router.get('/fmea', async (req, res) => {
  const { tenant_id } = req.query;
  try {
    const rows = await query('SELECT * FROM fmea WHERE tenant_id = ?', [tenant_id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/fmea', async (req, res) => {
  const { tenant_id, equipment_id, componente, modo_falha, severity, ocorrencia, deteccao } = req.body;
  try {
    const result = await query(
      'INSERT INTO fmea (tenant_id, equipment_id, componente, modo_falha, severity, ocorrencia, deteccao) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [tenant_id, equipment_id, componente, modo_falha, severity, ocorrencia, deteccao]
    );
    res.json({ id: result.insertId, ...req.body });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/fmea/:id', async (req, res) => {
  try {
    await query('DELETE FROM fmea WHERE id = ?', [req.params.id]);
    res.json({ message: 'Excluído com sucesso' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- ORDENS DE SERVIÇO ---
router.get('/work-orders', async (req, res) => {
  const { tenant_id } = req.query;
  try {
    const rows = await query('SELECT * FROM work_orders WHERE tenant_id = ?', [tenant_id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/work-orders', async (req, res) => {
  const { tenant_id, equipment_id, titulo, tipo, prioridade, status, responsavel, data_criacao } = req.body;
  try {
    const result = await query(
      'INSERT INTO work_orders (tenant_id, equipment_id, titulo, tipo, prioridade, status, responsavel, data_criacao) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [tenant_id, equipment_id, titulo, tipo, prioridade, status, responsavel, data_criacao || new Date().toISOString().split('T')[0]]
    );
    res.json({ id: result.insertId, ...req.body });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/work-orders/:id', async (req, res) => {
  const { status, titulo, prioridade, responsavel } = req.body;
  try {
    await query(
      'UPDATE work_orders SET status=COALESCE(?, status), titulo=COALESCE(?, titulo), prioridade=COALESCE(?, prioridade), responsavel=COALESCE(?, responsavel) WHERE id=?',
      [status, titulo, prioridade, responsavel, req.params.id]
    );
    res.json({ message: 'OS atualizada' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/work-orders/:id', async (req, res) => {
  try {
    await query('DELETE FROM work_orders WHERE id = ?', [req.params.id]);
    res.json({ message: 'Excluída com sucesso' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- USUÁRIOS / EQUIPE ---
router.get('/users', async (req, res) => {
  const { tenant_id } = req.query;
  try {
    const rows = await query('SELECT id, name, email, role, tenant_id FROM users WHERE tenant_id = ?', [tenant_id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/users', async (req, res) => {
  const { tenant_id, name, email, role, password } = req.body;
  try {
    const result = await query(
      'INSERT INTO users (tenant_id, name, email, role, password) VALUES (?, ?, ?, ?, ?)',
      [tenant_id, name, email, role, password || '123456']
    );
    res.json({ id: result.insertId, name, email, role });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
