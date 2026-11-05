// Bloco 3: assinatura mensal (cartão recorrente e Pix Automático pelo Stripe; boleto e Pix com
// fatura gerada todo mês pelo SmartMaint) e teste grátis.
module.exports = {
  id: '006_assinaturas',
  up: async (q, h) => {
    // card | pix_automatico (cobrança automática pelo Stripe) | boleto | pix (fatura mensal)
    await h.addColumn('tenants', 'billing_method', 'VARCHAR(20) NULL');
    await h.addColumn('tenants', 'billing_day', 'TINYINT NULL');
    await h.addColumn('tenants', 'stripe_subscription_id', 'VARCHAR(100) NULL');
    await h.addColumn('tenants', 'subscription_status', 'VARCHAR(30) NULL');
    await h.addColumn('tenants', 'trial_ends_at', 'DATETIME NULL');
    await h.addColumn('tenants', 'current_period_end', 'DATETIME NULL');
    await h.addColumn('tenants', 'cancel_at_period_end', 'BOOLEAN NOT NULL DEFAULT FALSE');
    // Um único teste grátis por cliente
    await h.addColumn('tenants', 'trial_used', 'BOOLEAN NOT NULL DEFAULT FALSE');
    await h.addIndex('tenants', 'idx_tenants_stripe_customer', '(stripe_customer_id)');

    await h.addColumn('plans', 'stripe_product_id', 'VARCHAR(100) NULL');

    await h.addColumn('invoices', 'stripe_invoice_id', 'VARCHAR(100) NULL');
    // Mês de referência (AAAA-MM) das faturas geradas automaticamente: evita fatura duplicada no mês
    await h.addColumn('invoices', 'period', 'CHAR(7) NULL');
    await h.addColumn('invoices', 'payment_method', 'VARCHAR(20) NULL');
    await h.addColumn('invoices', 'payment_url', 'VARCHAR(1000) NULL');
    const unique = async (name, columns) => {
      const rows = await q(
        'SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?',
        ['invoices', name]
      );
      if (rows.length === 0) await q(`ALTER TABLE invoices ADD UNIQUE KEY \`${name}\` ${columns}`);
    };
    await unique('uq_invoices_stripe', '(stripe_invoice_id)');
    await unique('uq_invoices_period', '(tenant_id, period)');

    // Eventos do Stripe já processados (o Stripe pode reenviar o mesmo evento)
    await q(`CREATE TABLE IF NOT EXISTS stripe_events (
      id VARCHAR(100) PRIMARY KEY,
      type VARCHAR(100) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
  },
};
