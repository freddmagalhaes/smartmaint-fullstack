const express = require('express');
const { query, assertAffected, buildUpdate } = require('../utils/routeHelpers');
const { MANAGERS, requireRole, tenantScope } = require('../middleware/rbac');
const { parse, z, text, optionalText, nonNegative, idParam } = require('../utils/validate');

const router = express.Router();

const itemSchema = z.object({
  name: text(),
  sku: optionalText(100),
  quantity: z.coerce.number().int().min(0).default(0),
  min_quantity: z.coerce.number().int().min(0).default(5),
  unit_price: nonNegative.default(0),
});

router.use('/inventory', requireRole(...MANAGERS), tenantScope);

router.get('/inventory', async (req, res) => {
  res.json(await query('SELECT * FROM inventory WHERE tenant_id = ? ORDER BY name', [req.tenantId]));
});

router.post('/inventory', async (req, res) => {
  const d = parse(itemSchema, req.body);
  const result = await query(
    'INSERT INTO inventory (tenant_id, name, sku, quantity, min_quantity, unit_price) VALUES (?, ?, ?, ?, ?, ?)',
    [req.tenantId, d.name, d.sku ?? null, d.quantity, d.min_quantity, d.unit_price]
  );
  res.status(201).json({ id: result.insertId, ...d, tenant_id: req.tenantId });
});

router.put('/inventory/:id', async (req, res) => {
  const itemId = idParam(req);
  const d = parse(z.object({
    name: text().optional(),
    sku: optionalText(100),
    quantity: z.coerce.number().int().min(0).optional(),
    min_quantity: z.coerce.number().int().min(0).optional(),
    unit_price: nonNegative.optional(),
  }), req.body);
  const { sql, params } = buildUpdate(d, ['name', 'sku', 'quantity', 'min_quantity', 'unit_price']);
  assertAffected(await query(`UPDATE inventory SET ${sql} WHERE id = ? AND tenant_id = ?`, [...params, itemId, req.tenantId]), 'Item não encontrado');
  res.json({ message: 'Item atualizado' });
});

router.delete('/inventory/:id', async (req, res) => {
  assertAffected(await query('DELETE FROM inventory WHERE id = ? AND tenant_id = ?', [idParam(req), req.tenantId]), 'Item não encontrado');
  res.json({ message: 'Excluído com sucesso' });
});

module.exports = router;
