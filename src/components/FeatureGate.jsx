import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useAuth, ROLES } from '../contexts/AuthContext';
import { usePlanFeatures, planHas } from '../contexts/PlanFeaturesContext';

const NAMES = { fmea: 'Análise FMEA', simulator: 'Simulador de confiabilidade R(t)', import: 'Importação por planilha' };

/** Mostra a página só se o plano inclui o recurso; senão, um convite ao upgrade. */
const FeatureGate = ({ feature, children }) => {
  const plan = usePlanFeatures();
  const { user } = useAuth();
  if (planHas(plan, feature)) return children;

  const canUpgrade = [ROLES.ADMIN, ROLES.ROOT].includes(user?.role) || user?.isMaster;
  return (
    <div className="premium-card fade-in" style={{ maxWidth: '520px', margin: '64px auto', padding: '40px', textAlign: 'center' }}>
      <Lock size={32} color="var(--primary)" style={{ marginBottom: '12px' }} />
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>{NAMES[feature] || 'Recurso'} não está no seu plano</h2>
      <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '16px' }}>
        O plano {plan.planName ? <strong>{plan.planName}</strong> : 'atual'} não inclui este recurso. Faça upgrade para o plano <strong>Profissional</strong> ou superior para liberá-lo.
      </p>
      {canUpgrade
        ? <Link to="/settings?tab=billing" className="btn-primary" style={{ display: 'inline-flex' }}>Ver planos</Link>
        : <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Peça ao administrador da empresa para trocar de plano.</p>}
    </div>
  );
};

export default FeatureGate;
