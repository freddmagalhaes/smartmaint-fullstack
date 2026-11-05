import { useState } from 'react';
import { toast } from 'sonner';
import { Copy, KeyRound } from 'lucide-react';

/**
 * Mostra uma única vez a senha provisória gerada pelo servidor.
 * A senha não é recuperável depois: quem cadastra deve copiá-la e repassá-la com segurança.
 */
const TempPasswordModal = ({ credential, onClose }) => {
  const [revealed, setRevealed] = useState(false);
  if (!credential) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(credential.password);
      toast.success('Senha copiada!');
    } catch {
      toast.error('Não foi possível copiar. Selecione e copie manualmente.');
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
      <div className="premium-card fade-in" role="dialog" aria-modal="true" style={{ width: '100%', maxWidth: '440px', padding: '28px', background: 'white' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <KeyRound size={20} color="var(--primary)" />
          <h3 style={{ fontSize: '18px', fontWeight: '700', margin: 0 }}>Senha provisória gerada</h3>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Entregue esta senha a <strong>{credential.email}</strong>. Ela é exibida somente agora e não poderá ser
          consultada depois. Se for perdida, use &quot;Esqueci minha senha&quot; na tela de login.
        </p>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'var(--bg-secondary, #f1f5f9)', borderRadius: '8px', padding: '12px 14px', marginBottom: '20px' }}>
          <code style={{ flex: 1, fontSize: '15px', letterSpacing: '0.5px', wordBreak: 'break-all' }}>
            {revealed ? credential.password : '•'.repeat(credential.password.length)}
          </code>
          <button type="button" onClick={() => setRevealed(!revealed)} style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontWeight: '600', cursor: 'pointer' }}>
            {revealed ? 'Ocultar' : 'Mostrar'}
          </button>
          <button type="button" onClick={copy} aria-label="Copiar senha" style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', display: 'flex' }}>
            <Copy size={18} />
          </button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-primary" onClick={onClose}>Já copiei, fechar</button>
        </div>
      </div>
    </div>
  );
};

export default TempPasswordModal;
