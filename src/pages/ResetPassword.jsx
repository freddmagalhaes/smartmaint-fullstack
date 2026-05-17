import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Lock, Loader2, Info, ShieldCheck } from 'lucide-react';

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const token = searchParams.get('token');
  const id = searchParams.get('id');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      return setError('As senhas não coincidem.');
    }
    if (password.length < 6) {
      return setError('A senha deve ter no mínimo 6 caracteres.');
    }

    setError('');
    setMessage('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, token, newPassword: password })
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao redefinir a senha.');
      }

      setMessage('Senha redefinida com sucesso! Você já pode fazer login.');
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!token || !id) {
    return (
      <div style={styles.container}>
        <div className="premium-card" style={{ padding: '40px', textAlign: 'center' }}>
          <h2 style={{ color: 'var(--danger)', marginBottom: '16px' }}>Link Inválido</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>Este link de recuperação está incompleto ou é inválido.</p>
          <button className="btn-primary" onClick={() => navigate('/login')}>Ir para o Login</button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div className="premium-card fade-in" style={styles.card}>
        <div style={styles.header}>
          <div style={styles.logoContainer}>
            <ShieldCheck size={32} color="var(--primary)" />
          </div>
          <h1 style={styles.title}>Redefinir Senha</h1>
          <p style={styles.subtitle}>Crie uma nova senha de acesso.</p>
        </div>

        {message ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={styles.successBanner}>
              <Info size={18} />
              {message}
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '16px' }}>Redirecionando para o login...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={styles.form}>
            {error && (
              <div style={styles.errorBanner}>
                <Info size={18} />
                {error}
              </div>
            )}

            <div style={styles.inputGroup}>
              <label style={styles.label}>Nova Senha</label>
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

            <div style={styles.inputGroup}>
              <label style={styles.label}>Confirmar Nova Senha</label>
              <div style={styles.inputWrapper}>
                <Lock size={18} style={styles.inputIcon} />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
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
              {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Salvar Nova Senha'}
            </button>
          </form>
        )}
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
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    padding: '40px',
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
  },
  header: { textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' },
  logoContainer: { width: '64px', height: '64px', background: 'rgba(30, 58, 138, 0.05)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' },
  title: { fontSize: '24px', fontWeight: '700', color: 'var(--text-main)' },
  subtitle: { color: 'var(--text-muted)', fontSize: '14px' },
  form: { display: 'flex', flexDirection: 'column', gap: '20px' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '8px' },
  label: { fontSize: '13px', fontWeight: '600', color: 'var(--text-main)' },
  inputWrapper: { position: 'relative', display: 'flex', alignItems: 'center' },
  inputIcon: { position: 'absolute', left: '12px', color: 'var(--text-muted)' },
  input: { width: '100%', padding: '12px 12px 12px 40px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', transition: 'var(--transition)' },
  errorBanner: { background: '#fee2e2', color: 'var(--danger)', padding: '12px', borderRadius: '8px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '500' },
  successBanner: { background: '#dcfce7', color: 'var(--success)', padding: '12px', borderRadius: '8px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '500' },
  submitBtn: { width: '100%', height: '48px', fontSize: '15px', marginTop: '8px' },
};

export default ResetPassword;
