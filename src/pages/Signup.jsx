import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, User, Mail, Lock, Phone, Loader2, Info, MailCheck } from 'lucide-react';
import { apiFetch } from '../api/client';
import { usePublicInfo } from '../api/publicInfo';
import logo from '../assets/logo.png';

const EMPTY = { company: '', name: '', email: '', phone: '', password: '', confirm: '', accept_terms: false, website: '' };

const FIELDS = [
  { key: 'company', label: 'Empresa', icon: Building2, placeholder: 'Nome da sua empresa', autoComplete: 'organization', maxLength: 100 },
  { key: 'name', label: 'Seu nome', icon: User, placeholder: 'Nome e sobrenome', autoComplete: 'name', maxLength: 255 },
  { key: 'email', label: 'E-mail de trabalho', icon: Mail, type: 'email', placeholder: 'voce@suaempresa.com.br', autoComplete: 'email', maxLength: 255 },
  { key: 'phone', label: 'Telefone (opcional)', icon: Phone, type: 'tel', placeholder: '(31) 99999-0000', autoComplete: 'tel', maxLength: 30, optional: true },
  { key: 'password', label: 'Senha', icon: Lock, type: 'password', placeholder: 'Mínimo de 8 caracteres', autoComplete: 'new-password', maxLength: 128, minLength: 8 },
  { key: 'confirm', label: 'Confirme a senha', icon: Lock, type: 'password', placeholder: 'Repita a senha', autoComplete: 'new-password', maxLength: 128, minLength: 8 },
];

/** Cadastro da empresa pelo próprio cliente. O acesso é liberado após confirmar o e-mail. */
const Signup = () => {
  const info = usePublicInfo();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) {
      setError('As senhas não conferem.');
      return;
    }
    setBusy(true);
    try {
      const { company, name, email, password, accept_terms, website } = form;
      await apiFetch('/api/signup', {
        method: 'POST',
        body: { company, name, email, password, accept_terms, website, phone: form.phone || null },
        auth: false,
      });
      setSentTo(form.email);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={styles.container}>
      <div className="premium-card fade-in" style={styles.card}>
        <div style={styles.header}>
          <img src={logo} alt="SmartMaint" style={{ width: '56px', height: '56px', objectFit: 'contain' }} />
          <h1 style={styles.title}>Comece a usar o SmartMaint</h1>
          <p style={styles.subtitle}>Crie a conta da sua empresa. Com cartão de crédito, os primeiros 30 dias são grátis.</p>
        </div>

        {info && !info.signup_enabled ? (
          <div style={styles.notice}>
            <Info size={18} /> O cadastro está temporariamente indisponível. Fale com a nossa equipe para contratar.
          </div>
        ) : sentTo ? (
          <div style={styles.success} role="status">
            <MailCheck size={40} color="var(--success)" />
            <h2 style={{ fontSize: '18px', fontWeight: 700 }}>Confirme seu e-mail</h2>
            <p style={styles.subtitle}>
              Enviamos um link para <strong>{sentTo}</strong>. Abra o e-mail e clique em “Confirmar e-mail” para acessar.
              O link vale por 48 horas. Não chegou? Verifique a caixa de spam.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={styles.form}>
            {error && <div style={styles.error} role="alert"><Info size={18} /> {error}</div>}
            {FIELDS.map(({ key, label, icon: Icon, optional, ...input }) => (
              <label key={key} style={styles.group}>
                <span style={styles.label}>{label}</span>
                <span style={styles.inputWrapper}>
                  <Icon size={18} style={styles.inputIcon} aria-hidden="true" />
                  <input {...input} type={input.type || 'text'} required={!optional} value={form[key]} onChange={set(key)} style={styles.input} />
                </span>
              </label>
            ))}
            {/* Campo invisível para pessoas: só robôs o preenchem */}
            <input type="text" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} style={styles.honeypot} aria-hidden="true" />

            <label style={styles.checkbox}>
              <input type="checkbox" required checked={form.accept_terms} onChange={set('accept_terms')} />
              <span>
                Li e aceito os <Link to="/termos" target="_blank">Termos de Uso</Link> e a{' '}
                <Link to="/privacidade" target="_blank">Política de Privacidade</Link>, e declaro ter poderes para contratar em nome da empresa.
              </span>
            </label>

            <button type="submit" className="btn-primary flex-center" style={styles.submit} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" size={20} /> : 'Criar conta'}
            </button>
          </form>
        )}

        <p style={styles.footer}>Já tem conta? <Link to="/login">Entrar</Link></p>
      </div>
    </div>
  );
};

const styles = {
  container: { minHeight: '100dvh', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)' },
  card: { width: '100%', maxWidth: '480px', padding: 'clamp(24px, 6vw, 40px)', display: 'flex', flexDirection: 'column', gap: '24px', background: 'white' },
  header: { textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' },
  title: { fontSize: '22px', fontWeight: 700, color: 'var(--primary)' },
  subtitle: { fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.5 },
  form: { display: 'flex', flexDirection: 'column', gap: '14px' },
  group: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' },
  inputWrapper: { position: 'relative', display: 'flex', alignItems: 'center' },
  inputIcon: { position: 'absolute', left: '12px', color: 'var(--text-muted)' },
  input: { width: '100%', padding: '11px 12px 11px 40px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px' },
  honeypot: { position: 'absolute', left: '-10000px', width: '1px', height: '1px', opacity: 0 },
  checkbox: { display: 'flex', gap: '10px', alignItems: 'flex-start', fontSize: '13px', color: 'var(--text-main)', lineHeight: 1.5 },
  submit: { width: '100%', height: '48px', fontSize: '15px', marginTop: '4px' },
  error: { background: '#fee2e2', color: 'var(--danger)', padding: '12px', borderRadius: '8px', fontSize: '13px', display: 'flex', gap: '8px', alignItems: 'center' },
  notice: { background: '#fef3c7', color: '#92400e', padding: '12px', borderRadius: '8px', fontSize: '14px', display: 'flex', gap: '8px', alignItems: 'center' },
  success: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', textAlign: 'center' },
  footer: { textAlign: 'center', fontSize: '14px', color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: '20px' },
};

export default Signup;
