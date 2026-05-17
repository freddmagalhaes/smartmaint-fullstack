const Stripe = require('stripe');

// Inicializa o Stripe com a chave secreta. Se não existir, avisa.
const stripeKey = process.env.STRIPE_SECRET_KEY || 'sk_test_mock';
const stripe = Stripe(stripeKey);

/**
 * Gera um link de Checkout no Stripe para pagar a fatura
 */
const createCheckoutSession = async (tenant, invoice) => {
  try {
    if (stripeKey === 'sk_test_mock') {
      console.warn('⚠️ STRIPE_SECRET_KEY não configurada. Simulando link de pagamento.');
      return 'https://checkout.stripe.com/pay/cs_test_mock12345';
    }

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
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/settings?success=true`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/settings?canceled=true`,
      customer_email: tenant.contact_email,
      metadata: {
        tenant_id: tenant.id,
        invoice_id: invoice.id
      }
    });

    return session.url;
  } catch (error) {
    console.error('Erro ao criar sessão Stripe:', error);
    throw error;
  }
};

module.exports = { createCheckoutSession, stripe };
