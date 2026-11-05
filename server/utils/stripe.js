const Stripe = require('stripe');

const isProduction = process.env.NODE_ENV === 'production';

// Em desenvolvimento, sem chave configurada, o checkout é simulado.
// Em produção, a ausência da chave é um erro (nunca simular pagamento).
const stripeKey = process.env.STRIPE_SECRET_KEY || '';
const useMock = !stripeKey || stripeKey === 'sk_test_mock';

if (useMock && isProduction) {
  console.error('⚠️ STRIPE_SECRET_KEY não configurada: pagamentos indisponíveis em produção.');
}

const stripe = Stripe(useMock ? 'sk_test_mock' : stripeKey);

/**
 * Gera um link de Checkout no Stripe para pagar a fatura
 */
const createCheckoutSession = async (tenant, invoice) => {
  if (useMock) {
    if (isProduction) {
      const err = new Error('Pagamentos não configurados');
      err.statusCode = 503;
      throw err;
    }
    console.warn('⚠️ STRIPE_SECRET_KEY não configurada. Simulando link de pagamento.');
    return 'https://checkout.stripe.com/pay/cs_test_mock12345';
  }

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'boleto'],
      line_items: [
        {
          price_data: {
            currency: 'brl',
            product_data: {
              name: `Fatura ${invoice.mes_ref} - SmartMaint`,
              description: `Pagamento de plano ${tenant.plan_type}`,
            },
            unit_amount: Math.round(invoice.valor * 100), // Stripe usa centavos
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${frontendUrl}/settings?success=true`,
      cancel_url: `${frontendUrl}/settings?canceled=true`,
      customer_email: tenant.contact_email,
      // client_reference_id e metadata permitem ao webhook identificar a fatura
      client_reference_id: String(invoice.id),
      metadata: {
        tenant_id: tenant.id,
        invoice_id: String(invoice.id)
      }
    });

    return session.url;
  } catch (error) {
    console.error('Erro ao criar sessão Stripe:', error);
    throw error;
  }
};

const frontendUrl = () => process.env.FRONTEND_URL || 'http://localhost:5173';

const requireStripeConfigured = () => {
  if (useMock && isProduction) {
    const err = new Error('Pagamentos não configurados');
    err.statusCode = 503;
    throw err;
  }
};

/**
 * Checkout de ASSINATURA recorrente. O valor vem sempre do servidor (priceCents), nunca do cliente.
 * `trialEnd` (segundos Unix) preserva os dias de teste que ainda restam: a primeira cobrança só ocorre depois.
 */
const createSubscriptionCheckout = async ({ tenant, plan, cycle, priceCents, trialEnd }) => {
  requireStripeConfigured();
  if (useMock) {
    console.warn('⚠️ STRIPE_SECRET_KEY não configurada. Simulando checkout de assinatura.');
    return { url: 'https://checkout.stripe.com/pay/cs_test_mock_subscription' };
  }
  const metadata = { tenant_id: tenant.id, plan, cycle };
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'brl',
        unit_amount: priceCents,
        recurring: { interval: cycle === 'anual' ? 'year' : 'month' },
        product_data: { name: `SmartMaint ${plan} (${cycle})` },
      },
    }],
    // customer e customer_email são excludentes: reaproveita o cliente do Stripe quando já existe
    ...(tenant.stripe_customer_id ? { customer: tenant.stripe_customer_id } : tenant.contact_email ? { customer_email: tenant.contact_email } : {}),
    client_reference_id: tenant.id,
    metadata,
    subscription_data: { metadata, ...(trialEnd ? { trial_end: trialEnd } : {}) },
    allow_promotion_codes: true, // cupons criados no painel do Stripe (ex.: oferta de lançamento)
    success_url: `${frontendUrl()}/settings?billing=success`,
    cancel_url: `${frontendUrl()}/settings?billing=canceled`,
  });
  return { url: session.url };
};

/** Portal do cliente no Stripe: trocar cartão, ver faturas e cancelar. */
const createPortalSession = async (customerId) => {
  requireStripeConfigured();
  if (useMock) return { url: 'https://billing.stripe.com/p/session/test_mock' };
  const session = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: `${frontendUrl()}/settings` });
  return { url: session.url };
};

module.exports = { createCheckoutSession, createSubscriptionCheckout, createPortalSession, stripe };
