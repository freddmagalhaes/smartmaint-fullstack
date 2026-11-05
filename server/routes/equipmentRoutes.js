const express = require('express');
const router = express.Router();
const { query, getTenantId, equipmentBelongsToTenant } = require('../utils/routeHelpers');
const { handleQueryError } = require('../utils/errorHandler');
const authMiddleware = require('../middleware/auth');
const { insertWithinLimit, requireFeature } = require('../utils/planLimits');

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

// Ficha de um equipamento (destino do QR code colado na máquina): dados, últimas O.S. e planos preventivos.
// Tudo filtrado pelo tenant do token; id de outro cliente responde 404 (igual a id inexistente).
router.get('/equipments/:id', async (req, res) => {
  const tenant_id = getTenantId(req);
  if (!tenant_id) return res.status(400).json({ error: 'Tenant ID required' });
  if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Equipamento não encontrado' });
  try {
    const [equipment] = await query('SELECT * FROM equipments WHERE id = ? AND tenant_id = ?', [req.params.id, tenant_id]);
    if (!equipment) return res.status(404).json({ error: 'Equipamento não encontrado' });
    const [work_orders, preventive_plans, [failures]] = await Promise.all([
      query('SELECT id, titulo, tipo, prioridade, status, data_criacao FROM work_orders WHERE equipment_id = ? AND tenant_id = ? ORDER BY id DESC LIMIT 5', [equipment.id, tenant_id]),
      query('SELECT id, title, next_due, status FROM preventive_plans WHERE equipment_id = ? AND tenant_id = ? ORDER BY next_due ASC LIMIT 5', [equipment.id, tenant_id]),
      query('SELECT COUNT(*) AS total FROM failures WHERE equipment_id = ? AND tenant_id = ?', [equipment.id, tenant_id]),
    ]);
    res.json({ ...equipment, work_orders, preventive_plans, failures_count: failures.total });
  } catch (err) { handleQueryError(res, err, 'Erro ao buscar equipamento'); }
});

router.post('/equipments', async (req, res) => {
  const tenant_id = getTenantId(req);
  if (!tenant_id) return res.status(400).json({ error: 'Tenant ID required' });
  const { name, type, model, serie, image, total_op_time, data_inicio } = req.body;
  try {
    const r = await insertWithinLimit(
      tenant_id, 'assets',
      'INSERT INTO equipments (tenant_id, name, type, model, serie, image, total_op_time, data_inicio) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [tenant_id, name, type, model, serie, image, total_op_time, data_inicio]
    );
    if (r.notFound) return res.status(404).json({ error: 'Tenant não encontrado' });
    if (r.limitReached) return res.status(403).json({ code: 'PLAN_LIMIT_ASSETS', error: r.message, limit: r.limit });
    res.json({ id: r.insertId, ...req.body, tenant_id });
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
    if (!(await equipmentBelongsToTenant(equipment_id, tenant_id))) return res.status(400).json({ error: 'Equipamento inválido' });
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

// --- FMEA (recurso dos planos Profissional ou superior) ---
router.get('/fmea', requireFeature('fmea'), async (req, res) => {
  const tenant_id = getTenantId(req);
  try {
    const rows = await query('SELECT * FROM fmea WHERE tenant_id = ?', [tenant_id]);
    res.json(rows);
  } catch (err) { handleQueryError(res, err, 'Erro ao listar FMEA'); }
});

router.post('/fmea', requireFeature('fmea'), async (req, res) => {
  const tenant_id = getTenantId(req);
  const { equipment_id, componente, modo_falha, severity, ocorrencia, deteccao } = req.body;
  try {
    if (!(await equipmentBelongsToTenant(equipment_id, tenant_id))) return res.status(400).json({ error: 'Equipamento inválido' });
    const result = await query(
      'INSERT INTO fmea (tenant_id, equipment_id, componente, modo_falha, severity, ocorrencia, deteccao) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [tenant_id, equipment_id, componente, modo_falha, severity, ocorrencia, deteccao]
    );
    res.json({ id: result.insertId, ...req.body, tenant_id });
  } catch (err) { handleQueryError(res, err, 'Erro ao criar FMEA'); }
});

router.delete('/fmea/:id', requireFeature('fmea'), async (req, res) => {
  const tenant_id = getTenantId(req);
  try {
    await query('DELETE FROM fmea WHERE id = ? AND tenant_id = ?', [req.params.id, tenant_id]);
    res.json({ message: 'Excluído com sucesso' });
  } catch (err) { handleQueryError(res, err, 'Erro ao excluir FMEA'); }
});

module.exports = router;
