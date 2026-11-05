import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Aviso de período de teste: aparece só para clientes cujo tenant está em Trial. */
const TrialBanner = () => {
  const { user, activeTenant, tenants } = useAuth();
  if (!user || user.isMaster) return null;

  const tenant = Array.isArray(tenants) ? tenants.find((t) => t.id === activeTenant) : null;
  if (!tenant || tenant.status !== 'Trial' || !tenant.trial_ends_at) return null;

  const daysLeft = Math.max(0, Math.ceil((new Date(tenant.trial_ends_at) - new Date()) / DAY_MS));
  const urgent = daysLeft <= 3;
  const text = daysLeft === 0
    ? 'Seu período de teste termina hoje.'
    : `Período de teste: ${daysLeft} ${daysLeft === 1 ? 'dia restante' : 'dias restantes'}.`;

  return (
    <div
      role="status"
      style={{
        background: urgent ? '#fef3c7' : '#dbeafe',
        color: urgent ? '#92400e' : '#1e3a8a',
        padding: '10px 16px',
        borderRadius: '8px',
        fontSize: '13px',
        fontWeight: 600,
        marginBottom: '16px',
      }}
    >
      {text}{' '}
      {['Dono', 'Administrador'].includes(user.role)
        ? <Link to="/settings" style={{ textDecoration: 'underline' }}>Assinar um plano</Link>
        : 'Peça ao administrador da empresa para assinar um plano.'}
    </div>
  );
};

export default TrialBanner;
