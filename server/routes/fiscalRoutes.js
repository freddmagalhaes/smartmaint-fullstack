const express = require('express');
const { query, buildUpdate } = require('../utils/routeHelpers');
const { pageParams, paginate } = require('../utils/pagination');
const { getReadiness } = require('../utils/nfse');
const { audit } = require('../utils/audit');
const { requireMaster } = require('../middleware/rbac');
const { parse, z, optionalText } = require('../utils/validate');

const router = express.Router();

const digits = (max) => z.string().trim().transform((v) => v.replace(/\D/g, '')).pipe(z.string().max(max)).nullish();

const getSettings = async () => (await query('SELECT * FROM fiscal_settings WHERE id = 1'))[0] || {};

// Dados fiscais do prestador (a empresa dona do SmartMaint) e prontidão para emitir NFS-e
router.get('/admin/fiscal', requireMaster, async (req, res) => {
  const settings = await getSettings();
  res.json({ settings, readiness: getReadiness(settings) });
});

router.put('/admin/fiscal', requireMaster, async (req, res) => {
  const d = parse(z.object({
    cnpj: digits(14),
    razao_social: optionalText(),
    inscricao_municipal: optionalText(30),
    municipio_ibge: digits(7),
    regime_tributario: z.enum(['simples_nacional', 'mei', 'lucro_presumido', 'lucro_real']).nullish(),
    optante_simples: z.boolean().nullish(),
    codigo_tributacao_nacional: digits(6),
    codigo_tributacao_municipal: optionalText(20),
    aliquota_iss: z.coerce.number().min(0).max(5).nullish(),
    descricao_servico: optionalText(1000),
  }), req.body);
  const { sql, params } = buildUpdate(d, Object.keys(d));
  await query(`UPDATE fiscal_settings SET ${sql} WHERE id = 1`, params);
  await audit(req, { action: 'update', entity: 'fiscal_settings', entityId: 1, changes: d, tenantId: null });
  const settings = await getSettings();
  res.json({ settings, readiness: getReadiness(settings) });
});

// Notas fiscais (fila de pendentes, emitidas e com erro)
router.get('/admin/nfse', requireMaster, async (req, res) => {
  const { page, pageSize } = pageParams(req);
  const { status } = parse(z.object({ status: z.enum(['Pendente', 'Emitida', 'Erro', 'Cancelada']).optional() }), req.query);
  const where = [];
  const params = [];
  if (status) { where.push('n.status = ?'); params.push(status); }
  res.json(await paginate({
    select: 'n.*, t.name AS tenant_name, i.mes_ref',
    from: 'nfse n JOIN tenants t ON t.id = n.tenant_id JOIN invoices i ON i.id = n.invoice_id',
    where, params, orderBy: 'n.id DESC', page, pageSize,
  }));
});

module.exports = router;
