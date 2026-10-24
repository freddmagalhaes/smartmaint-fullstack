import { Suspense, useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth, ROLES } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import {
  LayoutDashboard,
  Settings,
  LogOut,
  User,
  Menu,
  X,
  Cpu,
  AlertTriangle,
  Activity,
  Calculator,
  ShieldCheck,
  Building2,
  ClipboardList,
  ArrowLeft,
  Package,
  CalendarCheck,
  Factory
} from 'lucide-react';
import logo from '../assets/logo.png';
import { PageLoader } from './ProtectedRoute';
import ErrorBoundary from './ErrorBoundary';

const { ROOT, BACKOFFICE, ADMIN, MANAGER, USER } = ROLES;

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard, roles: [ROOT, BACKOFFICE, ADMIN, MANAGER] },
  { label: 'Ordens de Serviço', path: '/work-orders', icon: ClipboardList, roles: [ROOT, BACKOFFICE, ADMIN, MANAGER, USER] },
  { label: 'Equipamentos', path: '/equipments', icon: Cpu, roles: [ROOT, BACKOFFICE, ADMIN, MANAGER] },
  { label: 'Falhas & Reparos', path: '/failures', icon: AlertTriangle, roles: [ROOT, BACKOFFICE, ADMIN, MANAGER] },
  { label: 'Análise FMEA', path: '/fmea', icon: Activity, roles: [ROOT, BACKOFFICE, ADMIN] },
  { label: 'Simulador R(t)', path: '/simulator', icon: Calculator, roles: [ROOT, BACKOFFICE, ADMIN, MANAGER] },
  { label: 'Planos Preventivos', path: '/preventive', icon: CalendarCheck, roles: [ROOT, BACKOFFICE, ADMIN, MANAGER] },
  { label: 'Gestão de Estoque', path: '/inventory', icon: Package, roles: [ROOT, BACKOFFICE, ADMIN, MANAGER] },
  { label: 'Configurações', path: '/settings', icon: Settings, roles: [ROOT, BACKOFFICE, ADMIN, MANAGER, USER] },
];

const Layout = ({ children }) => {
  // Desktop: menu expandido/recolhido. Celular: menu lateral sobreposto, fechado por padrão.
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const { user, logout, hasRole, isBackoffice, activeTenant, tenants, switchTenant } = useAuth();
  const { units, activeUnit, setActiveUnit } = useData();
  const navigate = useNavigate();
  const location = useLocation();

  const tenantName = tenants.find(t => t.id === activeTenant)?.name || user?.company;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const toggleMenu = () => {
    if (window.matchMedia('(max-width: 900px)').matches) setIsMobileOpen(!isMobileOpen);
    else setIsCollapsed(!isCollapsed);
  };

  const sidebarClass = ['app-sidebar', isCollapsed && 'is-collapsed', isMobileOpen && 'is-open'].filter(Boolean).join(' ');

  return (
    <div className="app-shell">
      {isMobileOpen && <div className="app-sidebar-backdrop" onClick={() => setIsMobileOpen(false)} />}

      <aside className={sidebarClass}>
        <div className="app-sidebar-header">
          <div style={{ width: '32px', height: '32px', overflow: 'hidden', borderRadius: '4px', flexShrink: 0 }}>
            <img src={logo} alt="SmartMaint" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <span className="app-brand">SmartMaint</span>
          <button className="app-sidebar-close" onClick={() => setIsMobileOpen(false)} aria-label="Fechar menu">
            <X size={20} />
          </button>
        </div>

        <nav className="app-nav">
          {NAV_ITEMS.filter((item) => hasRole(item.roles)).map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                title={item.label}
                className={`app-nav-item${isActive ? ' is-active' : ''}`}
                onClick={() => setIsMobileOpen(false)}
              >
                <item.icon size={20} />
                <span className="app-nav-label">{item.label}</span>
              </Link>
            );
          })}

          {/* Link para Backoffice - Root e Suporte */}
          {isBackoffice && (
            <Link to="/backoffice" title="Painel Backoffice" className="app-nav-item is-backoffice" onClick={() => setIsMobileOpen(false)}>
              <ShieldCheck size={20} />
              <span className="app-nav-label">Painel Backoffice</span>
            </Link>
          )}
        </nav>

        <div className="app-sidebar-footer">
          <button onClick={handleLogout} className="app-nav-item" title="Sair">
            <LogOut size={20} />
            <span className="app-nav-label">Sair</span>
          </button>
        </div>
      </aside>

      <main className="app-main">
        {/* Banner de acesso do backoffice aos dados de um cliente */}
        {isBackoffice && activeTenant && (
          <div className="app-impersonation">
            <ShieldCheck size={16} />
            <span>Visualizando dados de: <strong>{tenantName}</strong></span>
            <Link to="/backoffice" className="app-impersonation-link">
              <ArrowLeft size={14} /> Voltar ao Backoffice
            </Link>
          </div>
        )}

        <header className="app-header">
          <button onClick={toggleMenu} className="app-menu-btn" aria-label="Abrir ou fechar menu">
            <Menu size={20} />
          </button>

          <div className="app-header-right">
            {isBackoffice ? (
              <div className="app-tenant-selector">
                <Building2 size={16} color="var(--primary)" />
                <select value={activeTenant || ''} onChange={(e) => switchTenant(e.target.value)} aria-label="Cliente">
                  {tenants.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="app-company-badge">{tenantName}</div>
            )}

            {units.length > 1 && (
              <div className="app-tenant-selector">
                <Factory size={16} color="var(--primary)" />
                <select value={activeUnit || ''} onChange={(e) => setActiveUnit(e.target.value ? Number(e.target.value) : null)} aria-label="Unidade">
                  <option value="">Todas as unidades</option>
                  {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            )}

            <div className="app-user">
              <div className="app-user-text">
                <p className="app-user-name">{user?.name}</p>
                <p className="app-user-role">{user?.isMaster ? 'Root' : user?.role}</p>
              </div>
              <div className="app-avatar">
                <User size={20} color="var(--primary)" />
              </div>
            </div>
          </div>
        </header>

        <div className="app-content">
          {/* key: ao trocar de página, uma tela que quebrou volta a funcionar */}
          <ErrorBoundary key={location.pathname}>
            <Suspense fallback={<PageLoader />}>
              {children}
            </Suspense>
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
};

export default Layout;
