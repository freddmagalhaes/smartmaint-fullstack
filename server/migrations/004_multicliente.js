// Bloco 1: unidades fabris, limites por plano, auditoria, preparação da NFS-e e índices de desempenho.
module.exports = {
  id: '004_multicliente',
  up: async (q, h) => {
    // --- Unidades fabris: todo cliente tem ao menos uma; equipamentos pertencem a uma unidade ---
    await q(`CREATE TABLE IF NOT EXISTS units (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id VARCHAR(50) NOT NULL,
      name VARCHAR(255) NOT NULL,
      code VARCHAR(50) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_units_tenant_name (tenant_id, name),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )`);
    await q(`INSERT INTO units (tenant_id, name)
             SELECT t.id, 'Unidade Principal' FROM tenants t
             WHERE NOT EXISTS (SELECT 1 FROM units u WHERE u.tenant_id = t.id)`);

    if (!(await h.columnExists('equipments', 'unit_id'))) {
      await q('ALTER TABLE equipments ADD COLUMN unit_id INT NULL AFTER tenant_id');
      await q(`UPDATE equipments e
               JOIN (SELECT tenant_id, MIN(id) AS id FROM units GROUP BY tenant_id) u ON u.tenant_id = e.tenant_id
               SET e.unit_id = u.id`);
      await q('ALTER TABLE equipments MODIFY unit_id INT NOT NULL');
      // RESTRICT: uma unidade com equipamentos não pode ser excluída por engano
      await q('ALTER TABLE equipments ADD CONSTRAINT fk_equipments_unit FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT');
    }
    // Estoque pode ser de uma unidade ou compartilhado (NULL)
    if (!(await h.columnExists('inventory', 'unit_id'))) {
      await q('ALTER TABLE inventory ADD COLUMN unit_id INT NULL AFTER tenant_id');
      await q('ALTER TABLE inventory ADD CONSTRAINT fk_inventory_unit FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL');
    }

    // --- Planos e limites (valores iniciais provisórios, editáveis no backoffice) ---
    await q(`CREATE TABLE IF NOT EXISTS plans (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      price_monthly DECIMAL(10,2) NOT NULL DEFAULT 0,
      max_users INT NULL,
      max_equipments INT NULL,
      max_units INT NULL,
      trial_days INT NOT NULL DEFAULT 30,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
    )`);
    await q(`INSERT IGNORE INTO plans (id, name, max_users, max_equipments, max_units, sort_order) VALUES
      ('Starter', 'Starter', 5, 50, 1, 1),
      ('Pro', 'Pro', 20, 300, 3, 2),
      ('Enterprise', 'Enterprise', NULL, NULL, NULL, 3)`);

    // --- Auditoria ---
    await q(`CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      tenant_id VARCHAR(50) NULL,
      user_id INT NULL,
      user_name VARCHAR(255) NULL,
      action VARCHAR(30) NOT NULL,
      entity VARCHAR(50) NOT NULL,
      entity_id VARCHAR(100) NULL,
      changes JSON NULL,
      ip VARCHAR(64) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_audit_tenant_date (tenant_id, created_at),
      KEY idx_audit_entity (entity, entity_id)
    )`);

    // --- NFS-e: dados do prestador (SmartMaint) e do tomador (cliente) ---
    await q(`CREATE TABLE IF NOT EXISTS fiscal_settings (
      id TINYINT PRIMARY KEY DEFAULT 1,
      cnpj VARCHAR(14) NULL,
      razao_social VARCHAR(255) NULL,
      inscricao_municipal VARCHAR(30) NULL,
      municipio_ibge VARCHAR(7) NULL,
      regime_tributario VARCHAR(30) NULL,
      optante_simples BOOLEAN NULL,
      codigo_tributacao_nacional VARCHAR(6) NULL,
      codigo_tributacao_municipal VARCHAR(20) NULL,
      aliquota_iss DECIMAL(5,2) NULL,
      descricao_servico VARCHAR(1000) NULL,
      updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
    )`);
    await q('INSERT IGNORE INTO fiscal_settings (id) VALUES (1)');

    for (const [column, definition] of [
      ['razao_social', 'VARCHAR(255) NULL'],
      ['email_financeiro', 'VARCHAR(255) NULL'],
      ['cep', 'VARCHAR(8) NULL'],
      ['logradouro', 'VARCHAR(255) NULL'],
      ['numero', 'VARCHAR(20) NULL'],
      ['complemento', 'VARCHAR(100) NULL'],
      ['bairro', 'VARCHAR(100) NULL'],
      ['municipio_ibge', 'VARCHAR(7) NULL'],
      ['cidade', 'VARCHAR(100) NULL'],
      ['uf', 'CHAR(2) NULL'],
    ]) {
      await h.addColumn('tenants', column, definition);
    }

    await q(`CREATE TABLE IF NOT EXISTS nfse (
      id INT AUTO_INCREMENT PRIMARY KEY,
      invoice_id INT NOT NULL,
      tenant_id VARCHAR(50) NOT NULL,
      status ENUM('Pendente', 'Emitida', 'Erro', 'Cancelada') NOT NULL DEFAULT 'Pendente',
      ambiente VARCHAR(20) NULL,
      numero VARCHAR(30) NULL,
      chave_acesso VARCHAR(60) NULL,
      dps_id VARCHAR(60) NULL,
      valor DECIMAL(10,2) NOT NULL,
      error_message VARCHAR(2000) NULL,
      attempts INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      emitted_at DATETIME NULL,
      UNIQUE KEY uq_nfse_invoice (invoice_id),
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )`);

    // --- Índices para listas paginadas e filtros ---
    await h.addIndex('work_orders', 'idx_wo_tenant_status', '(tenant_id, status)');
    await h.addIndex('failures', 'idx_failures_tenant_date', '(tenant_id, data_falha)');
    await h.addIndex('repairs', 'idx_repairs_tenant_date', '(tenant_id, data_reparo)');
    await h.addIndex('repairs', 'idx_repairs_work_order', '(work_order_id)');
    await h.addIndex('invoices', 'idx_invoices_tenant_status', '(tenant_id, status)');
    await h.addIndex('preventive_plans', 'idx_plans_tenant_due', '(tenant_id, next_due)');
    await h.addIndex('equipments', 'idx_equipments_tenant_name', '(tenant_id, name)');
  },
};
