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

module.exports = { query, getTenantId, isBackoffice };
