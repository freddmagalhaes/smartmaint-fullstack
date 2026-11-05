import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { X, Printer } from 'lucide-react';
import { APP_BASE_URL } from '../config';
import { assetUrl, qrDataUrl, printLabels } from '../utils/qr';

/** QR code de um ativo: aponta para a ficha dele (/ativo/:id). Pode ser impresso como etiqueta. */
const QrModal = ({ asset, onClose }) => {
  const url = assetUrl(APP_BASE_URL, asset.id);
  const [qr, setQr] = useState(null);

  useEffect(() => {
    let active = true;
    qrDataUrl(url, 480).then((d) => { if (active) setQr(d); });
    return () => { active = false; };
  }, [url]);

  const print = async () => {
    try {
      if (!(await printLabels([asset], APP_BASE_URL))) toast.error('O navegador bloqueou a janela de impressão. Libere pop-ups para este site.');
    } catch {
      toast.error('Não foi possível gerar a etiqueta.');
    }
  };

  return (
    <div style={styles.overlay}>
      <div className="premium-card fade-in" role="dialog" aria-modal="true" aria-labelledby="qr-title" style={styles.card}>
        <div style={styles.header}>
          <h3 id="qr-title" style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>QR code do equipamento</h3>
          <button type="button" onClick={onClose} aria-label="Fechar" style={styles.iconBtn}><X size={20} /></button>
        </div>
        <p style={{ fontSize: '15px', fontWeight: 600, margin: '4px 0' }}>{asset.name}</p>
        <p style={styles.muted}>{asset.serie ? `Série ${asset.serie}` : 'Sem número de série'}</p>
        <div style={styles.qrBox}>
          {qr ? <img src={qr} alt={`QR code de ${asset.name}`} style={{ width: '240px', height: '240px' }} /> : <span style={styles.muted}>Gerando…</span>}
        </div>
        <p style={{ ...styles.muted, wordBreak: 'break-all', fontSize: '12px' }}>{url}</p>
        <p style={{ ...styles.muted, fontSize: '12px' }}>
          Cole a etiqueta na máquina. Quem escanear com a câmera do celular abre a ficha do equipamento (é preciso estar logado).
        </p>
        <div style={styles.footer}>
          <button type="button" onClick={onClose} style={styles.cancel}>Fechar</button>
          <button type="button" className="btn-primary" onClick={print}><Printer size={18} /> Imprimir etiqueta</button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '16px' },
  card: { width: '100%', maxWidth: '380px', padding: '24px', background: 'white', textAlign: 'center' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  iconBtn: { background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' },
  muted: { fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0' },
  qrBox: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '260px', margin: '12px 0' },
  footer: { display: 'flex', justifyContent: 'center', gap: '12px', borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '12px' },
  cancel: { background: 'transparent', border: 'none', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer' },
};

export default QrModal;
