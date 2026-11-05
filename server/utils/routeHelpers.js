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

/** Garante que a unidade pertence ao tenant. */
const assertUnitInTenant = async (unitId, tenantId) => {
  const rows = await query('SELECT id FROM units WHERE id = ? AND tenant_id = ?', [unitId, tenantId]);
  if (rows.length === 0) throw new HttpError(400, 'Unidade não encontrada para este cliente');
};

/** Primeira unidade do tenant (usada quando o cliente tem uma só e o formulário não envia unit_id). */
const defaultUnitId = async (tenantId) => {
  const [row] = await query('SELECT id FROM units WHERE tenant_id = ? ORDER BY id LIMIT 1', [tenantId]);
  if (!row) throw new HttpError(400, 'Cadastre uma unidade antes de adicionar equipamentos');
  return row.id;
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

module.exports = { query, assertEquipmentInTenant, assertUnitInTenant, defaultUnitId, assertAffected, buildUpdate };
