const Stripe = require('stripe');
const { config } = require('../config');

const stripe = config.stripe.secretKey ? Stripe(config.stripe.secretKey) : null;

/** Cria uma sessão de Checkout do Stripe para a fatura e devolve a URL de pagamento. */
const createCheckoutSession = async (tenant, invoice) => {
  const session = await stripe.checkout.sessions.create({
    payment_method_types: config.stripe.paymentMethods,
    line_items: [
      {
        price_data: {
          currency: 'brl',
          product_data: {
            name: `Fatura ${invoice.mes_ref} - SmartMaint`,
            description: `Pagamento do plano ${tenant.plan_type || 'Pro'}`,
          },
          unit_amount: Math.round(Number(invoice.valor) * 100), // Stripe usa centavos
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${config.frontendUrl}/settings?tab=billing&success=true`,
    cancel_url: `${config.frontendUrl}/settings?tab=billing&canceled=true`,
    customer_email: tenant.contact_email || undefined,
    client_reference_id: String(invoice.id),
    metadata: { tenant_id: tenant.id, invoice_id: String(invoice.id) },
  });
  return session;
};

/** Valida a assinatura do webhook e devolve o evento (lança erro se inválida). */
const constructWebhookEvent = (rawBody, signature) =>
  stripe.webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);

module.exports = { stripe, createCheckoutSession, constructWebhookEvent };
