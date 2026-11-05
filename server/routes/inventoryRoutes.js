const express = require('express');
const db = require('../db');
const { query, assertAffected, assertUnitInTenant, buildUpdate } = require('../utils/routeHelpers');
const { pageParams, paginate, like } = require('../utils/pagination');
const { audit } = require('../utils/audit');
const { moveStock, crossedMinimum } = require('../utils/stock');
const notifications = require('../utils/notifications');
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

// Lista enxuta para escolher peças em uma O.S. (somente itens com saldo)
router.get('/inventory/options', async (req, res) => {
  const { unit_id: unitId } = parse(z.object({ unit_id: id.optional() }), req.query);
  const where = ['tenant_id = ?', 'quantity > 0'];
  const params = [req.tenantId];
  if (unitId) { where.push('(unit_id = ? OR unit_id IS NULL)'); params.push(unitId); }
  res.json(await query(`SELECT id, name, sku, quantity, unit_price, unit_id FROM inventory WHERE ${where.join(' AND ')} ORDER BY name LIMIT 2000`, params));
});

router.post('/inventory', async (req, res) => {
  const d = parse(itemSchema, req.body);
  if (d.unit_id) await assertUnitInTenant(d.unit_id, req.tenantId);
  const itemId = await db.transaction(async (q) => {
    const result = await q(
      'INSERT INTO inventory (tenant_id, unit_id, name, sku, quantity, min_quantity, unit_price) VALUES (?, ?, ?, ?, 0, ?, ?)',
      [req.tenantId, d.unit_id ?? null, d.name, d.sku ?? null, d.min_quantity, d.unit_price]
    );
    // Saldo inicial entra como movimentação, para o histórico começar correto
    if (d.quantity > 0) {
      await moveStock(q, { tenantId: req.tenantId, inventoryId: result.insertId, delta: d.quantity, type: 'entrada', user: req.user, note: 'Saldo inicial' });
    }
    return result.insertId;
  });
  await audit(req, { action: 'create', entity: 'inventory', entityId: itemId, changes: d });
  res.status(201).json({ id: itemId, ...d, tenant_id: req.tenantId });
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

  const stock = await db.transaction(async (q) => {
    const [current] = await q('SELECT quantity FROM inventory WHERE id = ? AND tenant_id = ? FOR UPDATE', [itemId, req.tenantId]);
    if (!current) assertAffected({ affectedRows: 0 }, 'Item não encontrado');
    const fields = ['unit_id', 'name', 'sku', 'min_quantity', 'unit_price'].filter((c) => d[c] !== undefined);
    if (fields.length) {
      const { sql, params } = buildUpdate(d, fields);
      await q(`UPDATE inventory SET ${sql} WHERE id = ? AND tenant_id = ?`, [...params, itemId, req.tenantId]);
    }
    // Alterar a quantidade pelo cadastro vira um ajuste de inventário registrado no histórico
    if (d.quantity !== undefined && d.quantity !== Number(current.quantity)) {
      return moveStock(q, { tenantId: req.tenantId, inventoryId: itemId, delta: d.quantity - Number(current.quantity), type: 'ajuste', user: req.user, note: 'Ajuste pelo cadastro' });
    }
    if (!fields.length && d.quantity === undefined) assertAffected({ affectedRows: 0 }, 'Nenhum campo para atualizar');
    return null;
  });
  if (stock && crossedMinimum(stock)) notifications.lowStock(req.tenantId, stock.item);
  await audit(req, { action: 'update', entity: 'inventory', entityId: itemId, changes: d });
  res.json({ message: 'Item atualizado' });
});

router.delete('/inventory/:id', async (req, res) => {
  const itemId = idParam(req);
  assertAffected(await query('DELETE FROM inventory WHERE id = ? AND tenant_id = ?', [itemId, req.tenantId]), 'Item não encontrado');
  await audit(req, { action: 'delete', entity: 'inventory', entityId: itemId });
  res.json({ message: 'Excluído com sucesso' });
});

// --- MOVIMENTAÇÕES ---
router.get('/inventory/:id/movements', async (req, res) => {
  const itemId = idParam(req);
  const { page, pageSize } = pageParams(req);
  res.json(await paginate({
    select: 'm.*, w.titulo AS work_order_title',
    from: 'inventory_movements m LEFT JOIN work_orders w ON w.id = m.work_order_id',
    where: ['m.tenant_id = ?', 'm.inventory_id = ?'],
    params: [req.tenantId, itemId],
    orderBy: 'm.id DESC', page, pageSize,
  }));
});

// Entrada (compra/recebimento) ou ajuste após contagem física (informa o saldo contado)
router.post('/inventory/:id/movements', async (req, res) => {
  const itemId = idParam(req);
  const d = parse(z.discriminatedUnion('type', [
    z.object({ type: z.literal('entrada'), quantity: z.coerce.number().int().positive().max(1000000), note: optionalText(500) }),
    z.object({ type: z.literal('ajuste'), counted: z.coerce.number().int().min(0).max(1000000), note: optionalText(500) }),
  ]), req.body);

  const stock = await db.transaction(async (q) => {
    if (d.type === 'entrada') {
      return moveStock(q, { tenantId: req.tenantId, inventoryId: itemId, delta: d.quantity, type: 'entrada', user: req.user, note: d.note });
    }
    const [current] = await q('SELECT quantity FROM inventory WHERE id = ? AND tenant_id = ?', [itemId, req.tenantId]);
    if (!current) assertAffected({ affectedRows: 0 }, 'Item não encontrado');
    return moveStock(q, { tenantId: req.tenantId, inventoryId: itemId, delta: d.counted - Number(current.quantity), type: 'ajuste', user: req.user, note: d.note || 'Contagem de estoque' });
  });
  if (crossedMinimum(stock)) notifications.lowStock(req.tenantId, stock.item);
  await audit(req, { action: `stock:${d.type}`, entity: 'inventory', entityId: itemId, changes: d });
  res.status(201).json({ quantity: stock.after });
});

module.exports = router;
