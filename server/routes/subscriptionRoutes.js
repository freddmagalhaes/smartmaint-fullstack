const express = require('express');
const router = express.Router();
const { query, getTenantId, isBackoffice } = require('../utils/routeHelpers');
const { handleQueryError } = require('../utils/errorHandler');
const { PLANS, PURCHASABLE_PLANS, CYCLES, normalizePlan, priceCents } = require('../utils/plans');
const { createSubscriptionCheckout, createPortalSession } = require('../utils/stripe');
const { authAllowBilling } = require('../middleware/auth');

// Quem gerencia a assinatura: administração do cliente ou backoffice. Gerente/usuário comum não.
const ADMIN_ROLES = ['Dono', 'Administrador'];
const canManageBilling = (req) => isBackoffice(req) || ADMIN_ROLES.includes(req.user.role);

// Assinaturas que já ocupam o cliente: para mudar de plano/cartão, use o portal (não abra outro checkout)
const BLOCKING_STATUSES = ['active', 'trialing', 'past_due', 'unpaid', 'paused'];
// O Stripe exige que o fim do teste esteja a pelo menos 48h; fica uma folga
const MIN_TRIAL_LEAD_SECONDS = 49 * 3600;

const loadTenant = async (id) => (await query('SELECT * FROM tenants WHERE id = ?', [id]))[0];

// Estado da assinatura + planos que podem ser contratados (preços vêm do servidor)
router.get('/billing/subscription', authAllowBilling, async (req, res) => {
  const tenantId = getTenantId(req);
  if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });
  try {
    const tenant = await loadTenant(tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant não encontrado' });
    res.json({
      plan: normalizePlan(tenant.plan_type),
      tenant_status: tenant.status,
      trial_ends_at: tenant.trial_ends_at,
      can_manage: canManageBilling(req),
      subscription: {
        status: tenant.subscription_status,
        cycle: tenant.billing_cycle,
        current_period_end: tenant.current_period_end,
        cancel_at_period_end: Boolean(tenant.cancel_at_period_end),
        has_customer: Boolean(tenant.stripe_customer_id),
        has_subscription: Boolean(tenant.stripe_subscription_id),
      },
      available_plans: PURCHASABLE_PLANS.map((name) => ({
        name,
        monthly: PLANS[name].price.monthly,
        annual_total: PLANS[name].price.annual,
        annual_monthly_equivalent: Math.round(PLANS[name].price.annual / 12),
        assets: PLANS[name].assets,
        users: PLANS[name].users,
      })),
    });
  } catch (err) { handleQueryError(res, err, 'Erro ao consultar assinatura'); }
});

// Abre o checkout de assinatura no Stripe
router.post('/billing/subscribe', authAllowBilling, async (req, res) => {
  if (!canManageBilling(req)) return res.status(403).json({ error: 'Apenas administradores podem contratar ou alterar a assinatura.' });
  const tenantId = getTenantId(req);
  if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });

  const { plan, cycle } = req.body || {};
  if (!PURCHASABLE_PLANS.includes(plan)) return res.status(400).json({ error: 'Plano inválido. O plano Corporativo é contratado sob consulta.' });
  if (!CYCLES.includes(cycle)) return res.status(400).json({ error: 'Ciclo de cobrança inválido.' });

  try {
    const tenant = await loadTenant(tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant não encontrado' });
    if (tenant.stripe_subscription_id && BLOCKING_STATUSES.includes(tenant.subscription_status)) {
      return res.status(409).json({ code: 'ALREADY_SUBSCRIBED', error: 'Já existe uma assinatura. Use "Gerenciar assinatura" para trocar de plano, atualizar o cartão ou regularizar pagamentos.' });
    }

    // Quem assina durante o teste não perde os dias que sobram: a cobrança começa quando o teste acabaria
    let trialEnd;
    if (tenant.status === 'Trial' && tenant.trial_ends_at) {
      const ts = Math.floor(new Date(tenant.trial_ends_at).getTime() / 1000);
      if (ts - Math.floor(Date.now() / 1000) >= MIN_TRIAL_LEAD_SECONDS) trialEnd = ts;
    }

    const { url } = await createSubscriptionCheckout({ tenant, plan, cycle, priceCents: priceCents(plan, cycle), trialEnd });
    res.json({ url });
  } catch (err) {
    if (err.statusCode === 503) return res.status(503).json({ error: err.message });
    handleQueryError(res, err, 'Falha ao iniciar a assinatura');
  }
});

// Portal do cliente (cartão, faturas, cancelamento)
router.post('/billing/portal', authAllowBilling, async (req, res) => {
  if (!canManageBilling(req)) return res.status(403).json({ error: 'Apenas administradores podem gerenciar a assinatura.' });
  const tenantId = getTenantId(req);
  if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });
  try {
    const tenant = await loadTenant(tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant não encontrado' });
    if (!tenant.stripe_customer_id) return res.status(400).json({ error: 'Ainda não há uma assinatura para gerenciar.' });
    const { url } = await createPortalSession(tenant.stripe_customer_id);
    res.json({ url });
  } catch (err) {
    if (err.statusCode === 503) return res.status(503).json({ error: err.message });
    handleQueryError(res, err, 'Falha ao abrir o portal de assinatura');
  }
});

module.exports = router;
