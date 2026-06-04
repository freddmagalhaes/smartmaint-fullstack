const express = require('express');
const router = express.Router();
const { query, getTenantId } = require('../utils/routeHelpers');
const { handleQueryError } = require('../utils/errorHandler');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// --- ORDENS DE SERVIÇO ---
router.get('/work-orders', async (req, res) => {
  const tenant_id = getTenantId(req);
  try {
    const rows = await query('SELECT * FROM work_orders WHERE tenant_id = ?', [tenant_id]);
    res.json(rows);
  } catch (err) { handleQueryError(res, err, 'Erro ao listar ordens de serviço'); }
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
  } catch (err) { handleQueryError(res, err, 'Erro ao criar ordem de serviço'); }
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
  } catch (err) { handleQueryError(res, err, 'Erro ao atualizar OS'); }
});

router.delete('/work-orders/:id', async (req, res) => {
  const tenant_id = getTenantId(req);
  try {
    await query('DELETE FROM work_orders WHERE id = ? AND tenant_id = ?', [req.params.id, tenant_id]);
    res.json({ message: 'Excluída com sucesso' });
  } catch (err) { handleQueryError(res, err, 'Erro ao excluir OS'); }
});

module.exports = router;
