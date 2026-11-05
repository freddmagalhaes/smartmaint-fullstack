import { useAuth } from '../contexts/AuthContext';
import { useBilling, formatDate } from '../hooks/useBilling';
import PlanPicker from './PlanPicker';

// Situação da assinatura em linguagem de gente
const describe = (data) => {
  const { subscription: s, tenant_status: tenant, trial_ends_at: trialEnds } = data;
  const next = formatDate(s.current_period_end);
  const cycle = s.cycle === 'anual' ? 'anual' : 'mensal';
  if (s.status === 'active') {
    return s.cancel_at_period_end
      ? { tone: 'warn', title: 'Cancelamento agendado', text: `Você continua com acesso até ${next}. Depois disso a assinatura não será renovada.` }
      : { tone: 'ok', title: 'Assinatura ativa', text: `Plano ${data.plan} (${cycle}). Próxima cobrança em ${next}.` };
  }
  if (s.status === 'trialing') return { tone: 'ok', title: 'Assinatura contratada', text: `Plano ${data.plan} (${cycle}). A primeira cobrança será em ${next}.` };
  if (s.status === 'past_due') return { tone: 'warn', title: 'Pagamento em atraso', text: 'Não conseguimos cobrar seu cartão. Atualize a forma de pagamento para evitar a suspensão do acesso.' };
  if (s.status === 'unpaid') return { tone: 'bad', title: 'Acesso suspenso por falta de pagamento', text: 'Regularize o pagamento pelo portal para voltar a usar o sistema.' };
  if (s.status === 'canceled') return { tone: 'bad', title: 'Assinatura cancelada', text: 'Fale com o suporte para reativar.' };
  if (tenant === 'Trial') return { tone: 'info', title: 'Teste grátis', text: `Seu período de teste vai até ${formatDate(trialEnds)}. Assine agora e a cobrança só começa depois dele.` };
  return { tone: 'info', title: 'Contrato gerenciado pela equipe SmartMaint', text: `Plano ${data.plan}. Para trocar de plano ou migrar para cobrança automática, fale com o suporte.` };
};

const TONES = { ok: ['#ecfdf5', '#065f46'], info: ['#eff6ff', '#1e3a8a'], warn: ['#fffbeb', '#92400e'], bad: ['#fef2f2', '#991b1b'] };

/** Assinatura do cliente em Configurações: situação, portal do Stripe e contratação de plano. */
const SubscriptionPanel = () => {
  const { token } = useAuth();
  const billing = useBilling(token);
  const { data, loading, error, busy, openPortal } = billing;

  if (loading) return null;
  if (!data) return error ? <p role="alert" style={{ color: '#991b1b', fontSize: '13px' }}>{error}</p> : null;

  const info = describe(data);
  const [bg, fg] = TONES[info.tone];
  const sub = data.subscription;
  const canSubscribe = !sub.has_subscription && data.tenant_status === 'Trial';

  return (
    <div className="premium-card" style={{ padding: '20px', marginBottom: '24px' }}>
      <div style={{ background: bg, color: fg, borderRadius: '10px', padding: '14px 16px', marginBottom: '14px' }}>
        <strong>{info.title}</strong>
        <p style={{ margin: '4px 0 0', fontSize: '13px' }}>{info.text}</p>
      </div>

      {error && <p role="alert" style={{ color: '#991b1b', fontSize: '13px' }}>{error}</p>}

      {data.can_manage && sub.has_customer && (
        <button type="button" className="btn-primary" onClick={openPortal} disabled={busy} style={{ marginBottom: '8px' }}>
          Gerenciar assinatura e faturas
        </button>
      )}
      {canSubscribe && <PlanPicker billing={billing} />}
    </div>
  );
};

export default SubscriptionPanel;
