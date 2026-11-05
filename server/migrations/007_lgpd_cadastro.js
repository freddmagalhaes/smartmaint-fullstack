// Bloco 4: aceite dos Termos de Uso e da Política de Privacidade (LGPD), cadastro pelo próprio
// cliente com confirmação de e-mail e status "Pendente" (conta criada, aguardando assinatura).
module.exports = {
  id: '007_lgpd_cadastro',
  up: async (q, h) => {
    await q(`ALTER TABLE tenants MODIFY COLUMN status
      ENUM('Ativo', 'Inadimplente', 'Cancelado', 'Trial', 'Pendente') DEFAULT 'Ativo'`);
    // 'self' = criado pelo próprio cliente na página de cadastro
    await h.addColumn('tenants', 'signup_source', 'VARCHAR(20) NULL');

    // Usuários existentes já têm o e-mail validado (convite ou cadastro pelo backoffice)
    await h.addColumn('users', 'email_verified', 'BOOLEAN NOT NULL DEFAULT TRUE');
    await h.addColumn('users', 'email_verify_token', 'CHAR(64) NULL');
    await h.addColumn('users', 'email_verify_expiry', 'DATETIME NULL');
    await h.addIndex('users', 'idx_users_verify_token', '(email_verify_token)');
    // Versão dos documentos legais aceita por último (NULL = nunca aceitou)
    await h.addColumn('users', 'legal_version_accepted', 'VARCHAR(20) NULL');

    // Registro de cada aceite (prova do consentimento: quem, quando, de onde e qual versão)
    await q(`CREATE TABLE IF NOT EXISTS legal_acceptances (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      tenant_id VARCHAR(50) NULL,
      version VARCHAR(20) NOT NULL,
      ip VARCHAR(64) NULL,
      user_agent VARCHAR(255) NULL,
      accepted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_legal_user (user_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);
  },
};
