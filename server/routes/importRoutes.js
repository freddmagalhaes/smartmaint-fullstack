const express = require('express');
const router = express.Router();
const { getTenantId, isBackoffice } = require('../utils/routeHelpers');
const { handleQueryError } = require('../utils/errorHandler');
const { getLimits } = require('../utils/plans');
const { withTenantLock, requireFeature } = require('../utils/planLimits');
const { MAX_ROWS, validateRows, serieKey } = require('../utils/importEquipments');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// Quem pode importar em massa: gestão do cliente ou backoffice (usuário comum não)
const ROLES_IMPORT = ['Dono', 'Administrador', 'Gerente'];
const canImport = (req) => isBackoffice(req) || ROLES_IMPORT.includes(req.user.role);

/**
 * Importação de ativos em lote (planilha lida no navegador, enviada como JSON).
 * Tudo ou nada: qualquer erro de validação ou estouro de limite recusa o lote inteiro.
 * `dry_run: true` só calcula o resultado (pré-visualização), sem gravar.
 * Duplicados (mesmo número de série já existente ou repetido na planilha) são ignorados e informados.
 */
router.post('/equipments/import', requireFeature('import'), async (req, res) => {
  if (!canImport(req)) return res.status(403).json({ error: 'Sem permissão para importar ativos.' });
  const tenant_id = getTenantId(req);
  if (!tenant_id) return res.status(400).json({ error: 'Tenant ID required' });

  const { rows: rawRows, dry_run: dryRun } = req.body || {};
  if (!Array.isArray(rawRows) || rawRows.length === 0) return res.status(400).json({ error: 'Nenhuma linha para importar.' });
  if (rawRows.length > MAX_ROWS) return res.status(400).json({ error: `Máximo de ${MAX_ROWS} linhas por importação.` });

  const { rows, errors } = validateRows(rawRows);
  if (errors.length > 0) {
    return res.status(422).json({ code: 'IMPORT_INVALID', error: 'A planilha tem linhas inválidas. Corrija e envie novamente.', total_errors: errors.length, errors: errors.slice(0, 50) });
  }

  try {
    const result = await withTenantLock(tenant_id, async (conn, tenant) => {
      const limit = getLimits(tenant).assets;
      const [[{ n: current }]] = await conn.query('SELECT COUNT(*) AS n FROM equipments WHERE tenant_id = ?', [tenant_id]);

      // Séries que o cliente já tem
      const series = [...new Set(rows.filter((r) => r.serie).map((r) => r.serie))];
      const existing = new Set();
      if (series.length > 0) {
        const [found] = await conn.query('SELECT serie FROM equipments WHERE tenant_id = ? AND serie IN (?)', [tenant_id, series]);
        found.forEach((f) => existing.add(serieKey(f.serie)));
      }

      const toInsert = [];
      const skipped = [];
      for (const r of rows) {
        const key = r.serie ? serieKey(r.serie) : null;
        if (key && existing.has(key)) {
          skipped.push({ line: r.line, name: r.name, serie: r.serie, reason: 'Número de série já cadastrado ou repetido na planilha.' });
          continue;
        }
        if (key) existing.add(key);
        toInsert.push(r);
      }

      const available = limit === null ? null : Math.max(0, limit - current);
      if (limit !== null && toInsert.length > available) {
        return { rollback: true, limitReached: true, limit, current, requested: toInsert.length, available };
      }

      if (dryRun === true || toInsert.length === 0) {
        return { rollback: true, imported: 0, would_import: toInsert.length, skipped, dry_run: dryRun === true, available };
      }

      await conn.query(
        'INSERT INTO equipments (tenant_id, name, type, model, serie, total_op_time, data_inicio) VALUES ?',
        [toInsert.map((r) => [tenant_id, r.name, r.type, r.model, r.serie, r.total_op_time, r.data_inicio])]
      );
      return { imported: toInsert.length, would_import: toInsert.length, skipped, dry_run: false, available: available === null ? null : available - toInsert.length };
    });

    if (result.notFound) return res.status(404).json({ error: 'Tenant não encontrado' });
    if (result.limitReached) {
      return res.status(403).json({
        code: 'PLAN_LIMIT_ASSETS',
        error: `A importação adicionaria ${result.requested} ativos, mas seu plano permite mais ${result.available} (limite de ${result.limit}). Reduza a planilha ou faça upgrade.`,
        limit: result.limit, current: result.current, requested: result.requested, available: result.available,
      });
    }
    res.json({
      imported: result.imported,
      would_import: result.would_import,
      skipped: result.skipped,
      dry_run: result.dry_run,
      available: result.available,
    });
  } catch (err) { handleQueryError(res, err, 'Erro ao importar ativos'); }
});

module.exports = router;
