-- APENAS PARA DESENVOLVIMENTO/DEMO. NUNCA execute em produção:
-- as contas abaixo usam uma senha conhecida e publicada no repositório.
-- Uso: mysql -u root -p smartmaint_db < seed-demo.sql

INSERT INTO tenants (id, name) VALUES ('delp', 'DELP Engenharia'), ('stellantis', 'Stellantis');

INSERT INTO users (tenant_id, name, email, password, role, is_master) VALUES 
(NULL, 'Master', 'master@smartmaint.com', '$2b$10$a70zVnmJjbDO1YgAYyToGuNwrkOpvZSs0wPaiR3r.UzgpHXv1UwCu', 'Dono', TRUE),
('delp', 'Carlos (Dono)', 'dono@delp.com.br', '$2b$10$a70zVnmJjbDO1YgAYyToGuNwrkOpvZSs0wPaiR3r.UzgpHXv1UwCu', 'Administrador', FALSE),
('stellantis', 'Julia (Dona)', 'dono@stellantis.com', '$2b$10$a70zVnmJjbDO1YgAYyToGuNwrkOpvZSs0wPaiR3r.UzgpHXv1UwCu', 'Administrador', FALSE);
