const crypto = require('crypto');
const db = require('../db');

const query = async (sql, params) => {
  const [rows] = await db.query(sql, params);
  return rows;
};

const getTenantId = (req) => {
  if (req.user.is_master || req.user.role === 'Suporte') {
    return req.query.tenant_id || req.body.tenant_id;
  }
  return req.user.tenant_id;
};

const isBackoffice = (req) => req.user.is_master || req.user.role === 'Suporte';

// Confirma que o equipamento informado pertence ao tenant (evita vincular registros a dados de outro cliente)
const equipmentBelongsToTenant = async (equipmentId, tenantId) => {
  if (!equipmentId || !tenantId) return false;
  const rows = await query('SELECT id FROM equipments WHERE id = ? AND tenant_id = ?', [equipmentId, tenantId]);
  return rows.length > 0;
};

// Senha provisória aleatória (substitui a senha fixa "123456")
const generateTempPassword = () => crypto.randomBytes(9).toString('base64url');

module.exports = { query, getTenantId, isBackoffice, equipmentBelongsToTenant, generateTempPassword };
