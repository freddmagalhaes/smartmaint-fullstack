import { Lock } from 'lucide-react';
import { usePlan, hasFeature } from '../contexts/PlanContext';

const NOMES = { fmea: 'Análise FMEA', simulator: 'Simulador de Confiabilidade R(t)' };

/** Renderiza a página só se o plano inclui o recurso; senão mostra um convite ao upgrade. */
const FeatureGate = ({ feature, children }) => {
  const plan = usePlan();
  if (hasFeature(plan, feature)) return children;

  return (
    <div className="premium-card fade-in" style={{ maxWidth: '520px', margin: '64px auto', padding: '40px', textAlign: 'center' }}>
      <Lock size={32} color="var(--primary)" style={{ marginBottom: '12px' }} />
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>{NOMES[feature] || 'Recurso'} não está no seu plano</h2>
      <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
        Seu plano atual (<strong>{plan.plan}</strong>) não inclui este recurso. Faça upgrade para o plano
        {' '}<strong>Profissional</strong> ou superior para liberá-lo. Fale com o suporte para contratar.
      </p>
    </div>
  );
};

export default FeatureGate;
