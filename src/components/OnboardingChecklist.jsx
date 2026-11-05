import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, Rocket, X } from 'lucide-react';
import { apiFetch, withQuery } from '../api/client';
import { useAuth, ROLES } from '../contexts/AuthContext';

/**
 * Primeiros passos do cliente novo, no Dashboard do Administrador. O progresso vem dos dados
 * reais (equipamentos, preventivas, O.S...). Some quando tudo estiver feito ou se for ocultado.
 */
const OnboardingChecklist = () => {
  const { user, activeTenant } = useAuth();
  const [state, setState] = useState(null);
  const isAdmin = user?.role === ROLES.ADMIN;

  useEffect(() => {
    if (!isAdmin || !activeTenant) return;
    let cancelled = false;
    apiFetch(withQuery('/api/onboarding', { tenant_id: activeTenant }))
      .then((data) => { if (!cancelled) setState(data); })
      .catch(() => { /* o guia é opcional: falha não atrapalha o Dashboard */ });
    return () => { cancelled = true; };
  }, [isAdmin, activeTenant]);

  if (!state || state.dismissed || state.completed === state.total) return null;

  const dismiss = async () => {
    setState({ ...state, dismissed: true });
    await apiFetch(withQuery('/api/onboarding/dismiss', { tenant_id: activeTenant }), { method: 'POST', body: {} }).catch(() => {});
  };

  const pct = Math.round((state.completed / state.total) * 100);
  const next = state.steps.find((s) => !s.done);

  return (
    <section className="premium-card fade-in" style={styles.card} aria-label="Primeiros passos">
      <div style={styles.header}>
        <div style={styles.titleRow}>
          <Rocket size={22} color="var(--primary)" />
          <div>
            <h2 style={styles.title}>Primeiros passos</h2>
            <p style={styles.muted}>{state.completed} de {state.total} concluídos. Próximo: {next.label.toLowerCase()}.</p>
          </div>
        </div>
        <button style={styles.close} onClick={dismiss} title="Ocultar guia" aria-label="Ocultar guia de primeiros passos"><X size={18} /></button>
      </div>
      <div style={styles.bar} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso">
        <div style={{ ...styles.fill, width: `${pct}%` }} />
      </div>
      <ol style={styles.list}>
        {state.steps.map((step) => (
          <li key={step.id}>
            <Link to={step.path} style={{ ...styles.step, ...(step.done ? styles.done : {}) }}>
              {step.done ? <CheckCircle2 size={20} color="var(--success)" /> : <Circle size={20} color="var(--border)" />}
              <span>
                <strong style={{ textDecoration: step.done ? 'line-through' : 'none' }}>{step.label}</strong>
                {!step.done && <span style={styles.hint}>{step.hint}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
};

const styles = {
  card: { padding: '20px 24px', marginBottom: '24px', background: 'white', borderLeft: '4px solid var(--primary)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' },
  titleRow: { display: 'flex', gap: '12px', alignItems: 'flex-start' },
  title: { fontSize: '17px', fontWeight: 700 },
  muted: { fontSize: '13px', color: 'var(--text-muted)' },
  close: { background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' },
  bar: { height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden', margin: '14px 0' },
  fill: { height: '100%', background: 'var(--success)', borderRadius: '3px', transition: 'width 0.3s' },
  list: { listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '8px' },
  step: { display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', color: 'var(--text-main)', textDecoration: 'none', fontSize: '14px', height: '100%' },
  done: { background: '#f8fafc', color: 'var(--text-muted)' },
  hint: { display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', fontWeight: 400 },
};

export default OnboardingChecklist;
