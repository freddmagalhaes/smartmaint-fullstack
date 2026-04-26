-- Criação do Banco de Dados
CREATE DATABASE IF NOT EXISTS smartmaint_db;
USE smartmaint_db;

-- Tabela de Tenants (Empresas/Unidades)
CREATE TABLE tenants (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Usuários
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id VARCHAR(50),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('Dono', 'Administrador', 'Usuário') NOT NULL,
    is_master BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL
);

-- Tabela de Equipamentos
CREATE TABLE equipments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100),
    model VARCHAR(100),
    serie VARCHAR(100),
    image TEXT,
    total_op_time INT DEFAULT 0,
    data_inicio DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Tabela de Falhas
CREATE TABLE failures (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    equipment_id INT NOT NULL,
    descricao TEXT NOT NULL,
    tempo_operacao INT NOT NULL,
    data_falha DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (equipment_id) REFERENCES equipments(id) ON DELETE CASCADE
);

-- Tabela de Reparos (Manutenções Concluídas)
CREATE TABLE repairs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    equipment_id INT NOT NULL,
    tipo VARCHAR(100),
    tempo_reparo INT NOT NULL,
    data_reparo DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (equipment_id) REFERENCES equipments(id) ON DELETE CASCADE
);

-- Tabela FMEA (Análise de Risco)
CREATE TABLE fmea (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    equipment_id INT NOT NULL,
    componente VARCHAR(255) NOT NULL,
    modo_falha VARCHAR(255) NOT NULL,
    severity INT NOT NULL,
    ocorrencia INT NOT NULL,
    deteccao INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (equipment_id) REFERENCES equipments(id) ON DELETE CASCADE
);

-- Tabela de Ordens de Serviço (O.S.)
CREATE TABLE work_orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    equipment_id INT NOT NULL,
    titulo VARCHAR(255) NOT NULL,
    tipo ENUM('Preventiva', 'Corretiva', 'Preditiva', 'Melhoria') NOT NULL,
    prioridade ENUM('Baixa', 'Média', 'Alta', 'Crítica') NOT NULL,
    status ENUM('Aberta', 'Em Execução', 'Pausada', 'Concluída') DEFAULT 'Aberta',
    responsavel VARCHAR(255),
    data_criacao DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (equipment_id) REFERENCES equipments(id) ON DELETE CASCADE
);

-- Inserção de Dados Iniciais (Seed)
INSERT INTO tenants (id, name) VALUES ('delp', 'DELP Engenharia'), ('stellantis', 'Stellantis');

INSERT INTO users (tenant_id, name, email, password, role, is_master) VALUES 
(NULL, 'Master', 'master@smartmaint.com', '123456', 'Dono', TRUE),
('delp', 'Carlos (Dono)', 'dono@delp.com.br', '123456', 'Administrador', FALSE),
('stellantis', 'Julia (Dona)', 'dono@stellantis.com', '123456', 'Administrador', FALSE);
