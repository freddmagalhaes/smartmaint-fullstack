const db = require('../db');
const { config } = require('../config');
const logger = require('./logger');
const { enqueueForInvoice } = require('./nfse');
const notifications = require('./notifications');

/**
 * Marca a fatura como paga e, se o cliente estava bloqueado por inadimplência (ou em teste) e
 * não restaram faturas atrasadas, deixa o cliente ativo.
 */
const markInvoicePaid = async (invoiceId, sessionId) => db.transaction(async (q) => {
  const [invoice] = await q('SELECT id, tenant_id, status, valor FROM invoices WHERE id = ? FOR UPDATE', [invoiceId]);
  if (!invoice || invoice.status === 'Paga') return false;
  await q("UPDATE invoices SET status = 'Paga', paid_at = NOW(), stripe_session_id = COALESCE(?, stripe_session_id) WHERE id = ?", [sessionId || null, invoiceId]);
  // Toda fatura paga gera uma NFS-e pendente; a emissão ocorre quando a integração fiscal estiver ativa
  await enqueueForInvoice(q, invoice);
  const [{ overdue }] = await q("SELECT COUNT(*) AS overdue FROM invoices WHERE tenant_id = ? AND status = 'Atrasada'", [invoice.tenant_id]);
  if (overdue === 0) {
    await q("UPDATE tenants SET status = 'Ativo' WHERE id = ? AND status IN ('Inadimplente', 'Trial', 'Pendente')", [invoice.tenant_id]);
  }
  return true;
});

/**
 * Rotina diária de cobrança: faturas vencidas viram "Atrasada" e clientes com atraso
 * acima da carência (BILLING_GRACE_DAYS) são bloqueados como "Inadimplente".
 * As atualizações são idempotentes, então rodar em várias instâncias não causa problema.
 */
const REMINDER_DAYS = 5;

const runBillingCycle = async () => {
  // Boleto e Pix: fatura do mês gerada antes do vencimento (require aqui evita dependência circular)
  const invoicesCreated = await require('./subscriptions').generateManualInvoices();
  const signupsRemoved = await require('./signup').purgeAbandonedSignups();
  // Lembrete antes do vencimento e aviso de atraso (uma vez por fatura, ver notifications_sent)
  const [dueSoon] = await db.query(
    "SELECT * FROM invoices WHERE status = 'Pendente' AND vencimento BETWEEN CURRENT_DATE AND DATE_ADD(CURRENT_DATE, INTERVAL ? DAY)",
    [REMINDER_DAYS]
  );
  const [becomingLate] = await db.query("SELECT * FROM invoices WHERE status = 'Pendente' AND vencimento < CURRENT_DATE");

  const [late] = await db.query("UPDATE invoices SET status = 'Atrasada' WHERE status = 'Pendente' AND vencimento < CURRENT_DATE");
  for (const invoice of dueSoon) await notifications.invoiceReminder(invoice.tenant_id, invoice, 'due');
  for (const invoice of becomingLate) await notifications.invoiceReminder(invoice.tenant_id, invoice, 'late');
  const [blocked] = await db.query(
    `UPDATE tenants t SET t.status = 'Inadimplente'
     WHERE t.status = 'Ativo' AND EXISTS (
       SELECT 1 FROM invoices i WHERE i.tenant_id = t.id AND i.status = 'Atrasada'
         AND i.vencimento < DATE_SUB(CURRENT_DATE, INTERVAL ? DAY)
     )`,
    [config.billing.graceDays]
  );
  return { invoicesCreated, signupsRemoved, invoicesLate: late.affectedRows, tenantsBlocked: blocked.affectedRows };
};

const startBillingScheduler = () => {
  if (!config.billing.autoBlock) return null;
  const run = () => runBillingCycle()
    .then((r) => { if (r.invoicesCreated || r.invoicesLate || r.tenantsBlocked) logger.info(r, 'rotina de cobrança'); })
    .catch((err) => logger.error({ err }, 'falha na rotina de cobrança'));
  run();
  const timer = setInterval(run, 60 * 60 * 1000);
  timer.unref();
  return timer;
};

module.exports = { markInvoicePaid, runBillingCycle, startBillingScheduler };
