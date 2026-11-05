-- Limites por plano (Essencial/Profissional/Industrial/Corporativo) e excedentes contratados.
-- Aplique em bancos já existentes:  mysql -u root -p smartmaint_db < migrations/002_plan_limits.sql
ALTER TABLE tenants ADD COLUMN extra_assets INT NOT NULL DEFAULT 0;
ALTER TABLE tenants ADD COLUMN extra_users INT NOT NULL DEFAULT 0;
ALTER TABLE tenants ALTER COLUMN plan_type SET DEFAULT 'Profissional';

-- Nomes antigos -> nomes atuais. Revise antes de aplicar: clientes com plano desconhecido
-- passam a ter os limites do Essencial (o mais restritivo).
UPDATE tenants SET plan_type = 'Essencial'    WHERE plan_type = 'Starter';
UPDATE tenants SET plan_type = 'Profissional' WHERE plan_type = 'Pro';
UPDATE tenants SET plan_type = 'Corporativo'  WHERE plan_type = 'Enterprise';
