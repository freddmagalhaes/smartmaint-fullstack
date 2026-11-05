const jwt = require('jsonwebtoken');
const { query } = require('./routeHelpers');

// Mensagem/código quando o acesso do tenant está bloqueado; null se liberado.
// (Backoffice não passa por aqui: só usuários de cliente.)
const checkTenantAccess = async (tenantId) => {
  const rows = await query('SELECT status, trial_ends_at FROM tenants WHERE id = ?', [tenantId]);
  if (rows.length === 0) return null;
  const { status, trial_ends_at: trialEndsAt } = rows[0];
  if (status === 'Inadimplente') {
    return { code: 'PAST_DUE', error: 'Pagamento pendente. Regularize a assinatura para voltar a usar o sistema.' };
  }
  if (status === 'Cancelado') {
    return { code: 'CANCELED', error: 'Acesso bloqueado. Entre em contato com o suporte.' };
  }
  if (status === 'Trial' && trialEndsAt && new Date(trialEndsAt) < new Date()) {
    return { code: 'TRIAL_EXPIRED', error: 'Seu período de teste terminou. Assine um plano para continuar.' };
  }
  return null;
};

const signToken = (user) =>
  jwt.sign(
    { id: user.id, tenant_id: user.tenant_id, role: user.role, is_master: user.is_master },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

// Token curto e restrito: só abre as rotas de faturamento. Emitido a administradores do cliente cujo acesso
// foi bloqueado por trial vencido ou pagamento pendente, para que consigam assinar/regularizar sem suporte.
const BILLING_CODES = ['TRIAL_EXPIRED', 'PAST_DUE'];
const BILLING_ROLES = ['Dono', 'Administrador'];
const canGetBillingToken = (blocked, user) => BILLING_CODES.includes(blocked.code) && BILLING_ROLES.includes(user.role);

const signBillingToken = (user) =>
  jwt.sign(
    { id: user.id, tenant_id: user.tenant_id, role: user.role, is_master: 0, scope: 'billing' },
    process.env.JWT_SECRET,
    { expiresIn: '30m' }
  );

module.exports = { checkTenantAccess, signToken, signBillingToken, canGetBillingToken };
