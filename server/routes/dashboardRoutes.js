const express = require('express');
const { query } = require('../utils/routeHelpers');
const { MANAGERS, requireRole, tenantScope } = require('../middleware/rbac');
const { parse, z, id } = require('../utils/validate');

const router = express.Router();

/**
 * Indicadores do dashboard calculados no banco (não depende de carregar todos os registros).
 * Retorna os totais brutos; MTBF, MTTR e disponibilidade são derivados no frontend.
 */
router.get('/dashboard/summary', requireRole(...MANAGERS), tenantScope, async (req, res) => {
  const { unit_id: unitId } = parse(z.object({ unit_id: id.optional() }), req.query);
  const t = req.tenantId;
  // Restringe por unidade através do equipamento
  const unitEq = unitId ? ' AND e.unit_id = ?' : '';
  const p = (...extra) => (unitId ? [t, unitId, ...extra] : [t, ...extra]);

  const [[equip], [fail], [rep], osByStatus, [critical], failuresByMonth, repairsByMonth, topAssets, costByMonth] = await Promise.all([
    query(`SELECT COUNT(*) AS count, COALESCE(SUM(e.total_op_time), 0) AS op_time FROM equipments e WHERE e.tenant_id = ?${unitEq}`, p()),
    query(`SELECT COUNT(*) AS count FROM failures f JOIN equipments e ON e.id = f.equipment_id WHERE f.tenant_id = ?${unitEq}`, p()),
    query(`SELECT COUNT(*) AS count, COALESCE(SUM(r.tempo_reparo), 0) AS hours FROM repairs r JOIN equipments e ON e.id = r.equipment_id WHERE r.tenant_id = ?${unitEq}`, p()),
    query(`SELECT w.status, COUNT(*) AS count FROM work_orders w JOIN equipments e ON e.id = w.equipment_id WHERE w.tenant_id = ?${unitEq} GROUP BY w.status`, p()),
    query(`SELECT COUNT(*) AS count FROM work_orders w JOIN equipments e ON e.id = w.equipment_id
           WHERE w.tenant_id = ?${unitEq} AND w.prioridade = 'Crítica' AND w.status <> 'Concluída'`, p()),
    query(`SELECT DATE_FORMAT(f.data_falha, '%Y-%m') AS month, COUNT(*) AS count FROM failures f JOIN equipments e ON e.id = f.equipment_id
           WHERE f.tenant_id = ?${unitEq} AND f.data_falha >= DATE_SUB(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL 5 MONTH)
           GROUP BY month`, p()),
    query(`SELECT DATE_FORMAT(r.data_reparo, '%Y-%m') AS month, SUM(r.tempo_reparo) AS hours FROM repairs r JOIN equipments e ON e.id = r.equipment_id
           WHERE r.tenant_id = ?${unitEq} AND r.data_reparo >= DATE_SUB(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL 5 MONTH)
           GROUP BY month`, p()),
    query(`SELECT e.id, e.name, COUNT(*) AS open_count FROM work_orders w JOIN equipments e ON e.id = w.equipment_id
           WHERE w.tenant_id = ?${unitEq} AND w.status <> 'Concluída'
           GROUP BY e.id, e.name ORDER BY open_count DESC, e.name LIMIT 6`, p()),
    // Custo de peças por mês (pela data em que a peça foi lançada na O.S.)
    query(`SELECT DATE_FORMAT(pt.created_at, '%Y-%m') AS month, SUM(pt.quantity * pt.unit_price) AS cost
           FROM work_order_parts pt JOIN work_orders w ON w.id = pt.work_order_id JOIN equipments e ON e.id = w.equipment_id
           WHERE pt.tenant_id = ?${unitEq} AND pt.created_at >= DATE_SUB(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL 5 MONTH)
           GROUP BY month`, p()),
  ]);

  res.json({
    equipments: Number(equip.count),
    total_op_time: Number(equip.op_time),
    failures: Number(fail.count),
    repairs: Number(rep.count),
    repair_hours: Number(rep.hours),
    work_orders: Object.fromEntries(osByStatus.map((r) => [r.status, Number(r.count)])),
    critical_open: Number(critical.count),
    monthly: {
      failures: Object.fromEntries(failuresByMonth.map((r) => [r.month, Number(r.count)])),
      repair_hours: Object.fromEntries(repairsByMonth.map((r) => [r.month, Number(r.hours)])),
      parts_cost: Object.fromEntries(costByMonth.map((r) => [r.month, Number(r.cost)])),
    },
    parts_cost_6m: costByMonth.reduce((sum, r) => sum + Number(r.cost), 0),
    top_open_assets: topAssets.map((r) => ({ id: r.id, name: r.name, open: Number(r.open_count) })),
  });
});

module.exports = router;
