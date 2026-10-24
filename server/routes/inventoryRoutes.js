const express = require('express');
const { query, assertAffected, assertUnitInTenant, buildUpdate } = require('../utils/routeHelpers');
const { pageParams, paginate, like } = require('../utils/pagination');
const { audit } = require('../utils/audit');
const { MANAGERS, requireRole, tenantScope } = require('../middleware/rbac');
const { parse, z, text, optionalText, id, nonNegative, idParam } = require('../utils/validate');

const router = express.Router();

const itemSchema = z.object({
  unit_id: id.nullish(), // vazio = estoque compartilhado entre unidades
  name: text(),
  sku: optionalText(100),
  quantity: z.coerce.number().int().min(0).default(0),
  min_quantity: z.coerce.number().int().min(0).default(5),
  unit_price: nonNegative.default(0),
});

router.use('/inventory', requireRole(...MANAGERS), tenantScope);

router.get('/inventory', async (req, res) => {
  const { page, pageSize, q } = pageParams(req);
  const f = parse(z.object({ unit_id: id.optional(), low_stock: z.enum(['true', 'false']).optional() }), req.query);
  const where = ['i.tenant_id = ?'];
  const params = [req.tenantId];
  // Itens da unidade + itens compartilhados
  if (f.unit_id) { where.push('(i.unit_id = ? OR i.unit_id IS NULL)'); params.push(f.unit_id); }
  if (f.low_stock === 'true') where.push('i.quantity <= i.min_quantity');
  if (q) { where.push('(i.name LIKE ? OR i.sku LIKE ?)'); params.push(like(q), like(q)); }
  res.json(await paginate({
    select: 'i.*, u.name AS unit_name',
    from: 'inventory i LEFT JOIN units u ON u.id = i.unit_id',
    where, params, orderBy: 'i.name, i.id', page, pageSize,
  }));
});

router.post('/inventory', async (req, res) => {
  const d = parse(itemSchema, req.body);
  if (d.unit_id) await assertUnitInTenant(d.unit_id, req.tenantId);
  const result = await query(
    'INSERT INTO inventory (tenant_id, unit_id, name, sku, quantity, min_quantity, unit_price) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [req.tenantId, d.unit_id ?? null, d.name, d.sku ?? null, d.quantity, d.min_quantity, d.unit_price]
  );
  await audit(req, { action: 'create', entity: 'inventory', entityId: result.insertId, changes: d });
  res.status(201).json({ id: result.insertId, ...d, tenant_id: req.tenantId });
});

router.put('/inventory/:id', async (req, res) => {
  const itemId = idParam(req);
  const d = parse(z.object({
    unit_id: id.nullish(),
    name: text().optional(),
    sku: optionalText(100),
    quantity: z.coerce.number().int().min(0).optional(),
    min_quantity: z.coerce.number().int().min(0).optional(),
    unit_price: nonNegative.optional(),
  }), req.body);
  if (d.unit_id) await assertUnitInTenant(d.unit_id, req.tenantId);
  const { sql, params } = buildUpdate(d, ['unit_id', 'name', 'sku', 'quantity', 'min_quantity', 'unit_price']);
  assertAffected(await query(`UPDATE inventory SET ${sql} WHERE id = ? AND tenant_id = ?`, [...params, itemId, req.tenantId]), 'Item não encontrado');
  await audit(req, { action: 'update', entity: 'inventory', entityId: itemId, changes: d });
  res.json({ message: 'Item atualizado' });
});

router.delete('/inventory/:id', async (req, res) => {
  const itemId = idParam(req);
  assertAffected(await query('DELETE FROM inventory WHERE id = ? AND tenant_id = ?', [itemId, req.tenantId]), 'Item não encontrado');
  await audit(req, { action: 'delete', entity: 'inventory', entityId: itemId });
  res.json({ message: 'Excluído com sucesso' });
});

module.exports = router;
