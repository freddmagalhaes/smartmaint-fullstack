// Bloco 2: peças nas O.S. com movimentação de estoque, preventivas automáticas com checklist,
// comentários e anexos nas O.S. e notificações por e-mail.
module.exports = {
  id: '005_produto',
  up: async (q, h) => {
    // --- Peças usadas nas O.S. (nome e preço guardados como estavam no momento do uso) ---
    await q(`CREATE TABLE IF NOT EXISTS work_order_parts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id VARCHAR(50) NOT NULL,
      work_order_id INT NOT NULL,
      inventory_id INT NULL,
      item_name VARCHAR(255) NOT NULL,
      quantity INT NOT NULL,
      unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_wop_work_order (work_order_id),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE SET NULL
    )`);

    // --- Histórico de movimentações do estoque ---
    await q(`CREATE TABLE IF NOT EXISTS inventory_movements (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      tenant_id VARCHAR(50) NOT NULL,
      inventory_id INT NOT NULL,
      type ENUM('entrada', 'saida', 'ajuste', 'estorno') NOT NULL,
      quantity INT NOT NULL,
      balance_after INT NOT NULL,
      work_order_id INT NULL,
      user_id INT NULL,
      user_name VARCHAR(255) NULL,
      note VARCHAR(500) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_mov_item_date (inventory_id, created_at),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE
    )`);

    // --- Preventivas automáticas e checklist ---
    await h.addColumn('preventive_plans', 'auto_generate', 'BOOLEAN NOT NULL DEFAULT TRUE');
    await h.addColumn('preventive_plans', 'lead_days', 'INT NOT NULL DEFAULT 0');
    await h.addColumn('preventive_plans', 'last_generated_due', 'DATE NULL');
    await q(`CREATE TABLE IF NOT EXISTS preventive_checklist_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      plan_id INT NOT NULL,
      description VARCHAR(500) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      FOREIGN KEY (plan_id) REFERENCES preventive_plans(id) ON DELETE CASCADE
    )`);

    if (!(await h.columnExists('work_orders', 'preventive_plan_id'))) {
      await q('ALTER TABLE work_orders ADD COLUMN preventive_plan_id INT NULL');
      await q('ALTER TABLE work_orders ADD CONSTRAINT fk_wo_plan FOREIGN KEY (preventive_plan_id) REFERENCES preventive_plans(id) ON DELETE SET NULL');
    }
    await q(`CREATE TABLE IF NOT EXISTS work_order_checklist (
      id INT AUTO_INCREMENT PRIMARY KEY,
      work_order_id INT NOT NULL,
      description VARCHAR(500) NOT NULL,
      done BOOLEAN NOT NULL DEFAULT FALSE,
      done_by VARCHAR(255) NULL,
      done_at DATETIME NULL,
      sort_order INT NOT NULL DEFAULT 0,
      KEY idx_woc_work_order (work_order_id),
      FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE
    )`);

    // --- Comentários e anexos ---
    await q(`CREATE TABLE IF NOT EXISTS work_order_comments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id VARCHAR(50) NOT NULL,
      work_order_id INT NOT NULL,
      user_id INT NULL,
      user_name VARCHAR(255) NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_woco_work_order (work_order_id),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE
    )`);
    await q(`CREATE TABLE IF NOT EXISTS work_order_attachments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id VARCHAR(50) NOT NULL,
      work_order_id INT NOT NULL,
      url VARCHAR(500) NOT NULL,
      filename VARCHAR(255) NULL,
      content_type VARCHAR(100) NOT NULL,
      size_bytes INT NOT NULL,
      uploaded_by INT NULL,
      uploaded_by_name VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_woa_work_order (work_order_id),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE
    )`);

    // --- Notificações ---
    await h.addColumn('users', 'notifications_enabled', 'BOOLEAN NOT NULL DEFAULT TRUE');
    // Evita enviar o mesmo aviso duas vezes (ex.: rotina rodando em várias instâncias)
    await q(`CREATE TABLE IF NOT EXISTS notifications_sent (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      tenant_id VARCHAR(50) NOT NULL,
      kind VARCHAR(50) NOT NULL,
      ref_key VARCHAR(100) NOT NULL,
      recipients INT NOT NULL DEFAULT 0,
      sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_notification (tenant_id, kind, ref_key)
    )`);
  },
};
