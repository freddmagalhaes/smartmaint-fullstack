import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { LogIn, Mail, Lock, Loader2, Info } from 'lucide-react';
import logo from '../assets/logo.png';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Primeiro, checar diretamente a resposta do servidor para capturar 403
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (res.status === 403) {
        const data = await res.json();
        setError(data.error || 'Acesso bloqueado. Entre em contato com o suporte.');
        setIsLoading(false);
        return;
      }

      const success = await login(email, password);
      if (success) {
        navigate('/');
      }
    } catch (err) {
      setError('Erro de comunicação com o servidor.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.backgroundCircles}>
        <div style={{...styles.circle, top: '-10%', left: '-5%', background: 'rgba(30, 58, 138, 0.1)'}}></div>
        <div style={{...styles.circle, bottom: '-15%', right: '-5%', background: 'rgba(59, 130, 246, 0.05)'}}></div>
      </div>

      <div className="premium-card fade-in" style={styles.loginCard}>
        <div style={styles.header}>
          <div style={styles.logoContainer}>
            <img src={logo} alt="SmartMaint Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <h1 style={styles.title}>SmartMaint</h1>
          <p style={styles.subtitle}>Gestão Inteligente de Ativos</p>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          {error && (
            <div style={styles.errorBanner}>
              <Info size={18} />
              {error}
            </div>
          )}

          <div style={styles.inputGroup}>
            <label style={styles.label}>E-mail</label>
            <div style={styles.inputWrapper}>
              <Mail size={18} style={styles.inputIcon} />
              <input
                type="email"
                placeholder="exemplo@smartmaint.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={styles.input}
                required
              />
            </div>
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Senha</label>
            <div style={styles.inputWrapper}>
              <Lock size={18} style={styles.inputIcon} />
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={styles.input}
                required
              />
            </div>
          </div>

          <button 
            type="submit" 
            className="btn-primary flex-center" 
            style={styles.submitBtn}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              <>
                Entrar no Sistema
                <LogIn size={20} />
              </>
            )}
          </button>
        </form>

        <div style={styles.footer}>
          <p style={styles.footerText}>Acesso restrito a colaboradores autorizados.</p>
          <div style={styles.demoCredits}>
            <p>Dica: 123456 | dono@smartmaint.com</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    height: '100vh',
    width: '100vw',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-main)',
    position: 'relative',
    overflow: 'hidden',
  },
  backgroundCircles: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    zIndex: 0,
  },
  circle: {
    position: 'absolute',
    width: '600px',
    height: '600px',
    borderRadius: '50%',
    filter: 'blur(100px)',
  },
  loginCard: {
    width: '100%',
    maxWidth: '420px',
    padding: '40px',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
  },
  header: {
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  logoContainer: {
    width: '64px',
    height: '64px',
    background: 'rgba(30, 58, 138, 0.05)',
    borderRadius: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '8px',
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    color: 'var(--primary)',
    letterSpacing: '-0.5px',
  },
  subtitle: {
    color: 'var(--text-muted)',
    fontSize: '14px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-main)',
  },
  inputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  inputIcon: {
    position: 'absolute',
    left: '12px',
    color: 'var(--text-muted)',
  },
  input: {
    width: '100%',
    padding: '12px 12px 12px 40px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    fontSize: '14px',
    transition: 'var(--transition)',
  },
  errorBanner: {
    background: '#fee2e2',
    color: 'var(--danger)',
    padding: '12px',
    borderRadius: '8px',
    fontSize: '13px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontWeight: '500',
  },
  submitBtn: {
    width: '100%',
    height: '48px',
    fontSize: '15px',
    marginTop: '8px',
  },
  footer: {
    textAlign: 'center',
    borderTop: '1px solid var(--border)',
    paddingTop: '24px',
  },
  footerText: {
    fontSize: '12px',
    color: 'var(--text-muted)',
  },
  demoCredits: {
    marginTop: '8px',
    fontSize: '10px',
    color: 'var(--text-muted)',
    opacity: 0.6,
  }
};

export default Login;
