const express = require('express');
const router = express.Router();
const { query, getTenantId } = require('../utils/routeHelpers');
const { handleQueryError } = require('../utils/errorHandler');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// --- PREVENTIVE PLANS (Planos Preventivos) ---
router.get('/preventive-plans', async (req, res) => {
  const tenant_id = getTenantId(req);
  try {
    const rows = await query('SELECT p.*, e.name as equipment_name FROM preventive_plans p JOIN equipments e ON p.equipment_id = e.id WHERE p.tenant_id = ?', [tenant_id]);
    res.json(rows);
  } catch (err) { handleQueryError(res, err, 'Erro ao listar planos preventivos'); }
});

router.post('/preventive-plans', async (req, res) => {
  const tenant_id = getTenantId(req);
  const { equipment_id, title, description, interval_days, status } = req.body;
  try {
    const result = await query(
      'INSERT INTO preventive_plans (tenant_id, equipment_id, title, description, interval_days, next_due, status) VALUES (?, ?, ?, ?, ?, DATE_ADD(CURRENT_DATE, INTERVAL ? DAY), ?)',
      [tenant_id, equipment_id, title, description, interval_days, interval_days, status || 'Ativo']
    );
    res.json({ id: result.insertId, ...req.body, tenant_id });
  } catch (err) { handleQueryError(res, err, 'Erro ao criar plano preventivo'); }
});

router.put('/preventive-plans/:id', async (req, res) => {
  const tenant_id = getTenantId(req);
  const { title, description, interval_days, status, reset_due } = req.body;
  try {
    if (reset_due) {
      await query(
        'UPDATE preventive_plans SET title=COALESCE(?, title), description=COALESCE(?, description), interval_days=COALESCE(?, interval_days), status=COALESCE(?, status), last_executed=CURRENT_DATE, next_due=DATE_ADD(CURRENT_DATE, INTERVAL interval_days DAY) WHERE id=? AND tenant_id=?',
        [title, description, interval_days, status, req.params.id, tenant_id]
      );
    } else {
      await query(
        'UPDATE preventive_plans SET title=COALESCE(?, title), description=COALESCE(?, description), interval_days=COALESCE(?, interval_days), status=COALESCE(?, status) WHERE id=? AND tenant_id=?',
        [title, description, interval_days, status, req.params.id, tenant_id]
      );
    }
    res.json({ message: 'Plano atualizado' });
  } catch (err) { handleQueryError(res, err, 'Erro ao atualizar plano preventivo'); }
});

router.delete('/preventive-plans/:id', async (req, res) => {
  const tenant_id = getTenantId(req);
  try {
    await query('DELETE FROM preventive_plans WHERE id = ? AND tenant_id = ?', [req.params.id, tenant_id]);
    res.json({ message: 'Excluído com sucesso' });
  } catch (err) { handleQueryError(res, err, 'Erro ao excluir plano preventivo'); }
});

module.exports = router;
