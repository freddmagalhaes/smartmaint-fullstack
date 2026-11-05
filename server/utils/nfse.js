const fs = require('fs');
const tls = require('tls');
const { config } = require('../config');

/**
 * Preparação da NFS-e padrão nacional (Emissor Nacional / Sefin Nacional).
 *
 * Neste estágio o sistema já: guarda os dados fiscais do prestador, coleta os dados do
 * tomador (cliente), enfileira uma NFS-e "Pendente" para cada fatura paga e valida se o
 * certificado A1 e a configuração estão prontos. A transmissão da DPS ao Emissor Nacional
 * é ativada quando houver CNPJ, certificado e cadastro municipal para testar em homologação.
 */

// Campos do prestador exigidos para emitir
const REQUIRED_FISCAL_FIELDS = {
  cnpj: 'CNPJ do prestador',
  razao_social: 'Razão social',
  inscricao_municipal: 'Inscrição municipal',
  municipio_ibge: 'Código IBGE do município',
  regime_tributario: 'Regime tributário',
  codigo_tributacao_nacional: 'Código de tributação nacional (item da LC 116)',
  aliquota_iss: 'Alíquota de ISS',
  descricao_servico: 'Descrição do serviço',
};

const loadCertificate = () => {
  if (config.nfse.certBase64) return Buffer.from(config.nfse.certBase64, 'base64');
  if (config.nfse.certPath && fs.existsSync(config.nfse.certPath)) return fs.readFileSync(config.nfse.certPath);
  return null;
};

/** Verifica se o certificado A1 (.pfx) abre com a senha informada, sem expor o conteúdo. */
const checkCertificate = () => {
  const pfx = loadCertificate();
  if (!pfx) return { ok: false, message: 'Certificado A1 não configurado (NFSE_CERT_BASE64 ou NFSE_CERT_PATH)' };
  try {
    tls.createSecureContext({ pfx, passphrase: config.nfse.certPassword || '' });
    return { ok: true, message: 'Certificado A1 carregado' };
  } catch (err) {
    return { ok: false, message: `Certificado inválido ou senha incorreta (${err.message})` };
  }
};

/** Lista o que falta para emitir: usada no painel fiscal do backoffice. */
const getReadiness = (settings) => {
  const checks = Object.entries(REQUIRED_FISCAL_FIELDS).map(([field, label]) => ({
    item: label,
    ok: settings?.[field] !== null && settings?.[field] !== undefined && settings?.[field] !== '',
  }));
  const cert = checkCertificate();
  checks.push({ item: cert.message, ok: cert.ok });
  checks.push({ item: `Ambiente: ${config.nfse.ambiente === 'producao' ? 'produção' : 'homologação (produção restrita)'}`, ok: true });
  checks.push({ item: config.nfse.enabled ? 'Emissão ativada (NFSE_ENABLED=true)' : 'Emissão desativada (NFSE_ENABLED=false)', ok: config.nfse.enabled });
  return { ready: checks.every((c) => c.ok), checks };
};

/** Enfileira a NFS-e de uma fatura paga (idempotente). Chamado dentro da transação da baixa. */
const enqueueForInvoice = async (q, invoice) => {
  await q(
    'INSERT IGNORE INTO nfse (invoice_id, tenant_id, valor, ambiente) VALUES (?, ?, ?, ?)',
    [invoice.id, invoice.tenant_id, invoice.valor, config.nfse.ambiente]
  );
};

module.exports = { getReadiness, enqueueForInvoice, REQUIRED_FISCAL_FIELDS };
