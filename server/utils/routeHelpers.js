const db = require('../db');
const { HttpError } = require('./errorHandler');

const query = async (sql, params) => {
  const [rows] = await db.query(sql, params);
  return rows;
};

/** Garante que o equipamento pertence ao tenant antes de vincular registros a ele. */
const assertEquipmentInTenant = async (equipmentId, tenantId) => {
  const rows = await query('SELECT id FROM equipments WHERE id = ? AND tenant_id = ?', [equipmentId, tenantId]);
  if (rows.length === 0) throw new HttpError(400, 'Equipamento não encontrado para este cliente');
};

/** Lança 404 quando um UPDATE/DELETE não encontrou o registro no tenant. */
const assertAffected = (result, message = 'Registro não encontrado') => {
  if (result.affectedRows === 0) throw new HttpError(404, message);
};

/** Monta "col1 = ?, col2 = ?" apenas com os campos presentes, para atualizações parciais. */
const buildUpdate = (data, columns) => {
  const keys = columns.filter((c) => data[c] !== undefined);
  if (keys.length === 0) throw new HttpError(400, 'Nenhum campo para atualizar');
  return { sql: keys.map((k) => `\`${k}\` = ?`).join(', '), params: keys.map((k) => data[k]) };
};

module.exports = { query, assertEquipmentInTenant, assertAffected, buildUpdate };
