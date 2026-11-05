-- Cadastro autoatendido com período de teste (trial).
-- Aplique em bancos já existentes (instalações novas já recebem isso via database.sql):
--   mysql -u root -p smartmaint_db < migrations/001_trial_signup.sql
ALTER TABLE tenants ADD COLUMN trial_ends_at DATETIME NULL;
ALTER TABLE users ADD COLUMN terms_accepted_at DATETIME NULL;
