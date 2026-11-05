import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, ROLES } from '../contexts/AuthContext';

export const PageLoader = () => (
  <div className="flex-center" style={{ height: '60vh' }}>
    <div className="animate-spin" style={{
      width: '40px',
      height: '40px',
      border: '4px solid var(--border)',
      borderTopColor: 'var(--primary)',
      borderRadius: '50%'
    }}></div>
  </div>
);

/** Página inicial de cada perfil. */
export const homePathFor = (user, isBackoffice, activeTenant) => {
  if (isBackoffice && !activeTenant) return '/backoffice';
  if (!isBackoffice && user?.tenant_status === 'Pendente') return '/settings?tab=billing';
  if (user?.role === ROLES.USER) return '/work-orders';
  return '/';
};

export const HomeRedirect = () => {
  const { user, isBackoffice, activeTenant } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={homePathFor(user, isBackoffice, activeTenant)} replace />;
};

/**
 * Protege rotas por perfil. Páginas operacionais exigem um cliente ativo: o backoffice
 * sem cliente selecionado é levado ao painel para escolher um.
 */
const ProtectedRoute = ({ children, allowedRoles, requireTenant = true }) => {
  const { user, loading, hasRole, isBackoffice, activeTenant } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoader />;

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireTenant && !activeTenant) {
    return <Navigate to={isBackoffice ? '/backoffice' : '/login'} replace />;
  }

  // Conta ainda sem assinatura: só a tela de faturamento (o backend aplica a mesma regra)
  if (!isBackoffice && user.tenant_status === 'Pendente' && location.pathname !== '/settings') {
    return <Navigate to="/settings?tab=billing" replace />;
  }

  if (allowedRoles && !hasRole(allowedRoles)) {
    const home = homePathFor(user, isBackoffice, activeTenant);
    // Evita loop de redirecionamento quando a própria página inicial não é permitida
    return home === location.pathname ? <Navigate to="/login" replace /> : <Navigate to={home} replace />;
  }

  return children;
};

export default ProtectedRoute;
