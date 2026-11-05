import { usePlan } from '../contexts/PlanContext';

const Bar = ({ label, used, limit }) => {
  const unlimited = limit === null || limit === undefined;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const color = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : 'var(--primary)';
  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span style={{ color: 'var(--text-muted)' }}>{used} / {unlimited ? 'ilimitado' : limit}</span>
      </div>
      {!unlimited && (
        <div style={{ height: '8px', borderRadius: '4px', background: '#e2e8f0' }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
          <div style={{ width: `${pct}%`, height: '100%', borderRadius: '4px', background: color }} />
        </div>
      )}
    </div>
  );
};

/** Uso do plano: ativos e usuários contra o limite contratado. */
const PlanUsage = () => {
  const { plan, limits, usage } = usePlan();
  if (!plan || !limits || !usage) return null;
  const nearLimit = (limits.assets !== null && usage.assets >= limits.assets * 0.8) || (limits.users !== null && usage.users >= limits.users * 0.8);

  return (
    <div className="premium-card" style={{ padding: '20px', marginBottom: '24px' }}>
      <p style={{ fontSize: '14px', marginBottom: '14px' }}>Uso do plano <strong>{plan}</strong></p>
      <Bar label="Ativos cadastrados" used={usage.assets} limit={limits.assets} />
      <Bar label="Usuários" used={usage.users} limit={limits.users} />
      {nearLimit && (
        <p style={{ fontSize: '12px', color: '#92400e' }}>
          Você está perto do limite. Fale com o suporte para contratar mais ativos/usuários ou mudar de plano.
        </p>
      )}
    </div>
  );
};

export default PlanUsage;
