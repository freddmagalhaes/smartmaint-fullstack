const express = require('express');
const router = express.Router();
const { query, getTenantId } = require('../utils/routeHelpers');
const { handleQueryError } = require('../utils/errorHandler');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// --- INVENTORY (Estoque) ---
router.get('/inventory', async (req, res) => {
  const tenant_id = getTenantId(req);
  try {
    const rows = await query('SELECT * FROM inventory WHERE tenant_id = ?', [tenant_id]);
    res.json(rows);
  } catch (err) { handleQueryError(res, err, 'Erro ao listar estoque'); }
});

router.post('/inventory', async (req, res) => {
  const tenant_id = getTenantId(req);
  const { name, sku, quantity, min_quantity, unit_price } = req.body;
  try {
    const result = await query(
      'INSERT INTO inventory (tenant_id, name, sku, quantity, min_quantity, unit_price) VALUES (?, ?, ?, ?, ?, ?)',
      [tenant_id, name, sku, quantity, min_quantity, unit_price]
    );
    res.json({ id: result.insertId, ...req.body, tenant_id });
  } catch (err) { handleQueryError(res, err, 'Erro ao criar item no estoque'); }
});

router.put('/inventory/:id', async (req, res) => {
  const tenant_id = getTenantId(req);
  const { name, sku, quantity, min_quantity, unit_price } = req.body;
  try {
    await query(
      'UPDATE inventory SET name=COALESCE(?, name), sku=COALESCE(?, sku), quantity=COALESCE(?, quantity), min_quantity=COALESCE(?, min_quantity), unit_price=COALESCE(?, unit_price) WHERE id=? AND tenant_id=?',
      [name, sku, quantity, min_quantity, unit_price, req.params.id, tenant_id]
    );
    res.json({ message: 'Item atualizado' });
  } catch (err) { handleQueryError(res, err, 'Erro ao atualizar item do estoque'); }
});

router.delete('/inventory/:id', async (req, res) => {
  const tenant_id = getTenantId(req);
  try {
    await query('DELETE FROM inventory WHERE id = ? AND tenant_id = ?', [req.params.id, tenant_id]);
    res.json({ message: 'Excluído com sucesso' });
  } catch (err) { handleQueryError(res, err, 'Erro ao excluir item do estoque'); }
});

module.exports = router;
