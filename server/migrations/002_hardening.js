// Correções de schema: perfis de acesso, revogação de sessão, MTTR real, baixa de faturas e integridade.
module.exports = {
  id: '002_hardening',
  up: async (q, h) => {
    // Perfis usados pelo sistema ('Gerente' e 'Suporte' não existiam no ENUM)
    await q(`ALTER TABLE users MODIFY role ENUM('Dono', 'Administrador', 'Gerente', 'Usuário', 'Suporte') NOT NULL`);
    // Incrementado ao trocar/redefinir senha: invalida tokens JWT emitidos antes
    await h.addColumn('users', 'token_version', 'INT NOT NULL DEFAULT 0');

    // Usuários de um cliente excluído eram mantidos sem tenant (contas órfãs com acesso ao login)
    await h.replaceForeignKey('users', 'tenant_id', 'FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE');

    await h.addColumn('tenants', 'cnpj', 'VARCHAR(20) NULL');

    // Tempo de reparo informado na conclusão da O.S. (antes era fixo em 4h)
    await h.addColumn('work_orders', 'descricao', 'TEXT NULL');
    await h.addColumn('work_orders', 'tempo_reparo', 'DECIMAL(8,2) NULL');
    await h.addColumn('work_orders', 'data_conclusao', 'DATE NULL');
    await q('ALTER TABLE repairs MODIFY tempo_reparo DECIMAL(8,2) NOT NULL');
    await h.addColumn('repairs', 'work_order_id', 'INT NULL');

    // Baixa automática via webhook do Stripe
    await h.addColumn('invoices', 'paid_at', 'DATETIME NULL');
    await h.addColumn('invoices', 'stripe_session_id', 'VARCHAR(255) NULL');

    await h.addColumn('fmea', 'updated_at', 'TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP');
  },
};
