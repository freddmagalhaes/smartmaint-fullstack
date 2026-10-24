const db = require('../db');
const { config } = require('../config');

/**
 * Versão vigente dos Termos de Uso e da Política de Privacidade (textos em src/pages/legal).
 * Ao alterar os textos, mude também esta versão: todos os usuários aceitam de novo no próximo acesso.
 */
const LEGAL_VERSION = '2026-10-24';

const publicLegalInfo = () => ({
  version: LEGAL_VERSION,
  company_name: config.legal.companyName,
  cnpj: config.legal.cnpj || null,
  address: config.legal.address,
  contact_email: config.legal.contactEmail || null,
  dpo_name: config.legal.dpoName || null,
});

/** Registra o aceite (prova do consentimento) e marca a versão aceita pelo usuário. */
const recordAcceptance = async (q, { userId, tenantId, ip, userAgent }) => {
  await q(
    'INSERT INTO legal_acceptances (user_id, tenant_id, version, ip, user_agent) VALUES (?, ?, ?, ?, ?)',
    [userId, tenantId || null, LEGAL_VERSION, ip || null, (userAgent || '').slice(0, 255) || null]
  );
  await q('UPDATE users SET legal_version_accepted = ? WHERE id = ?', [LEGAL_VERSION, userId]);
};

const acceptanceQuery = async (sql, params) => (await db.query(sql, params))[0];

module.exports = { LEGAL_VERSION, publicLegalInfo, recordAcceptance, acceptanceQuery };
