import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { CreditCard, FileText, QrCode, Repeat, ExternalLink } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch, withQuery } from '../../api/client';
import { formatDate, formatCurrency } from '../../utils/format';

const METHODS = {
  card: { label: 'Cartão de crédito', desc: 'Cobrança automática todo mês', icon: CreditCard },
  pix_automatico: { label: 'Pix Automático', desc: 'Autorize uma vez no app do banco; cobrança automática todo mês', icon: Repeat },
  boleto: { label: 'Boleto', desc: 'Boleto enviado todo mês por e-mail, compensa em até 3 dias úteis', icon: FileText },
  pix: { label: 'Pix', desc: 'Cobrança Pix (QR Code) enviada todo mês por e-mail', icon: QrCode },
};
const TRIAL_METHODS = ['card', 'pix_automatico'];

const limitText = (n, singular, plural) => (n === null || n === undefined ? `${plural} ilimitados` : `${n} ${n === 1 ? singular : plural}`);

const STATUS_LABELS = {
  trialing: 'Em teste grátis',
  active: 'Ativa',
  past_due: 'Pagamento pendente',
  unpaid: 'Pagamento pendente',
  incomplete: 'Aguardando pagamento',
  canceled: 'Cancelada',
};

/** Assinatura do SmartMaint: plano, forma de pagamento, teste grátis e faturas. */
const BillingTab = () => {
  const { activeTenant, refreshTenants, refreshMe, user, isBackoffice } = useAuth();
  const isPending = !isBackoffice && user?.tenant_status === 'Pendente';
  const [searchParams] = useSearchParams();
  const [subscription, setSubscription] = useState(null);
  const [plans, setPlans] = useState([]);
  const [usage, setUsage] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [choice, setChoice] = useState({ plan_id: '', method: 'card' });
  const [busy, setBusy] = useState(null);

  const scoped = useCallback((path) => withQuery(path, { tenant_id: activeTenant }), [activeTenant]);

  const load = useCallback(async () => {
    if (!activeTenant) return;
    try {
      const [sub, planList, invoiceList] = await Promise.all([
        apiFetch(scoped('/api/billing/subscription')),
        apiFetch('/api/plans'),
        apiFetch(scoped('/api/billing/invoices')),
      ]);
      setSubscription(sub);
      // Assinatura ou pagamento podem ter mudado o status do cliente (ex.: Pendente → Trial)
      if (!isBackoffice) refreshMe();
      setPlans(planList.filter((p) => p.active));
      setInvoices(invoiceList);
      setChoice((c) => ({ plan_id: c.plan_id || sub.plan_id, method: sub.methods.includes(c.method) ? c.method : sub.methods[0] }));
    } catch (err) {
      toast.error(err.message);
    }
    apiFetch(scoped('/api/billing/usage')).then(setUsage).catch(() => setUsage(null));
  }, [activeTenant, scoped, isBackoffice, refreshMe]);

  useEffect(() => { load(); }, [load]);

  // Retorno do Checkout do Stripe
  useEffect(() => {
    if (searchParams.get('subscribed')) toast.success('Assinatura registrada! A confirmação do Stripe pode levar alguns instantes.');
    if (searchParams.get('success')) toast.success('Pagamento recebido! A baixa da fatura pode levar alguns minutos (boleto: até 3 dias úteis).');
    if (searchParams.get('canceled')) toast.info('Pagamento cancelado.');
  }, [searchParams]);

  const run = async (key, action) => {
    setBusy(key);
    try {
      await action();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  const goTo = (path, body = {}) => run(path, async () => {
    const data = await apiFetch(scoped(path), { method: 'POST', body });
    window.location.href = data.url;
  });

  const subscribe = () => run('subscribe', async () => {
    const data = await apiFetch(scoped('/api/billing/subscription'), { method: 'POST', body: choice });
    if (data.url) {
      window.location.href = data.url;
      return;
    }
    toast.success('Assinatura registrada! A primeira fatura já está disponível para pagamento.');
    await load();
    refreshTenants?.();
  });

  const changePlan = (planId) => run('plan', async () => {
    await apiFetch(scoped('/api/billing/subscription/plan'), { method: 'PUT', body: { plan_id: planId } });
    toast.success('Plano alterado.');
    await load();
    refreshTenants?.();
  });

  const cancel = () => {
    if (!window.confirm('Cancelar a assinatura? O acesso continua até o fim do período já pago.')) return;
    run('cancel', async () => {
      await apiFetch(scoped('/api/billing/subscription/cancel'), { method: 'POST', body: {} });
      toast.success('Cancelamento registrado.');
      await load();
    });
  };

  if (!subscription) return <p style={styles.muted}>Carregando...</p>;

  const plan = plans.find((p) => p.id === (subscription.active ? subscription.plan_id : choice.plan_id));
  const openInvoices = invoices.filter((i) => i.status !== 'Paga');
  const isAutomatic = TRIAL_METHODS.includes(subscription.billing_method);
  const trialOffered = subscription.trial_available && TRIAL_METHODS.includes(choice.method);

  return (
    <div className="fade-in">
      <div style={styles.sectionHeader}>
        <h3 style={styles.title}>Plano e Faturamento</h3>
        <p style={styles.muted}>Assinatura mensal do SmartMaint e histórico de pagamentos.</p>
      </div>

      {isPending && (
        <p style={styles.info}>
          {subscription.active
            ? 'Assinatura registrada. O acesso completo é liberado assim que o primeiro pagamento for confirmado (boleto: até 3 dias úteis).'
            : 'Bem-vindo ao SmartMaint! Escolha um plano e a forma de pagamento para liberar o acesso ao sistema.'}
        </p>
      )}

      {!subscription.online_payments && (
        <p style={styles.notice}>Pagamento online indisponível no momento. Entre em contato com o suporte para regularizar sua assinatura.</p>
      )}

      {subscription.active ? (
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <h4 style={styles.planTitle}>Plano {subscription.plan_name}</h4>
              <p style={styles.muted}>
                {formatCurrency(subscription.amount)}/mês · {METHODS[subscription.billing_method]?.label || subscription.billing_method}
              </p>
            </div>
            <span style={{ ...styles.badge, background: subscription.subscription_status === 'past_due' ? 'var(--danger)' : 'var(--success)' }}>
              {STATUS_LABELS[subscription.subscription_status] || 'Ativa'}
            </span>
          </div>

          {subscription.subscription_status === 'trialing' && subscription.trial_ends_at && (
            <p style={styles.info}>Teste grátis até {formatDate(subscription.trial_ends_at)}. Depois disso, a mensalidade é cobrada automaticamente.</p>
          )}
          {subscription.cancel_at_period_end && (
            <p style={styles.notice}>Cancelamento agendado: o acesso continua até {formatDate(subscription.current_period_end)}.</p>
          )}
          {isAutomatic && !subscription.cancel_at_period_end && subscription.current_period_end && subscription.subscription_status !== 'trialing' && (
            <p style={styles.muted}>Próxima cobrança em {formatDate(subscription.current_period_end)}.</p>
          )}

          <Usage usage={usage} />

          <div className="stack-mobile" style={styles.actions}>
            <label style={styles.inline}>
              <span style={styles.label}>Trocar plano</span>
              <select style={styles.select} value={subscription.plan_id} disabled={busy === 'plan'} onChange={(e) => changePlan(e.target.value)} aria-label="Trocar plano">
                {plans.map((p) => (
                  <option key={p.id} value={p.id} disabled={!(Number(p.price_monthly) > 0) && p.id !== subscription.plan_id}>
                    {p.name} · {Number(p.price_monthly) > 0 ? `${formatCurrency(p.price_monthly)}/mês` : 'sob consulta'}
                  </option>
                ))}
              </select>
            </label>
            {isAutomatic && (
              <button className="btn-secondary" disabled={!!busy} onClick={() => goTo('/api/billing/portal')}>
                <ExternalLink size={16} /> Gerenciar pagamento
              </button>
            )}
            {!subscription.cancel_at_period_end && (
              <button style={styles.linkDanger} disabled={!!busy} onClick={cancel}>Cancelar assinatura</button>
            )}
          </div>
        </div>
      ) : (
        <div style={styles.card}>
          <h4 style={styles.planTitle}>Escolha seu plano</h4>
          <div style={styles.planGrid}>
            {plans.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setChoice({ ...choice, plan_id: p.id })}
                style={{ ...styles.option, ...(choice.plan_id === p.id ? styles.optionActive : {}) }}
                aria-pressed={choice.plan_id === p.id}
              >
                <strong>{p.name}</strong>
                <span style={styles.price}>{Number(p.price_monthly) > 0 ? `${formatCurrency(p.price_monthly)}/mês` : 'Sob consulta'}</span>
                <span style={styles.small}>
                  {limitText(p.max_users, 'usuário', 'usuários')} · {limitText(p.max_equipments, 'equipamento', 'equipamentos')} · {limitText(p.max_units, 'unidade', 'unidades')}
                </span>
              </button>
            ))}
          </div>

          <h4 style={{ ...styles.planTitle, marginTop: '24px' }}>Forma de pagamento</h4>
          <div style={styles.methodGrid}>
            {subscription.methods.map((m) => {
              const { label, desc, icon: Icon } = METHODS[m];
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setChoice({ ...choice, method: m })}
                  style={{ ...styles.option, ...(choice.method === m ? styles.optionActive : {}) }}
                  aria-pressed={choice.method === m}
                >
                  <span style={styles.methodTitle}><Icon size={18} /> {label}</span>
                  <span style={styles.small}>{desc}</span>
                  {subscription.trial_available && TRIAL_METHODS.includes(m) && (
                    <span style={styles.trialTag}>{subscription.trial_days} dias grátis</span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            className="btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: '24px' }}
            disabled={!!busy || !subscription.online_payments || !plan || !(Number(plan.price_monthly) > 0)}
            onClick={subscribe}
          >
            {busy === 'subscribe' ? 'Aguarde...' : trialOffered ? `Começar teste grátis de ${subscription.trial_days} dias` : 'Assinar'}
          </button>
          {trialOffered && (
            <p style={{ ...styles.small, textAlign: 'center', marginTop: '8px' }}>
              Nada é cobrado durante o teste. Cancele quando quiser antes do fim do período.
            </p>
          )}
        </div>
      )}

      <div style={{ marginTop: '32px' }}>
        <h4 style={{ ...styles.planTitle, marginBottom: '12px' }}>Faturas</h4>
        {invoices.length === 0 ? (
          <p style={styles.muted}>Nenhuma fatura emitida.</p>
        ) : (
          <div className="table-wrap">
            <table style={styles.table}>
              <thead>
                <tr style={styles.theadRow}>
                  <th style={styles.th}>Referência</th>
                  <th style={styles.th}>Vencimento</th>
                  <th style={styles.th}>Valor</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={styles.td}>{inv.mes_ref}</td>
                    <td style={styles.td}>{formatDate(inv.vencimento)}</td>
                    <td style={styles.td}>{formatCurrency(inv.valor)}</td>
                    <td style={{ ...styles.td, fontWeight: 700, color: inv.status === 'Paga' ? 'var(--success)' : inv.status === 'Atrasada' ? 'var(--danger)' : 'var(--warning)' }}>{inv.status}</td>
                    <td style={styles.td}>
                      {inv.status !== 'Paga' && subscription.online_payments && (
                        <button className="btn-primary" style={styles.payBtn} disabled={!!busy} onClick={() => goTo('/api/billing/checkout', { invoice_id: inv.id })}>
                          Pagar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {openInvoices.length > 0 && isAutomatic && (
          <p style={{ ...styles.small, marginTop: '8px' }}>O cartão é cobrado de novo automaticamente nos próximos dias. Para trocar o cartão, use “Gerenciar pagamento”.</p>
        )}
      </div>
    </div>
  );
};

const Usage = ({ usage }) => {
  if (!usage) return null;
  return (
    <div style={styles.usageGrid}>
      {[['users', 'Usuários'], ['equipments', 'Equipamentos'], ['units', 'Unidades']].map(([key, label]) => {
        const { used, limit } = usage.usage[key];
        const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
        return (
          <div key={key}>
            <p style={styles.usageLabel}>{label}: <strong>{used}</strong>{limit !== null ? ` de ${limit}` : ' (ilimitado)'}</p>
            {limit !== null && (
              <div style={styles.usageBar} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
                <div style={{ ...styles.usageFill, width: `${pct}%`, background: pct >= 90 ? 'var(--danger)' : 'var(--primary)' }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const styles = {
  sectionHeader: { marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid var(--border)' },
  title: { fontSize: '18px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '4px' },
  muted: { fontSize: '14px', color: 'var(--text-muted)' },
  small: { fontSize: '12px', color: 'var(--text-muted)' },
  label: { fontSize: '13px', fontWeight: '600', color: 'var(--text-main)' },
  notice: { fontSize: '13px', background: '#fef3c7', color: '#92400e', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px' },
  info: { fontSize: '13px', background: '#dbeafe', color: '#1e3a8a', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px' },
  card: { background: '#f8fafc', borderRadius: '16px', padding: '24px', border: '1px solid var(--border)' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' },
  planTitle: { fontSize: '16px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '12px' },
  badge: { color: 'white', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', whiteSpace: 'nowrap' },
  planGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '12px' },
  methodGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '12px' },
  option: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '6px', textAlign: 'left', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)', background: 'white', cursor: 'pointer', color: 'var(--text-main)' },
  optionActive: { borderColor: 'var(--primary)', boxShadow: '0 0 0 2px rgba(30, 58, 138, 0.15)' },
  price: { fontSize: '18px', fontWeight: '700', color: 'var(--primary)' },
  methodTitle: { display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600' },
  trialTag: { fontSize: '11px', fontWeight: '700', color: 'white', background: 'var(--success)', padding: '2px 8px', borderRadius: '6px' },
  actions: { display: 'flex', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap', marginTop: '8px' },
  inline: { display: 'flex', flexDirection: 'column', gap: '6px' },
  select: { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', background: 'white' },
  linkDanger: { background: 'transparent', color: 'var(--danger)', fontWeight: '600', cursor: 'pointer', padding: '10px 0' },
  usageGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: '16px', margin: '16px 0' },
  usageLabel: { fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px' },
  usageBar: { height: '6px', borderRadius: '3px', background: 'var(--border)', overflow: 'hidden' },
  usageFill: { height: '100%', borderRadius: '3px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' },
  theadRow: { textAlign: 'left', color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' },
  th: { padding: '10px 12px', fontWeight: 600 },
  td: { padding: '12px' },
  payBtn: { padding: '6px 14px', fontSize: '13px' },
};

export default BillingTab;
