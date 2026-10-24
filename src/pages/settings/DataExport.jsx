import { useState } from 'react';
import { toast } from 'sonner';
import { Download, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiDownload, withQuery } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

/** Exportação de todos os dados da empresa em planilha (portabilidade, LGPD). */
const DataExport = () => {
  const { activeTenant } = useAuth();
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      await apiDownload(withQuery('/api/export', { tenant_id: activeTenant }), 'smartmaint.xlsx');
      toast.success('Planilha gerada.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={styles.card}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h4 style={styles.title}>Seus dados</h4>
        <p style={styles.text}>
          Baixe uma planilha com todos os dados da empresa: equipamentos, ordens de serviço, falhas, preventivas,
          estoque, equipe e faturas. Os dados são seus; veja a <Link to="/privacidade" target="_blank">Política de Privacidade</Link>.
        </p>
      </div>
      <button className="btn-secondary" onClick={download} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />} Exportar dados (.xlsx)
      </button>
    </div>
  );
};

const styles = {
  card: { display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginTop: '24px', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)', background: '#f8fafc' },
  title: { fontSize: '15px', fontWeight: 700, marginBottom: '4px' },
  text: { fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 },
};

export default DataExport;
