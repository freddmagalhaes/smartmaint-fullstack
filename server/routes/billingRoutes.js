const express = require('express');
const { query, assertAffected } = require('../utils/routeHelpers');
const { HttpError } = require('../utils/errorHandler');
const { stripe, createCheckoutSession, constructWebhookEvent } = require('../utils/stripe');
const { markInvoicePaid } = require('../utils/billing');
const { ROLES, requireRole, requireBackoffice, tenantScope } = require('../middleware/rbac');
const { parse, z, id, date, text, idParam } = require('../utils/validate');
const { config } = require('../config');
const { audit } = require('../utils/audit');

const router = express.Router();

const INVOICE_STATUSES = ['Paga', 'Pendente', 'Atrasada'];

// --- BACKOFFICE: FATURAS ---
router.get('/admin/invoices', requireBackoffice, async (req, res) => {
  const { tenant_id } = req.query;
  let sql = 'SELECT i.*, t.name AS tenant_name FROM invoices i JOIN tenants t ON i.tenant_id = t.id';
  const params = [];
  if (tenant_id) {
    sql += ' WHERE i.tenant_id = ?';
    params.push(String(tenant_id));
  }
  res.json(await query(`${sql} ORDER BY i.vencimento DESC`, params));
});

router.post('/admin/invoices', requireBackoffice, async (req, res) => {
  const d = parse(z.object({
    tenant_id: z.string().min(1).max(50),
    valor: z.coerce.number().positive(),
    vencimento: date,
    status: z.enum(INVOICE_STATUSES).default('Pendente'),
    mes_ref: text(20),
  }), req.body);
  const result = await query(
    'INSERT INTO invoices (tenant_id, valor, vencimento, status, mes_ref, paid_at) VALUES (?, ?, ?, ?, ?, ?)',
    [d.tenant_id, d.valor, d.vencimento, d.status, d.mes_ref, d.status === 'Paga' ? new Date() : null]
  );
  await audit(req, { action: 'create', entity: 'invoice', entityId: result.insertId, changes: d, tenantId: d.tenant_id });
  res.status(201).json({ id: result.insertId, ...d });
});

router.put('/admin/invoices/:id/status', requireBackoffice, async (req, res) => {
  const invoiceId = idParam(req);
  const { status } = parse(z.object({ status: z.enum(INVOICE_STATUSES) }), req.body);
  if (status === 'Paga') {
    // Mesma regra do webhook: baixa a fatura e reativa o cliente se não houver outras em atraso
    const [exists] = await query('SELECT id FROM invoices WHERE id = ?', [invoiceId]);
    if (!exists) throw new HttpError(404, 'Fatura não encontrada');
    await markInvoicePaid(invoiceId, null);
  } else {
    assertAffected(await query('UPDATE invoices SET status = ?, paid_at = NULL WHERE id = ?', [status, invoiceId]), 'Fatura não encontrada');
  }
  await audit(req, { action: `status:${status}`, entity: 'invoice', entityId: invoiceId });
  res.json({ message: 'Fatura atualizada' });
});

// --- CLIENTE: FATURAS E PAGAMENTO ---
router.get('/billing/invoices', requireRole(ROLES.ADMIN), tenantScope, async (req, res) => {
  res.json(await query('SELECT id, valor, vencimento, status, mes_ref, paid_at FROM invoices WHERE tenant_id = ? ORDER BY vencimento DESC', [req.tenantId]));
});

router.post('/billing/checkout', requireRole(ROLES.ADMIN), tenantScope, async (req, res) => {
  if (!stripe) throw new HttpError(503, 'Pagamento online indisponível no momento. Entre em contato com o suporte.');
  const { invoice_id: invoiceId } = parse(z.object({ invoice_id: id.optional() }), req.body);

  const [tenant] = await query('SELECT * FROM tenants WHERE id = ?', [req.tenantId]);
  const invoices = invoiceId
    ? await query("SELECT * FROM invoices WHERE id = ? AND tenant_id = ? AND status <> 'Paga'", [invoiceId, req.tenantId])
    : await query("SELECT * FROM invoices WHERE tenant_id = ? AND status <> 'Paga' ORDER BY vencimento ASC LIMIT 1", [req.tenantId]);
  if (invoices.length === 0) throw new HttpError(400, 'Nenhuma fatura pendente encontrada.');

  const session = await createCheckoutSession(tenant, invoices[0]);
  await query('UPDATE invoices SET stripe_session_id = ? WHERE id = ?', [session.id, invoices[0].id]);
  res.json({ url: session.url });
});

// --- WEBHOOK DO STRIPE (público, autenticado pela assinatura; precisa do corpo bruto) ---
const webhookRouter = express.Router();

webhookRouter.post('/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !config.stripe.webhookSecret) return res.status(503).json({ error: 'Webhook não configurado' });

  let event;
  try {
    event = constructWebhookEvent(req.body, req.headers['stripe-signature']);
  } catch (err) {
    return res.status(400).json({ error: `Assinatura inválida: ${err.message}` });
  }

  const session = event.data.object;
  const paid = (event.type === 'checkout.session.completed' && session.payment_status === 'paid')
    || event.type === 'checkout.session.async_payment_succeeded'; // boleto compensado
  if (paid) {
    const invoiceId = Number(session.metadata?.invoice_id || session.client_reference_id);
    if (invoiceId) await markInvoicePaid(invoiceId, session.id);
  }
  res.json({ received: true });
});

module.exports = { router, webhookRouter };
