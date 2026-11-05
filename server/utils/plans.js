// Catálogo de planos. null = ilimitado. Mantenha em sincronia com a tabela de preços publicada.
// price: valores em reais. `annual` é o TOTAL cobrado por ano (10/12 do mensal x 12 = "2 meses grátis").
// Corporativo não tem preço: é contratado sob consulta (não pode ser assinado pelo autoatendimento).
const PLANS = {
  Essencial: { assets: 50, users: 3, price: { monthly: 297, annual: 2964 }, features: { fmea: false, simulator: false, import: false } },
  Profissional: { assets: 300, users: 10, price: { monthly: 697, annual: 6972 }, features: { fmea: true, simulator: true, import: true } },
  Industrial: { assets: 1000, users: 30, price: { monthly: 1697, annual: 16968 }, features: { fmea: true, simulator: true, import: true } },
  Corporativo: { assets: null, users: null, price: null, features: { fmea: true, simulator: true, import: true } },
};

const CYCLES = ['mensal', 'anual'];
const PURCHASABLE_PLANS = Object.keys(PLANS).filter((n) => PLANS[n].price);

// Valor em centavos de um plano/ciclo; null se o plano não é vendido pelo autoatendimento ou o ciclo é inválido
const priceCents = (plan, cycle) => {
  const p = PLANS[plan] && PLANS[plan].price;
  if (!p || !CYCLES.includes(cycle)) return null;
  return (cycle === 'anual' ? p.annual : p.monthly) * 100;
};

// Nomes antigos (antes da tabela de preços atual) continuam funcionando
const ALIASES = { Starter: 'Essencial', Pro: 'Profissional', Enterprise: 'Corporativo' };

const PLAN_NAMES = Object.keys(PLANS);
const DEFAULT_PLAN = 'Profissional';

const normalizePlan = (name) => {
  if (PLANS[name]) return name;
  if (ALIASES[name]) return ALIASES[name];
  return 'Essencial'; // desconhecido/nulo: o mais restritivo
};

const isValidPlan = (name) => Boolean(PLANS[name] || ALIASES[name]);

// Limite efetivo = base do plano + excedentes contratados (extra_assets / extra_users)
const getLimits = (tenant) => {
  const plan = normalizePlan(tenant.plan_type);
  const def = PLANS[plan];
  return {
    plan,
    assets: def.assets === null ? null : def.assets + Number(tenant.extra_assets || 0),
    users: def.users === null ? null : def.users + Number(tenant.extra_users || 0),
    features: def.features,
  };
};

module.exports = { PLANS, PLAN_NAMES, PURCHASABLE_PLANS, CYCLES, DEFAULT_PLAN, normalizePlan, isValidPlan, getLimits, priceCents };
