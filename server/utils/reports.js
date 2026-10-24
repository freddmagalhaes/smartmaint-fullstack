const { query } = require('./routeHelpers');

/**
 * Relatório gerencial de um período: ordens de serviço, preventivas, custos de peças e
 * indicadores por equipamento. `unitId` (opcional) restringe a uma unidade.
 *
 * Indicadores no período: falhas, reparos, horas de reparo, MTTR e custo de peças.
 * O MTBF é acumulado (horas de operação cadastradas ÷ total de falhas do equipamento), pois as
 * horas de operação não são registradas por período. Sem horas cadastradas, MTBF e
 * disponibilidade ficam nulos.
 */
const buildOverview = async (tenantId, { from, to, unitId }) => {
  const unitEq = unitId ? ' AND e.unit_id = ?' : '';
  // Parâmetros: tenant, [unidade], depois os do período
  const p = (...extra) => [tenantId, ...(unitId ? [unitId] : []), ...extra];

  const [osRows, [resolution], [backlog], [preventive], [overduePlans], partsByMonth, equipments] = await Promise.all([
    query(
      `SELECT w.tipo, w.status, w.prioridade, COUNT(*) AS n FROM work_orders w JOIN equipments e ON e.id = w.equipment_id
       WHERE w.tenant_id = ?${unitEq} AND w.data_criacao BETWEEN ? AND ? GROUP BY w.tipo, w.status, w.prioridade`,
      p(from, to)
    ),
    query(
      `SELECT COUNT(*) AS n, AVG(DATEDIFF(w.data_conclusao, w.data_criacao)) AS avg_days FROM work_orders w JOIN equipments e ON e.id = w.equipment_id
       WHERE w.tenant_id = ?${unitEq} AND w.status = 'Concluída' AND w.data_conclusao BETWEEN ? AND ?`,
      p(from, to)
    ),
    query(
      `SELECT COUNT(*) AS n FROM work_orders w JOIN equipments e ON e.id = w.equipment_id
       WHERE w.tenant_id = ?${unitEq} AND w.status <> 'Concluída'`,
      p()
    ),
    // Preventivas geradas no período e quantas delas já foram concluídas
    query(
      `SELECT COUNT(*) AS scheduled, COALESCE(SUM(w.status = 'Concluída'), 0) AS completed FROM work_orders w JOIN equipments e ON e.id = w.equipment_id
       WHERE w.tenant_id = ?${unitEq} AND w.tipo = 'Preventiva' AND w.data_criacao BETWEEN ? AND ?`,
      p(from, to)
    ),
    query(
      `SELECT COUNT(*) AS n FROM preventive_plans pp JOIN equipments e ON e.id = pp.equipment_id
       WHERE pp.tenant_id = ?${unitEq} AND pp.status = 'Ativo' AND pp.next_due < CURRENT_DATE`,
      p()
    ),
    query(
      `SELECT DATE_FORMAT(pt.created_at, '%Y-%m') AS month, SUM(pt.quantity * pt.unit_price) AS cost
       FROM work_order_parts pt JOIN work_orders w ON w.id = pt.work_order_id JOIN equipments e ON e.id = w.equipment_id
       WHERE pt.tenant_id = ?${unitEq} AND DATE(pt.created_at) BETWEEN ? AND ? GROUP BY month ORDER BY month`,
      p(from, to)
    ),
    query(
      `SELECT e.id, e.name, u.name AS unit_name, e.total_op_time,
         (SELECT COUNT(*) FROM failures f WHERE f.equipment_id = e.id) AS failures_total,
         (SELECT COUNT(*) FROM failures f WHERE f.equipment_id = e.id AND f.data_falha BETWEEN ? AND ?) AS failures,
         (SELECT COUNT(*) FROM repairs r WHERE r.equipment_id = e.id AND r.data_reparo BETWEEN ? AND ?) AS repairs,
         (SELECT COALESCE(SUM(r.tempo_reparo), 0) FROM repairs r WHERE r.equipment_id = e.id AND r.data_reparo BETWEEN ? AND ?) AS repair_hours,
         (SELECT COUNT(*) FROM work_orders w WHERE w.equipment_id = e.id AND w.data_criacao BETWEEN ? AND ?) AS work_orders,
         (SELECT COALESCE(SUM(pt.quantity * pt.unit_price), 0) FROM work_order_parts pt JOIN work_orders w ON w.id = pt.work_order_id
            WHERE w.equipment_id = e.id AND DATE(pt.created_at) BETWEEN ? AND ?) AS parts_cost
       FROM equipments e LEFT JOIN units u ON u.id = e.unit_id
       WHERE e.tenant_id = ?${unitEq} ORDER BY e.name`,
      [from, to, from, to, from, to, from, to, from, to, ...p()]
    ),
  ]);

  const count = (key) => {
    const out = {};
    for (const r of osRows) out[r[key]] = (out[r[key]] || 0) + Number(r.n);
    return out;
  };
  const scheduled = Number(preventive.scheduled);
  const completed = Number(preventive.completed);

  const equipmentRows = equipments.map((e) => {
    const repairs = Number(e.repairs);
    const repairHours = Number(e.repair_hours);
    const failuresTotal = Number(e.failures_total);
    const opTime = Number(e.total_op_time) || 0;
    const mttr = repairs ? repairHours / repairs : 0;
    // Sem horas de operação cadastradas não há como calcular MTBF nem disponibilidade
    const mtbf = opTime > 0 ? (failuresTotal ? opTime / failuresTotal : opTime) : null;
    return {
      id: e.id,
      name: e.name,
      unit_name: e.unit_name,
      failures: Number(e.failures),
      repairs,
      repair_hours: repairHours,
      mttr,
      mtbf,
      availability: mtbf === null ? null : mtbf / (mtbf + mttr),
      work_orders: Number(e.work_orders),
      parts_cost: Number(e.parts_cost),
    };
  });

  return {
    period: { from, to, unit_id: unitId || null },
    work_orders: {
      total: osRows.reduce((s, r) => s + Number(r.n), 0),
      by_type: count('tipo'),
      by_status: count('status'),
      by_priority: count('prioridade'),
      concluded_in_period: Number(resolution.n),
      avg_resolution_days: resolution.avg_days === null ? null : Number(resolution.avg_days),
      open_now: Number(backlog.n),
    },
    preventive: {
      scheduled,
      completed,
      compliance: scheduled ? completed / scheduled : null,
      overdue_plans: Number(overduePlans.n),
    },
    costs: {
      parts_total: partsByMonth.reduce((s, r) => s + Number(r.cost), 0),
      by_month: partsByMonth.map((r) => ({ month: r.month, cost: Number(r.cost) })),
    },
    equipments: equipmentRows,
  };
};

/** Linha do tempo de um equipamento no período: O.S., falhas, reparos e peças. */
const buildEquipmentHistory = async (tenantId, equipmentId, { from, to }) => {
  const [equipment] = await query(
    `SELECT e.id, e.name, e.type, e.model, e.serie, e.total_op_time, e.data_inicio, u.name AS unit_name
     FROM equipments e LEFT JOIN units u ON u.id = e.unit_id WHERE e.id = ? AND e.tenant_id = ?`,
    [equipmentId, tenantId]
  );
  if (!equipment) return null;

  const [workOrders, failures, repairs, parts] = await Promise.all([
    query(
      `SELECT id, titulo, tipo, prioridade, status, responsavel, data_criacao, data_conclusao, tempo_reparo FROM work_orders
       WHERE equipment_id = ? AND data_criacao BETWEEN ? AND ? ORDER BY data_criacao, id`,
      [equipmentId, from, to]
    ),
    query('SELECT id, descricao, tempo_operacao, data_falha FROM failures WHERE equipment_id = ? AND data_falha BETWEEN ? AND ? ORDER BY data_falha, id', [equipmentId, from, to]),
    query('SELECT id, tipo, tempo_reparo, data_reparo, work_order_id FROM repairs WHERE equipment_id = ? AND data_reparo BETWEEN ? AND ? ORDER BY data_reparo, id', [equipmentId, from, to]),
    query(
      `SELECT pt.work_order_id, pt.item_name, pt.quantity, pt.unit_price, DATE(pt.created_at) AS date
       FROM work_order_parts pt JOIN work_orders w ON w.id = pt.work_order_id
       WHERE w.equipment_id = ? AND DATE(pt.created_at) BETWEEN ? AND ? ORDER BY pt.created_at, pt.id`,
      [equipmentId, from, to]
    ),
  ]);

  const dateOf = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
  const events = [
    ...workOrders.map((w) => ({ date: dateOf(w.data_criacao), kind: 'os', title: `O.S. #${w.id}: ${w.titulo}`, detail: `${w.tipo} · ${w.prioridade} · ${w.status}${w.responsavel ? ` · ${w.responsavel}` : ''}`, ref: w.id })),
    ...failures.map((f) => ({ date: dateOf(f.data_falha), kind: 'falha', title: 'Falha registrada', detail: f.descricao || '', ref: f.id })),
    ...repairs.map((r) => ({ date: dateOf(r.data_reparo), kind: 'reparo', title: `Reparo (${r.tipo})`, detail: `${Number(r.tempo_reparo)} h${r.work_order_id ? ` · O.S. #${r.work_order_id}` : ''}`, ref: r.id })),
    ...parts.map((pt) => ({ date: dateOf(pt.date), kind: 'peca', title: `Peça: ${pt.item_name}`, detail: `${pt.quantity} × R$ ${Number(pt.unit_price).toFixed(2).replace('.', ',')} · O.S. #${pt.work_order_id}`, ref: pt.work_order_id })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const repairHours = repairs.reduce((s, r) => s + Number(r.tempo_reparo), 0);
  return {
    equipment,
    period: { from, to },
    summary: {
      work_orders: workOrders.length,
      failures: failures.length,
      repairs: repairs.length,
      repair_hours: repairHours,
      mttr: repairs.length ? repairHours / repairs.length : 0,
      parts_cost: parts.reduce((s, pt) => s + pt.quantity * Number(pt.unit_price), 0),
    },
    events,
  };
};

module.exports = { buildOverview, buildEquipmentHistory };
