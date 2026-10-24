import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { apiFetch } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

/**
 * Exibida no lugar das telas enquanto o usuário não aceitar a versão vigente dos Termos de Uso
 * e da Política de Privacidade (primeiro acesso ou documentos atualizados).
 */
const LegalAcceptance = () => {
  const { refreshMe, logout } = useAuth();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);

  const accept = async () => {
    setBusy(true);
    try {
      await apiFetch('/api/legal/accept', { method: 'POST', body: { accept: true } });
      await refreshMe();
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  };

  return (
    <div style={styles.wrap}>
      <div className="premium-card fade-in" style={styles.card} role="dialog" aria-labelledby="legal-title">
        <ShieldCheck size={36} color="var(--primary)" />
        <h2 id="legal-title" style={styles.title}>Termos de Uso e Privacidade</h2>
        <p style={styles.text}>
          Para continuar usando o SmartMaint, leia e aceite os documentos abaixo. Eles explicam as regras de uso do
          sistema e como os dados pessoais são tratados, conforme a LGPD.
        </p>
        <div style={styles.links}>
          <Link to="/termos" target="_blank">Termos de Uso</Link>
          <Link to="/privacidade" target="_blank">Política de Privacidade</Link>
        </div>
        <label style={styles.checkbox}>
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span>Li e aceito os Termos de Uso e a Política de Privacidade.</span>
        </label>
        <button className="btn-primary flex-center" style={{ width: '100%', height: '44px' }} disabled={!checked || busy} onClick={accept}>
          {busy ? <Loader2 className="animate-spin" size={18} /> : 'Aceitar e continuar'}
        </button>
        <button style={styles.logout} onClick={logout}>Sair</button>
      </div>
    </div>
  );
};

const styles = {
  wrap: { display: 'flex', justifyContent: 'center', padding: '24px 0' },
  card: { width: '100%', maxWidth: '480px', padding: '32px', background: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', textAlign: 'center' },
  title: { fontSize: '20px', fontWeight: 700 },
  text: { fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.6 },
  links: { display: 'flex', gap: '20px', fontWeight: 600, flexWrap: 'wrap', justifyContent: 'center' },
  checkbox: { display: 'flex', gap: '10px', alignItems: 'flex-start', fontSize: '14px', textAlign: 'left' },
  logout: { background: 'transparent', color: 'var(--text-muted)', fontSize: '13px', cursor: 'pointer' },
};

export default LegalAcceptance;
