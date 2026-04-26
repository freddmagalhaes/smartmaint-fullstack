import React from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth, ROLES } from '../contexts/AuthContext';
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
  ClipboardList
} from 'lucide-react';
import logo from '../assets/logo.png';

const Layout = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
  const { user, logout, hasRole, activeTenant, tenants, switchTenant } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { label: 'Dashboard', path: '/', icon: LayoutDashboard, roles: [ROLES.OWNER, ROLES.ADMIN, ROLES.USER] },
    { label: 'Ordens de Serviço', path: '/work-orders', icon: ClipboardList, roles: [ROLES.OWNER, ROLES.ADMIN, ROLES.USER] },
    { label: 'Equipamentos', path: '/equipments', icon: Cpu, roles: [ROLES.OWNER, ROLES.ADMIN, ROLES.USER] },
    { label: 'Falhas & Reparos', path: '/failures', icon: AlertTriangle, roles: [ROLES.OWNER, ROLES.ADMIN, ROLES.USER] },
    { label: 'Análise FMEA', path: '/fmea', icon: Activity, roles: [ROLES.OWNER, ROLES.ADMIN] },
    { label: 'Simulador R(t)', path: '/simulator', icon: Calculator, roles: [ROLES.OWNER, ROLES.ADMIN, ROLES.USER] },
    { label: 'Configurações', path: '/settings', icon: Settings, roles: [ROLES.OWNER, ROLES.ADMIN] },
  ];

  return (
    <div style={styles.container}>
      {/* Sidebar */}
      <aside style={{
        ...styles.sidebar,
        width: isSidebarOpen ? '260px' : '80px',
      }}>
        <div style={styles.sidebarHeader}>
          <div style={{ width: '32px', height: '32px', overflow: 'hidden', borderRadius: '4px' }}>
            <img src={logo} alt="L" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          {isSidebarOpen && <span style={styles.brandName}>SmartMaint</span>}
        </div>

        <nav style={styles.nav}>
          {navItems.map((item) => {
            if (!hasRole(item.roles)) return null;
            const isActive = location.pathname === item.path;
            
            return (
              <Link 
                key={item.path} 
                to={item.path} 
                style={{
                  ...styles.navItem,
                  background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
                  justifyContent: isSidebarOpen ? 'flex-start' : 'center',
                }}
              >
                <item.icon size={20} color={isActive ? 'white' : '#94a3b8'} />
                {isSidebarOpen && <span style={{
                  ...styles.navLabel,
                  color: isActive ? 'white' : '#94a3b8',
                  fontWeight: isActive ? '600' : '400',
                }}>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div style={styles.sidebarFooter}>
          <button onClick={handleLogout} style={{
            ...styles.navItem,
            marginTop: 'auto',
            justifyContent: isSidebarOpen ? 'flex-start' : 'center',
          }}>
            <LogOut size={20} color="#94a3b8" />
            {isSidebarOpen && <span style={{...styles.navLabel, color: '#94a3b8'}}>Sair</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main style={styles.main}>
        <header style={styles.header}>
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} style={styles.toggleBtn}>
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <div style={styles.headerRight}>
            {/* Seletor de Tenant (Master Only) */}
            {user?.isMaster && (
              <div style={styles.tenantSelector}>
                <Building2 size={16} color="var(--primary)" />
                <select 
                  value={activeTenant} 
                  onChange={(e) => switchTenant(e.target.value)}
                  style={styles.select}
                >
                  {Array.isArray(tenants) && tenants.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Nome da Empresa Atual */}
            <div style={styles.companyBadge}>
              <p style={styles.companyName}>
                {Array.isArray(tenants) ? tenants.find(t => t.id === activeTenant)?.name : (user?.company || 'Carregando...')}
              </p>
            </div>

            <div style={styles.userInfo}>
              <div style={styles.userText}>
                <p style={styles.userName}>{user?.name}</p>
                <p style={styles.userRole}>{user?.isMaster ? 'Master' : user?.role}</p>
              </div>
              <div style={styles.avatar}>
                <User size={20} color="var(--primary)" />
              </div>
            </div>
          </div>
        </header>

        <div style={styles.content}>
          {children}
        </div>
      </main>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    height: '100vh',
    overflow: 'hidden',
    background: 'var(--bg-main)',
  },
  sidebar: {
    background: 'var(--primary-dark)',
    transition: 'var(--transition)',
    display: 'flex',
    flexDirection: 'column',
    color: 'white',
    zIndex: 10,
  },
  sidebarHeader: {
    padding: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  brandName: {
    fontSize: '20px',
    fontWeight: '700',
    letterSpacing: '0.5px',
  },
  nav: {
    padding: '20px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flex: 1,
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px',
    borderRadius: '8px',
    textDecoration: 'none',
    transition: 'var(--transition)',
  },
  navLabel: {
    marginLeft: '12px',
    fontSize: '14px',
  },
  sidebarFooter: {
    padding: '20px 12px',
    borderTop: '1px solid rgba(255,255,255,0.05)',
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    height: '64px',
    background: 'white',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    zIndex: 9,
  },
  toggleBtn: {
    color: 'var(--text-muted)',
    padding: '8px',
    borderRadius: '8px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  userText: {
    textAlign: 'right',
  },
  userName: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--text-main)',
  },
  userRole: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  avatar: {
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    background: 'rgba(30, 58, 138, 0.05)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tenantSelector: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    background: '#f8fafc',
    borderRadius: '8px',
    border: '1px solid var(--border)',
  },
  select: {
    border: 'none',
    background: 'transparent',
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--primary)',
    cursor: 'pointer',
    outline: 'none',
  },
  companyBadge: {
    padding: '6px 12px',
    background: 'rgba(30, 58, 138, 0.05)',
    borderRadius: '8px',
    border: '1px solid rgba(30, 58, 138, 0.1)',
  },
  companyName: {
    fontSize: '12px',
    fontWeight: '700',
    color: 'var(--primary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '32px',
  }
};

export default Layout;
