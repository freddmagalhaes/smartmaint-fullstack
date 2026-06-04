const express = require('express');
const router = express.Router();
const { query, getTenantId } = require('../utils/routeHelpers');
const { handleQueryError } = require('../utils/errorHandler');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// --- EQUIPAMENTOS ---
router.get('/equipments', async (req, res) => {
  const tenant_id = getTenantId(req);
  if (!tenant_id) return res.status(400).json({ error: 'Tenant ID required' });
  try {
    const rows = await query('SELECT * FROM equipments WHERE tenant_id = ?', [tenant_id]);
    res.json(rows);
  } catch (err) { handleQueryError(res, err, 'Erro ao listar equipamentos'); }
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
  } catch (err) { handleQueryError(res, err, 'Erro ao criar equipamento'); }
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
  } catch (err) { handleQueryError(res, err, 'Erro ao atualizar equipamento'); }
});

router.delete('/equipments/:id', async (req, res) => {
  const tenant_id = getTenantId(req);
  try {
    await query('DELETE FROM equipments WHERE id = ? AND tenant_id = ?', [req.params.id, tenant_id]);
    res.json({ message: 'Excluído com sucesso' });
  } catch (err) { handleQueryError(res, err, 'Erro ao excluir equipamento'); }
});

// --- FALHAS ---
router.get('/failures', async (req, res) => {
  const tenant_id = getTenantId(req);
  try {
    const rows = await query('SELECT * FROM failures WHERE tenant_id = ?', [tenant_id]);
    res.json(rows);
  } catch (err) { handleQueryError(res, err, 'Erro ao listar falhas'); }
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
  } catch (err) { handleQueryError(res, err, 'Erro ao criar falha'); }
});

router.delete('/failures/:id', async (req, res) => {
  const tenant_id = getTenantId(req);
  try {
    await query('DELETE FROM failures WHERE id = ? AND tenant_id = ?', [req.params.id, tenant_id]);
    res.json({ message: 'Excluído com sucesso' });
  } catch (err) { handleQueryError(res, err, 'Erro ao excluir falha'); }
});

// --- REPAROS ---
router.get('/repairs', async (req, res) => {
  const tenant_id = getTenantId(req);
  try {
    const rows = await query('SELECT * FROM repairs WHERE tenant_id = ?', [tenant_id]);
    res.json(rows);
  } catch (err) { handleQueryError(res, err, 'Erro ao listar reparos'); }
});

// --- FMEA ---
router.get('/fmea', async (req, res) => {
  const tenant_id = getTenantId(req);
  try {
    const rows = await query('SELECT * FROM fmea WHERE tenant_id = ?', [tenant_id]);
    res.json(rows);
  } catch (err) { handleQueryError(res, err, 'Erro ao listar FMEA'); }
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
  } catch (err) { handleQueryError(res, err, 'Erro ao criar FMEA'); }
});

router.delete('/fmea/:id', async (req, res) => {
  const tenant_id = getTenantId(req);
  try {
    await query('DELETE FROM fmea WHERE id = ? AND tenant_id = ?', [req.params.id, tenant_id]);
    res.json({ message: 'Excluído com sucesso' });
  } catch (err) { handleQueryError(res, err, 'Erro ao excluir FMEA'); }
});

module.exports = router;
