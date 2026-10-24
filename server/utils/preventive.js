const db = require('../db');
const logger = require('./logger');
const notifications = require('./notifications');

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Gera as O.S. preventivas dos planos que vencem até hoje + antecedência (lead_days).
 * Idempotente e segura com várias instâncias: cada plano/vencimento é "reservado" com um
 * UPDATE condicional antes de criar a O.S.; quem não conseguir reservar não cria nada.
 */
const generateDueWorkOrders = async () => {
  const [plans] = await db.query(
    `SELECT p.*, e.name AS equipment_name FROM preventive_plans p
     JOIN equipments e ON e.id = p.equipment_id
     JOIN tenants t ON t.id = p.tenant_id
     WHERE p.status = 'Ativo' AND p.auto_generate = TRUE AND p.next_due IS NOT NULL
       AND p.next_due <= DATE_ADD(CURRENT_DATE, INTERVAL p.lead_days DAY)
       AND (p.last_generated_due IS NULL OR p.last_generated_due <> p.next_due)
       AND t.status NOT IN ('Inadimplente', 'Cancelado')`
  );

  let created = 0;
  for (const plan of plans) {
    try {
      const os = await db.transaction(async (q) => {
        const claim = await q(
          'UPDATE preventive_plans SET last_generated_due = next_due WHERE id = ? AND next_due = ? AND (last_generated_due IS NULL OR last_generated_due <> next_due)',
          [plan.id, plan.next_due]
        );
        if (claim.affectedRows === 0) return null;

        const result = await q(
          `INSERT INTO work_orders (tenant_id, equipment_id, preventive_plan_id, titulo, descricao, tipo, prioridade, status, data_criacao)
           VALUES (?, ?, ?, ?, ?, 'Preventiva', 'Média', 'Aberta', ?)`,
          [plan.tenant_id, plan.equipment_id, plan.id, plan.title, plan.description, today()]
        );
        await q(
          `INSERT INTO work_order_checklist (work_order_id, description, sort_order)
           SELECT ?, description, sort_order FROM preventive_checklist_items WHERE plan_id = ? ORDER BY sort_order, id`,
          [result.insertId, plan.id]
        );
        return { id: result.insertId };
      });
      if (os) {
        created += 1;
        await notifications.preventiveGenerated(plan.tenant_id, os, plan);
      }
    } catch (err) {
      logger.error({ err, planId: plan.id }, 'falha ao gerar O.S. preventiva');
    }
  }
  return { created };
};

/** Ao concluir uma O.S. de preventiva, registra a execução e recalcula o próximo vencimento. */
const onPreventiveCompleted = async (q, planId, completedOn) => {
  await q(
    'UPDATE preventive_plans SET last_executed = ?, next_due = DATE_ADD(?, INTERVAL interval_days DAY) WHERE id = ?',
    [completedOn, completedOn, planId]
  );
};

const startPreventiveScheduler = () => {
  const run = () => generateDueWorkOrders()
    .then((r) => { if (r.created) logger.info(r, 'O.S. preventivas geradas'); })
    .catch((err) => logger.error({ err }, 'falha na rotina de preventivas'));
  run();
  const timer = setInterval(run, 60 * 60 * 1000);
  timer.unref();
  return timer;
};

module.exports = { generateDueWorkOrders, onPreventiveCompleted, startPreventiveScheduler };
