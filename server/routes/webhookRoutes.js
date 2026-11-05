const express = require('express');
const router = express.Router();
const { query } = require('../utils/routeHelpers');
const { stripe } = require('../utils/stripe');
const { syncSubscription, linkCheckoutSession, recordInvoicePaid } = require('../utils/subscriptions');

/**
 * Marca a fatura como paga e, se o cliente não tiver mais faturas em aberto,
 * reativa o tenant que estava inadimplente. Idempotente: o Stripe pode reenviar eventos.
 */
const processarPagamento = async (session) => {
  const invoiceId = session.metadata && session.metadata.invoice_id;
  const tenantId = session.metadata && session.metadata.tenant_id;
  if (!invoiceId || !tenantId) {
    console.warn('[Stripe] Sessão sem metadata de fatura:', session.id);
    return;
  }

  const invoices = await query('SELECT * FROM invoices WHERE id = ? AND tenant_id = ?', [invoiceId, tenantId]);
  if (invoices.length === 0) {
    console.warn(`[Stripe] Fatura ${invoiceId} do tenant ${tenantId} não encontrada (sessão ${session.id})`);
    return;
  }

  const invoice = invoices[0];
  if (invoice.status === 'Paga') return; // já processada

  // Confere o valor pago contra a fatura antes de dar baixa
  if (session.amount_total !== Math.round(Number(invoice.valor) * 100)) {
    console.error(`[Stripe] Valor divergente na fatura ${invoiceId}: pago ${session.amount_total}, esperado ${Math.round(Number(invoice.valor) * 100)}`);
    return;
  }

  await query('UPDATE invoices SET status = "Paga" WHERE id = ? AND tenant_id = ?', [invoiceId, tenantId]);

  if (session.customer) {
    await query('UPDATE tenants SET stripe_customer_id = ? WHERE id = ?', [session.customer, tenantId]);
  }

  const abertas = await query(
    'SELECT COUNT(*) AS total FROM invoices WHERE tenant_id = ? AND status IN ("Pendente", "Atrasada")',
    [tenantId]
  );
  if (abertas[0].total === 0) {
    await query('UPDATE tenants SET status = "Ativo" WHERE id = ? AND status = "Inadimplente"', [tenantId]);
  }

  console.log(`[Stripe] Fatura ${invoiceId} (tenant ${tenantId}) paga.`);
};

// Recebe o corpo cru (express.raw), necessário para validar a assinatura do Stripe.
router.post('/stripe', async (req, res) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[Stripe] STRIPE_WEBHOOK_SECRET não configurado; webhook recusado.');
    return res.status(503).json({ error: 'Webhook não configurado' });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], secret);
  } catch (err) {
    console.warn('[Stripe] Assinatura inválida:', err.message);
    return res.status(400).json({ error: 'Assinatura inválida' });
  }

  try {
    // Idempotência: o Stripe reenvia eventos; um já processado é apenas confirmado
    const [done] = await query('SELECT id FROM stripe_events WHERE id = ?', [event.id]);
    if (done) return res.json({ received: true, duplicate: true });

    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object;
        if (session.mode === 'subscription') {
          await linkCheckoutSession(session);
        } else if (session.payment_status === 'paid') {
          // Boleto avulso: "completed" chega com payment_status "unpaid"; a baixa vem no evento async_payment_succeeded
          await processarPagamento(session);
        }
        break;
      }
      case 'checkout.session.async_payment_failed':
        console.warn('[Stripe] Pagamento assíncrono falhou:', event.data.object.id);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const result = await syncSubscription(event.data.object, event.created);
        console.log(`[Stripe] ${event.type} ${event.data.object.id}: ${result}`);
        break;
      }
      case 'invoice.paid':
      case 'invoice.payment_succeeded':
        console.log(`[Stripe] ${event.type} ${event.data.object.id}: ${await recordInvoicePaid(event.data.object)}`);
        break;
      case 'invoice.payment_failed':
        // O status da assinatura (past_due/unpaid) chega no evento da própria assinatura
        console.warn('[Stripe] Cobrança falhou:', event.data.object.id, 'tenant/customer:', event.data.object.customer);
        break;
      default:
        break;
    }
    await query('INSERT IGNORE INTO stripe_events (id, type) VALUES (?, ?)', [event.id, event.type]);
    res.json({ received: true });
  } catch (err) {
    console.error('[Stripe] Erro ao processar evento', event.id, err);
    // 500 faz o Stripe tentar novamente
    res.status(500).json({ error: 'Falha ao processar evento' });
  }
});

module.exports = router;
