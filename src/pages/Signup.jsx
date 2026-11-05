import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, User, Mail, Lock, Loader2, Info, Rocket } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import logo from '../assets/logo.png';

const TERMS_URL = import.meta.env.VITE_TERMS_URL;
const PRIVACY_URL = import.meta.env.VITE_PRIVACY_URL;

const LegalLink = ({ href, children }) =>
  href ? <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', fontWeight: 600 }}>{children}</a> : <strong>{children}</strong>;

const Signup = () => {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ company_name: '', name: '', email: '', password: '', accept_terms: false });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const set = (field) => (e) => setForm({ ...form, [field]: field === 'accept_terms' ? e.target.checked : e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 10) {
      setError('A senha deve ter pelo menos 10 caracteres.');
      return;
    }
    setIsLoading(true);
    const result = await signup(form);
    setIsLoading(false);
    if (result.ok) navigate('/');
    else setError(result.error);
  };

  const field = (icon, label, props) => (
    <div style={styles.inputGroup}>
      <label style={styles.label} htmlFor={props.id}>{label}</label>
      <div style={styles.inputWrapper}>
        {icon}
        <input style={styles.input} required {...props} />
      </div>
    </div>
  );

  return (
    <div style={styles.container}>
      <div className="premium-card fade-in" style={styles.card}>
        <div style={styles.header}>
          <div style={styles.logoContainer}>
            <img src={logo} alt="SmartMaint" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <h1 style={styles.title}>Teste o SmartMaint grátis</h1>
          <p style={styles.subtitle}>14 dias com acesso completo. Sem cartão de crédito.</p>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          {error && (
            <div style={styles.errorBanner} role="alert">
              <Info size={18} />
              {error}
            </div>
          )}

          {field(<Building2 size={18} style={styles.inputIcon} />, 'Nome da empresa', {
            id: 'company_name', type: 'text', maxLength: 100, autoComplete: 'organization', value: form.company_name, onChange: set('company_name'),
          })}
          {field(<User size={18} style={styles.inputIcon} />, 'Seu nome', {
            id: 'name', type: 'text', maxLength: 100, autoComplete: 'name', value: form.name, onChange: set('name'),
          })}
          {field(<Mail size={18} style={styles.inputIcon} />, 'E-mail profissional', {
            id: 'email', type: 'email', maxLength: 255, autoComplete: 'email', value: form.email, onChange: set('email'),
          })}
          {field(<Lock size={18} style={styles.inputIcon} />, 'Senha (mínimo 10 caracteres)', {
            id: 'password', type: 'password', minLength: 10, maxLength: 72, autoComplete: 'new-password', value: form.password, onChange: set('password'),
          })}

          <label style={styles.terms}>
            <input type="checkbox" required checked={form.accept_terms} onChange={set('accept_terms')} style={{ marginTop: '3px' }} />
            <span>
              Li e aceito os <LegalLink href={TERMS_URL}>Termos de Uso</LegalLink> e a{' '}
              <LegalLink href={PRIVACY_URL}>Política de Privacidade</LegalLink>.
            </span>
          </label>

          <button type="submit" className="btn-primary flex-center" style={styles.submitBtn} disabled={isLoading}>
            {isLoading ? <Loader2 className="animate-spin" size={20} /> : <>Criar conta e começar <Rocket size={20} /></>}
          </button>
        </form>

        <div style={styles.footer}>
          <p style={styles.footerText}>
            Já tem conta? <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 600 }}>Entrar</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: { minHeight: '100vh', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)', padding: '24px' },
  card: { width: '100%', maxWidth: '440px', padding: '36px', display: 'flex', flexDirection: 'column', gap: '24px' },
  header: { textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' },
  logoContainer: { width: '56px', height: '56px', background: 'rgba(30, 58, 138, 0.05)', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: '22px', fontWeight: '700', color: 'var(--primary)', letterSpacing: '-0.3px' },
  subtitle: { color: 'var(--text-muted)', fontSize: '14px' },
  form: { display: 'flex', flexDirection: 'column', gap: '16px' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: '13px', fontWeight: '600', color: 'var(--text-main)' },
  inputWrapper: { position: 'relative', display: 'flex', alignItems: 'center' },
  inputIcon: { position: 'absolute', left: '12px', color: 'var(--text-muted)' },
  input: { width: '100%', padding: '12px 12px 12px 40px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px' },
  terms: { display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 },
  errorBanner: { background: '#fee2e2', color: 'var(--danger)', padding: '12px', borderRadius: '8px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '500' },
  submitBtn: { width: '100%', height: '48px', fontSize: '15px', marginTop: '4px' },
  footer: { textAlign: 'center', borderTop: '1px solid var(--border)', paddingTop: '20px' },
  footerText: { fontSize: '13px', color: 'var(--text-muted)' },
};

export default Signup;
