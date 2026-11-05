-- Assinatura recorrente (Stripe Subscriptions).
-- Aplique em bancos já existentes:  mysql -u root -p smartmaint_db < migrations/003_subscriptions.sql
ALTER TABLE tenants
  ADD COLUMN stripe_subscription_id VARCHAR(100) NULL,
  ADD COLUMN subscription_status VARCHAR(30) NULL,
  ADD COLUMN billing_cycle ENUM('mensal', 'anual') NULL,
  ADD COLUMN current_period_end DATETIME NULL,
  ADD COLUMN cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN subscription_event_at BIGINT NULL;

ALTER TABLE invoices ADD COLUMN stripe_invoice_id VARCHAR(100) NULL UNIQUE;

CREATE TABLE IF NOT EXISTS stripe_events (
  id VARCHAR(100) PRIMARY KEY,
  type VARCHAR(100) NOT NULL,
  processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
