import { useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import { brl } from '../hooks/useBilling';

/** Escolha de plano e ciclo. Os valores vêm do servidor; o clique leva ao checkout seguro do Stripe. */
const PlanPicker = ({ billing }) => {
  const { data, busy, subscribe } = billing;
  const [cycle, setCycle] = useState('anual');
  if (!data) return null;

  if (!data.can_manage) {
    return <p style={styles.muted}>Apenas administradores da empresa podem contratar ou alterar a assinatura.</p>;
  }

  return (
    <div>
      <div style={styles.toggle} role="group" aria-label="Ciclo de cobrança">
        {[['mensal', 'Mensal'], ['anual', 'Anual · 2 meses grátis']].map(([value, label]) => (
          <button key={value} type="button" onClick={() => setCycle(value)} aria-pressed={cycle === value}
            style={{ ...styles.toggleBtn, ...(cycle === value ? styles.toggleOn : {}) }}>
            {label}
          </button>
        ))}
      </div>

      <div style={styles.grid}>
        {data.available_plans.map((p) => (
          <div key={p.name} style={{ ...styles.card, ...(p.name === 'Profissional' ? styles.featured : {}) }}>
            <strong style={{ fontSize: '16px' }}>{p.name}</strong>
            <div>
              <span style={{ fontSize: '26px', fontWeight: 800 }}>R$ {brl(cycle === 'anual' ? p.annual_monthly_equivalent : p.monthly)}</span>
              <span style={styles.muted}>/mês</span>
              {cycle === 'anual' && <div style={{ ...styles.muted, fontSize: '12px' }}>cobrado R$ {brl(p.annual_total)} por ano</div>}
            </div>
            <ul style={styles.list}>
              <li><Check size={14} /> Até {brl(p.assets)} ativos</li>
              <li><Check size={14} /> {p.users} usuários</li>
              {p.name !== 'Essencial' && <li><Check size={14} /> FMEA, simulador e importação</li>}
            </ul>
            <button type="button" className="btn-primary" disabled={busy} onClick={() => subscribe(p.name, cycle)} style={{ justifyContent: 'center' }}>
              {busy ? <Loader2 className="animate-spin" size={16} /> : null} Assinar {p.name}
            </button>
          </div>
        ))}
      </div>
      <p style={{ ...styles.muted, fontSize: '12px', marginTop: '12px' }}>
        Pagamento com cartão de crédito, processado pelo Stripe. Renovação automática; você pode cancelar quando quiser pelo portal.
        Precisa de mais ativos ou usuários, ou do plano Corporativo? Fale com o suporte.
      </p>
    </div>
  );
};

const styles = {
  muted: { fontSize: '13px', color: 'var(--text-muted)' },
  toggle: { display: 'inline-flex', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px' },
  toggleBtn: { padding: '8px 14px', fontSize: '13px', fontWeight: 600, background: 'white', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' },
  toggleOn: { background: 'var(--primary)', color: 'white' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' },
  card: { border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', background: 'white' },
  featured: { borderColor: 'var(--primary)', boxShadow: '0 4px 14px rgba(30, 58, 138, 0.12)' },
  list: { listStyle: 'none', padding: 0, margin: 0, fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '4px', color: 'var(--text-main)' },
};

export default PlanPicker;
