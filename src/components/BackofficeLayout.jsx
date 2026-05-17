import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ShieldCheck, LogOut, ArrowLeft } from 'lucide-react';

const BackofficeLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div style={styles.container}>
      {/* Top Header */}
      <header style={styles.header}>
        <div style={styles.logoArea}>
          <ShieldCheck size={28} color="var(--primary)" />
          <div>
            <h2 style={styles.logoText}>SmartMaint <span style={{ color: 'var(--primary)' }}>Master</span></h2>
            <p style={styles.logoSub}>Painel de Gestão SaaS</p>
          </div>
        </div>

        <div style={styles.userArea}>
          <div style={styles.userInfo}>
            <span style={styles.userName}>{user?.name}</span>
            <span style={styles.userRole}>{user?.isMaster ? 'Root / Dono do Sistema' : user?.role}</span>
          </div>
          <button style={styles.iconBtn} onClick={() => navigate('/')} title="Ir para Painel Operacional">
            <ArrowLeft size={20} />
          </button>
          <button style={{...styles.iconBtn, color: 'var(--danger)'}} onClick={handleLogout} title="Sair">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={styles.main}>
        {children}
      </main>
    </div>
  );
};

const styles = {
  container: {
    minHeight: '100vh',
    background: 'var(--bg-main)',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    height: '70px',
    background: 'white',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 32px',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  logoArea: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  logoText: {
    fontSize: '18px',
    fontWeight: '800',
    color: 'var(--text-main)',
    lineHeight: '1',
  },
  logoSub: {
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginTop: '2px',
  },
  nav: {
    display: 'flex',
    gap: '24px',
  },
  navBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'transparent',
    border: 'none',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    padding: '8px 12px',
    borderRadius: '8px',
    transition: 'var(--transition)',
  },
  userArea: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  userInfo: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    marginRight: '16px',
  },
  userName: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--text-main)',
  },
  userRole: {
    fontSize: '12px',
    color: 'var(--text-muted)',
  },
  iconBtn: {
    background: 'rgba(30, 58, 138, 0.05)',
    border: 'none',
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    transition: 'var(--transition)',
  },
  main: {
    flex: 1,
    padding: '32px',
    maxWidth: '1200px',
    width: '100%',
    margin: '0 auto',
  }
};

export default BackofficeLayout;
