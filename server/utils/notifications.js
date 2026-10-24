const db = require('../db');
const logger = require('./logger');
const { config } = require('../config');
const { sendEmail, escapeHtml } = require('./email');

// Quem recebe avisos operacionais (O.S., preventivas, estoque) e financeiros (faturas)
const OPERATIONS_ROLES = ['Administrador', 'Gerente'];
const BILLING_ROLES = ['Administrador'];

const link = (path) => `${config.frontendUrl}${path}`;

const layout = (title, body, cta) => `
  <div style="font-family: Arial, sans-serif; max-width: 560px; color: #0f172a;">
    <h2 style="color: #1e3a8a;">${escapeHtml(title)}</h2>
    ${body}
    ${cta ? `<p style="margin-top: 24px;"><a href="${escapeHtml(cta.url)}" style="padding: 10px 20px; background: #1e3a8a; color: white; text-decoration: none; border-radius: 5px;">${escapeHtml(cta.label)}</a></p>` : ''}
    <p style="margin-top: 32px; font-size: 12px; color: #64748b;">
      Você recebe este aviso por ser responsável no SmartMaint. Para parar, desative as notificações em Configurações → Meu Perfil.
    </p>
  </div>`;

/**
 * Envia um aviso por e-mail aos responsáveis do cliente, uma única vez por (tipo, referência).
 * Não interrompe quem chamou: falhas são apenas registradas no log.
 */
const notifyTenant = async (tenantId, { kind, refKey, subject, title, body, cta, roles = OPERATIONS_ROLES }) => {
  try {
    // Reserva o envio antes de mandar: duas instâncias não enviam o mesmo aviso
    const [claim] = await db.query(
      'INSERT IGNORE INTO notifications_sent (tenant_id, kind, ref_key) VALUES (?, ?, ?)',
      [tenantId, kind, String(refKey)]
    );
    if (claim.affectedRows === 0) return 0;

    const [recipients] = await db.query(
      `SELECT email FROM users WHERE tenant_id = ? AND notifications_enabled = TRUE AND role IN (${roles.map(() => '?').join(',')})`,
      [tenantId, ...roles]
    );
    const html = layout(title, body, cta);
    let sent = 0;
    for (const { email } of recipients) {
      if (await sendEmail(email, `[SmartMaint] ${subject}`, html)) sent += 1;
    }
    await db.query('UPDATE notifications_sent SET recipients = ? WHERE tenant_id = ? AND kind = ? AND ref_key = ?', [sent, tenantId, kind, String(refKey)]);
    return sent;
  } catch (err) {
    logger.error({ err, tenantId, kind }, 'falha ao enviar notificação');
    return 0;
  }
};

/** Dispara sem esperar (usado dentro de requisições, para não atrasar a resposta). */
const notifyInBackground = (tenantId, notification) => {
  notifyTenant(tenantId, notification).catch(() => {});
};

const p = (text) => `<p>${text}</p>`;

const criticalWorkOrder = (tenantId, os, equipmentName) => notifyInBackground(tenantId, {
  kind: 'os_critica',
  refKey: os.id,
  subject: `O.S. crítica aberta: ${os.titulo}`,
  title: 'Ordem de serviço crítica aberta',
  body: p(`<strong>${escapeHtml(os.titulo)}</strong>`) + p(`Equipamento: ${escapeHtml(equipmentName)}`) + (os.descricao ? p(escapeHtml(os.descricao)) : ''),
  cta: { label: 'Ver O.S.', url: link(`/work-orders?open=${os.id}`) },
});

const preventiveGenerated = (tenantId, os, plan) => notifyTenant(tenantId, {
  kind: 'preventiva_gerada',
  refKey: `${plan.id}:${plan.next_due}`,
  subject: `Preventiva programada: ${plan.title}`,
  title: 'Nova O.S. preventiva gerada',
  body: p(`<strong>${escapeHtml(plan.title)}</strong>`) + p(`Equipamento: ${escapeHtml(plan.equipment_name)}`) + p(`Vencimento: ${escapeHtml(plan.next_due)}`),
  cta: { label: 'Ver O.S.', url: link(`/work-orders?open=${os.id}`) },
});

const lowStock = (tenantId, item) => notifyInBackground(tenantId, {
  kind: 'estoque_minimo',
  // Um aviso por item por dia
  refKey: `${item.id}:${new Date().toISOString().slice(0, 10)}`,
  subject: `Estoque baixo: ${item.name}`,
  title: 'Peça abaixo do estoque mínimo',
  body: p(`<strong>${escapeHtml(item.name)}</strong>${item.sku ? ` (${escapeHtml(item.sku)})` : ''}`) + p(`Quantidade atual: ${item.quantity} · mínimo: ${item.min_quantity}`),
  cta: { label: 'Ver estoque', url: link('/inventory') },
});

const invoiceReminder = (tenantId, invoice, kind) => notifyTenant(tenantId, {
  kind: kind === 'late' ? 'fatura_atrasada' : 'fatura_vencendo',
  refKey: invoice.id,
  roles: BILLING_ROLES,
  subject: kind === 'late' ? `Fatura em atraso (${invoice.mes_ref})` : `Fatura vence em breve (${invoice.mes_ref})`,
  title: kind === 'late' ? 'Fatura em atraso' : 'Lembrete de vencimento',
  body: p(`Referência: ${escapeHtml(invoice.mes_ref)}`) + p(`Valor: R$ ${Number(invoice.valor).toFixed(2).replace('.', ',')}`) + p(`Vencimento: ${escapeHtml(invoice.vencimento)}`)
    + (kind === 'late' ? p('Para evitar o bloqueio do acesso, regularize o pagamento.') : ''),
  cta: { label: 'Pagar fatura', url: link('/settings?tab=billing') },
});

module.exports = { notifyTenant, criticalWorkOrder, preventiveGenerated, lowStock, invoiceReminder };
