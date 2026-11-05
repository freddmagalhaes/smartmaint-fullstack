import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { X, Upload, Download, FileSpreadsheet, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { usePlan } from '../contexts/PlanContext';
import { readImportFile, buildTemplateCsv, ImportFileError } from '../utils/importEquipments';

const downloadTemplate = () => {
  const blob = new Blob([buildTemplateCsv()], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'modelo-importacao-ativos.csv';
  a.click();
  URL.revokeObjectURL(url);
};

/**
 * Fluxo: escolher arquivo -> pré-visualização (o servidor simula a importação, sem gravar) -> confirmar.
 * O servidor decide tudo (validação, duplicados, limite do plano); aqui só mostramos o resultado.
 */
const ImportEquipmentsModal = ({ onClose }) => {
  const { token, activeTenant } = useAuth();
  const { refreshData } = useData();
  const { refresh: refreshPlan } = usePlan();
  const inputRef = useRef(null);

  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState('');
  const [ignoredColumns, setIgnoredColumns] = useState([]);
  const [preview, setPreview] = useState(null); // { would_import, skipped, available }
  const [problem, setProblem] = useState(null); // { message, errors? }
  const [busy, setBusy] = useState(false);

  const post = async (dryRun) => {
    const res = await fetch('/api/equipments/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ rows, dry_run: dryRun, tenant_id: activeTenant }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  };

  const describeFailure = ({ status, data }) => {
    if (status === 422) return { message: data.error, errors: data.errors, total: data.total_errors };
    if (status === 429) return { message: 'Muitas requisições. Aguarde um instante e tente de novo.' };
    return { message: data.error || 'Não foi possível processar a planilha.' };
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite escolher o mesmo arquivo de novo depois de corrigir
    if (!file) return;
    setBusy(true);
    setProblem(null);
    setPreview(null);
    setRows(null);
    setFileName(file.name);
    try {
      const parsed = await readImportFile(file);
      setIgnoredColumns(parsed.ignoredColumns);
      // a pré-visualização usa as linhas recém-lidas (o estado ainda não atualizou)
      const res = await fetch('/api/equipments/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rows: parsed.rows, dry_run: true, tenant_id: activeTenant }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setRows(parsed.rows);
        setPreview(data);
      } else {
        setProblem(describeFailure({ status: res.status, data }));
      }
    } catch (err) {
      setProblem({ message: err instanceof ImportFileError ? err.message : 'Não foi possível ler o arquivo.' });
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      const result = await post(false);
      if (!result.ok) {
        setPreview(null);
        setProblem(describeFailure(result));
        return;
      }
      toast.success(`${result.data.imported} ${result.data.imported === 1 ? 'ativo importado' : 'ativos importados'}!`);
      await Promise.all([refreshData(), refreshPlan()]);
      onClose();
    } catch {
      setProblem({ message: 'Erro de comunicação com o servidor.' });
    } finally {
      setBusy(false);
    }
  };

  const skipped = preview?.skipped || [];

  return (
    <div style={styles.overlay}>
      <div className="premium-card fade-in" role="dialog" aria-modal="true" aria-labelledby="import-title" style={styles.card}>
        <div style={styles.header}>
          <h3 id="import-title" style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>Importar ativos por planilha</h3>
          <button type="button" onClick={onClose} aria-label="Fechar" style={styles.iconBtn}><X size={20} /></button>
        </div>

        <p style={styles.muted}>
          Envie um arquivo <strong>.xlsx</strong> ou <strong>.csv</strong> (até 1.000 linhas e 5 MB). A primeira linha deve ter os títulos das colunas;
          só <strong>Nome</strong> é obrigatório. Equipamentos com número de série já cadastrado são ignorados.
        </p>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', margin: '16px 0' }}>
          <button type="button" className="btn-primary" onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
            {fileName ? 'Escolher outro arquivo' : 'Escolher arquivo'}
          </button>
          <button type="button" onClick={downloadTemplate} style={styles.linkBtn}>
            <Download size={16} /> Baixar modelo
          </button>
          <input ref={inputRef} type="file" accept=".xlsx,.csv,.txt" onChange={handleFile} style={{ display: 'none' }} data-testid="import-file" />
        </div>

        {fileName && (
          <p style={{ ...styles.muted, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileSpreadsheet size={16} /> {fileName}
          </p>
        )}

        {problem && (
          <div role="alert" style={styles.errorBox}>
            <p style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontWeight: 600, margin: 0 }}>
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '1px' }} /> {problem.message}
            </p>
            {problem.errors && (
              <ul style={{ margin: '10px 0 0', paddingLeft: '22px', fontSize: '13px' }}>
                {problem.errors.slice(0, 10).map((er, i) => (
                  <li key={i}>Linha {er.line}{er.field ? ` (${er.field})` : ''}: {er.message}</li>
                ))}
                {problem.total > 10 && <li>… e mais {problem.total - 10} erro(s).</li>}
              </ul>
            )}
          </div>
        )}

        {preview && (
          <div style={styles.okBox}>
            <p style={{ display: 'flex', gap: '8px', alignItems: 'center', fontWeight: 700, margin: 0 }}>
              <CheckCircle2 size={18} /> {preview.would_import} {preview.would_import === 1 ? 'ativo será importado' : 'ativos serão importados'}
            </p>
            {preview.available !== null && preview.available !== undefined && (
              <p style={{ ...styles.muted, margin: '6px 0 0' }}>Vagas restantes no seu plano: {preview.available}</p>
            )}
            {ignoredColumns.length > 0 && (
              <p style={{ ...styles.muted, margin: '6px 0 0' }}>Colunas não reconhecidas (ignoradas): {ignoredColumns.join(', ')}.</p>
            )}
            {skipped.length > 0 && (
              <details style={{ marginTop: '8px', fontSize: '13px' }}>
                <summary>{skipped.length} {skipped.length === 1 ? 'linha ignorada' : 'linhas ignoradas'} (duplicadas)</summary>
                <ul style={{ margin: '6px 0 0', paddingLeft: '22px' }}>
                  {skipped.slice(0, 10).map((s) => <li key={s.line}>Linha {s.line}: {s.name} (série {s.serie})</li>)}
                  {skipped.length > 10 && <li>… e mais {skipped.length - 10}.</li>}
                </ul>
              </details>
            )}
          </div>
        )}

        <div style={styles.footer}>
          <button type="button" onClick={onClose} style={styles.cancel}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={confirm} disabled={busy || !preview || preview.would_import === 0}>
            {busy && preview ? <Loader2 className="animate-spin" size={18} /> : null}
            Importar {preview ? preview.would_import : ''}
          </button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '16px' },
  card: { width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', padding: '28px', background: 'white' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' },
  iconBtn: { background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' },
  muted: { fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 },
  linkBtn: { background: 'transparent', border: 'none', color: 'var(--primary)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px' },
  errorBox: { background: '#fee2e2', color: '#991b1b', padding: '14px', borderRadius: '8px', fontSize: '14px', marginTop: '12px' },
  okBox: { background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', color: '#065f46', padding: '14px', borderRadius: '8px', fontSize: '14px', marginTop: '12px' },
  footer: { display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '20px' },
  cancel: { background: 'transparent', border: 'none', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer' },
};

export default ImportEquipmentsModal;
