const express = require('express');
const writeExcelModule = require('write-excel-file/node');
const { query } = require('../utils/routeHelpers');
const { HttpError } = require('../utils/errorHandler');
const { ROLES, MANAGERS, requireRole, tenantScope } = require('../middleware/rbac');
const { parse, z, id, date, idParam } = require('../utils/validate');
const { buildOverview, buildEquipmentHistory } = require('../utils/reports');
const { audit } = require('../utils/audit');

const router = express.Router();
const writeExcelFile = writeExcelModule.default || writeExcelModule;

const isoToday = () => new Date().toISOString().slice(0, 10);

/** Período do relatório (padrão: mês atual até hoje), no máximo 3 anos. */
const periodFrom = (req) => {
  const q = parse(z.object({ from: date.optional(), to: date.optional(), unit_id: id.optional() }), req.query);
  const to = q.to || isoToday();
  const from = q.from || `${to.slice(0, 7)}-01`;
  if (from > to) throw new HttpError(400, 'A data inicial deve ser anterior à final');
  if ((new Date(to) - new Date(from)) / 86400000 > 366 * 3) throw new HttpError(400, 'Escolha um período de até 3 anos');
  return { from, to, unitId: q.unit_id };
};

router.get('/reports/overview', requireRole(...MANAGERS), tenantScope, async (req, res) => {
  res.json(await buildOverview(req.tenantId, periodFrom(req)));
});

router.get('/reports/equipment/:id', requireRole(...MANAGERS), tenantScope, async (req, res) => {
  const history = await buildEquipmentHistory(req.tenantId, idParam(req), periodFrom(req));
  if (!history) throw new HttpError(404, 'Equipamento não encontrado');
  res.json(history);
});

// --- Exportação em Excel ---
const brDate = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
const header = (cols) => cols.map((c) => ({ value: c, fontWeight: 'bold' }));
const num = (value, format = '#,##0.00') => (value === null || value === undefined ? null : { value: Number(value), type: Number, format });
const text = (value) => (value === null || value === undefined || value === '' ? null : { value: String(value), type: String });
const pct = (value) => num(value, '0.0%');

router.get('/reports/overview.xlsx', requireRole(...MANAGERS), tenantScope, async (req, res) => {
  const period = periodFrom(req);
  const r = await buildOverview(req.tenantId, period);
  const [unit] = period.unitId ? await query('SELECT name FROM units WHERE id = ? AND tenant_id = ?', [period.unitId, req.tenantId]) : [];

  const summary = [
    header(['Indicador', 'Valor']),
    [text('Período'), text(`${brDate(r.period.from)} a ${brDate(r.period.to)}`)],
    [text('Unidade'), text(unit?.name || 'Todas')],
    [text('O.S. abertas no período'), num(r.work_orders.total, '0')],
    [text('O.S. concluídas no período'), num(r.work_orders.concluded_in_period, '0')],
    [text('Tempo médio de solução (dias)'), num(r.work_orders.avg_resolution_days, '0.0')],
    [text('O.S. em aberto hoje'), num(r.work_orders.open_now, '0')],
    [text('Preventivas programadas'), num(r.preventive.scheduled, '0')],
    [text('Preventivas concluídas'), num(r.preventive.completed, '0')],
    [text('Cumprimento das preventivas'), pct(r.preventive.compliance)],
    [text('Planos preventivos vencidos hoje'), num(r.preventive.overdue_plans, '0')],
    [text('Custo de peças (R$)'), num(r.costs.parts_total)],
    ...Object.entries(r.work_orders.by_type).map(([k, v]) => [text(`O.S. ${k}`), num(v, '0')]),
  ];
  const equipments = [
    header(['Equipamento', 'Unidade', 'O.S.', 'Falhas', 'Reparos', 'Horas de reparo', 'MTTR (h)', 'MTBF acumulado (h)', 'Disponibilidade', 'Custo de peças (R$)']),
    ...r.equipments.map((e) => [
      text(e.name), text(e.unit_name), num(e.work_orders, '0'), num(e.failures, '0'), num(e.repairs, '0'),
      num(e.repair_hours, '0.0'), num(e.mttr, '0.0'), num(e.mtbf, '0.0'), pct(e.availability), num(e.parts_cost),
    ]),
  ];
  const costs = [
    header(['Mês', 'Custo de peças (R$)']),
    ...r.costs.by_month.map((m) => [text(`${m.month.slice(5)}/${m.month.slice(0, 4)}`), num(m.cost)]),
  ];

  const buffer = await writeExcelFile([
    { sheet: 'Resumo', data: summary, columns: [{ width: 36 }, { width: 24 }] },
    { sheet: 'Equipamentos', data: equipments, stickyRowsCount: 1, columns: [{ width: 30 }, { width: 22 }, ...Array(8).fill({ width: 16 })] },
    { sheet: 'Custos por mês', data: costs, columns: [{ width: 14 }, { width: 22 }] },
  ]).toBuffer();

  await audit(req, { action: 'export_report', entity: 'report', entityId: `${period.from}:${period.to}` });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="relatorio-${r.period.from}-a-${r.period.to}.xlsx"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(buffer);
});

// --- Primeiros passos (checklist do cliente novo) ---
const ONBOARDING_STEPS = [
  { id: 'company', label: 'Complete os dados da empresa', hint: 'Razão social e CNPJ aparecem nas notas fiscais.', path: '/settings?tab=company',
    sql: "SELECT (razao_social IS NOT NULL AND razao_social <> '' AND cnpj IS NOT NULL AND cnpj <> '') AS done FROM tenants WHERE id = ?" },
  { id: 'equipments', label: 'Cadastre ou importe seus equipamentos', hint: 'Use "Importar planilha" para cadastrar vários de uma vez.', path: '/equipments',
    sql: 'SELECT COUNT(*) > 0 AS done FROM equipments WHERE tenant_id = ?' },
  { id: 'preventive', label: 'Crie um plano de manutenção preventiva', hint: 'As O.S. preventivas passam a ser geradas sozinhas.', path: '/preventive',
    sql: 'SELECT COUNT(*) > 0 AS done FROM preventive_plans WHERE tenant_id = ?' },
  { id: 'work_order', label: 'Abra a primeira ordem de serviço', hint: 'Registre um chamado de manutenção.', path: '/work-orders',
    sql: 'SELECT COUNT(*) > 0 AS done FROM work_orders WHERE tenant_id = ?' },
  { id: 'inventory', label: 'Cadastre as peças do estoque', hint: 'Receba aviso quando uma peça chegar ao mínimo.', path: '/inventory',
    sql: 'SELECT COUNT(*) > 0 AS done FROM inventory WHERE tenant_id = ?' },
  { id: 'team', label: 'Convide sua equipe', hint: 'Gerentes e técnicos recebem um convite por e-mail.', path: '/settings?tab=users',
    sql: 'SELECT COUNT(*) > 1 AS done FROM users WHERE tenant_id = ?' },
];

router.get('/onboarding', requireRole(ROLES.ADMIN), tenantScope, async (req, res) => {
  const [tenant] = await query('SELECT onboarding_dismissed_at FROM tenants WHERE id = ?', [req.tenantId]);
  const steps = [];
  for (const { sql, ...step } of ONBOARDING_STEPS) {
    const [row] = await query(sql, [req.tenantId]);
    steps.push({ ...step, done: Boolean(Number(row?.done)) });
  }
  res.json({ dismissed: Boolean(tenant?.onboarding_dismissed_at), completed: steps.filter((s) => s.done).length, total: steps.length, steps });
});

router.post('/onboarding/dismiss', requireRole(ROLES.ADMIN), tenantScope, async (req, res) => {
  await query('UPDATE tenants SET onboarding_dismissed_at = NOW() WHERE id = ?', [req.tenantId]);
  res.json({ dismissed: true });
});

module.exports = router;
