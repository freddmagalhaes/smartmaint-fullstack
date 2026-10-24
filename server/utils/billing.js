const db = require('../db');
const { config } = require('../config');

/**
 * Marca a fatura como paga e, se o cliente estava bloqueado por inadimplência e não
 * restaram faturas atrasadas, reativa o acesso.
 */
const markInvoicePaid = async (invoiceId, sessionId) => db.transaction(async (q) => {
  const [invoice] = await q('SELECT id, tenant_id, status FROM invoices WHERE id = ? FOR UPDATE', [invoiceId]);
  if (!invoice || invoice.status === 'Paga') return false;
  await q("UPDATE invoices SET status = 'Paga', paid_at = NOW(), stripe_session_id = COALESCE(?, stripe_session_id) WHERE id = ?", [sessionId || null, invoiceId]);
  const [{ overdue }] = await q("SELECT COUNT(*) AS overdue FROM invoices WHERE tenant_id = ? AND status = 'Atrasada'", [invoice.tenant_id]);
  if (overdue === 0) {
    await q("UPDATE tenants SET status = 'Ativo' WHERE id = ? AND status = 'Inadimplente'", [invoice.tenant_id]);
  }
  return true;
});

/**
 * Rotina diária de cobrança: faturas vencidas viram "Atrasada" e clientes com atraso
 * acima da carência (BILLING_GRACE_DAYS) são bloqueados como "Inadimplente".
 * As atualizações são idempotentes, então rodar em várias instâncias não causa problema.
 */
const runBillingCycle = async () => {
  const [late] = await db.query("UPDATE invoices SET status = 'Atrasada' WHERE status = 'Pendente' AND vencimento < CURRENT_DATE");
  const [blocked] = await db.query(
    `UPDATE tenants t SET t.status = 'Inadimplente'
     WHERE t.status = 'Ativo' AND EXISTS (
       SELECT 1 FROM invoices i WHERE i.tenant_id = t.id AND i.status = 'Atrasada'
         AND i.vencimento < DATE_SUB(CURRENT_DATE, INTERVAL ? DAY)
     )`,
    [config.billing.graceDays]
  );
  return { invoicesLate: late.affectedRows, tenantsBlocked: blocked.affectedRows };
};

const startBillingScheduler = () => {
  if (!config.billing.autoBlock) return null;
  const run = () => runBillingCycle()
    .then((r) => { if (r.invoicesLate || r.tenantsBlocked) console.log('[cobrança]', r); })
    .catch((err) => console.error('[cobrança] falha na rotina:', err.message));
  run();
  const timer = setInterval(run, 60 * 60 * 1000);
  timer.unref();
  return timer;
};

module.exports = { markInvoicePaid, runBillingCycle, startBillingScheduler };
