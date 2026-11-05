const { HttpError } = require('./errorHandler');

/**
 * Movimenta o estoque de um item dentro de uma transação (`q` de db.transaction).
 * Trava a linha do item (FOR UPDATE) para que duas baixas simultâneas não deixem o saldo errado.
 *
 * @param {Function} q executor da transação
 * @param {{ tenantId, inventoryId, delta, type, workOrderId?, user?, note? }} movement
 *   delta positivo = entrada, negativo = saída
 * @returns {{ item, before, after }} item já com a quantidade atualizada
 */
const moveStock = async (q, { tenantId, inventoryId, delta, type, workOrderId = null, user = null, note = null }) => {
  const [item] = await q('SELECT * FROM inventory WHERE id = ? AND tenant_id = ? FOR UPDATE', [inventoryId, tenantId]);
  if (!item) throw new HttpError(404, 'Item de estoque não encontrado');
  const before = Number(item.quantity);
  const after = before + delta;
  if (after < 0) {
    throw new HttpError(409, `Estoque insuficiente de "${item.name}": disponível ${before}, solicitado ${-delta}`, 'INSUFFICIENT_STOCK');
  }
  await q('UPDATE inventory SET quantity = ? WHERE id = ?', [after, item.id]);
  await q(
    `INSERT INTO inventory_movements (tenant_id, inventory_id, type, quantity, balance_after, work_order_id, user_id, user_name, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [tenantId, item.id, type, delta, after, workOrderId, user?.id || null, user?.name || null, note]
  );
  return { item: { ...item, quantity: after }, before, after };
};

/** O item ficou abaixo do mínimo agora (para avisar uma vez, ao cruzar o limite). */
const crossedMinimum = ({ item, before, after }) => after <= Number(item.min_quantity) && before > Number(item.min_quantity);

module.exports = { moveStock, crossedMinimum };
