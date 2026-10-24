const db = require('../db');
const { config } = require('../config');
const logger = require('./logger');

/**
 * Apaga contas criadas pelo cadastro que nunca assinaram (nem confirmaram o e-mail) depois de
 * SIGNUP_PENDING_RETENTION_DAYS dias (minimização de dados, LGPD). Os dados ligados ao cliente
 * são apagados em cascata.
 */
const purgeAbandonedSignups = async () => {
  const [result] = await db.query(
    `DELETE FROM tenants WHERE status = 'Pendente' AND signup_source = 'self'
       AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
       AND stripe_subscription_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.tenant_id = tenants.id AND i.status = 'Paga')`,
    [config.signup.pendingRetentionDays]
  );
  if (result.affectedRows) logger.info({ removed: result.affectedRows }, 'cadastros abandonados removidos');
  return result.affectedRows;
};

module.exports = { purgeAbandonedSignups };
