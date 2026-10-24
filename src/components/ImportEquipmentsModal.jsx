import { useState } from 'react';
import { X, Upload, Download, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useData } from '../contexts/DataContext';
import { readSpreadsheet, downloadCsvTemplate } from '../utils/spreadsheet';
import { apiFetch, withQuery } from '../api/client';

// Cabeçalhos aceitos na planilha para cada campo
const HEADERS = {
  name: ['Nome', 'Equipamento', 'Nome do equipamento'],
  type: ['Tipo'],
  model: ['Modelo'],
  serie: ['Série', 'Serie', 'Número de série', 'Nº de série', 'N de serie'],
  unit: ['Unidade', 'Planta', 'Filial'],
  total_op_time: ['Horas de operação', 'Horas', 'Horas operação'],
  data_inicio: ['Data de início', 'Data inicio', 'Início de operação'],
};

const TEMPLATE = ['Nome', 'Tipo', 'Modelo', 'Série', 'Unidade', 'Horas de operação', 'Data de início'];

/** Importação de equipamentos por planilha: modelo, pré-visualização com erros por linha e confirmação. */
const ImportEquipmentsModal = ({ onClose }) => {
  const { units, mutate, scope, activeUnit } = useData();
  const activeUnitName = units.find((u) => u.id === activeUnit)?.name;
  const [rows, setRows] = useState(null);
  const [preview, setPreview] = useState(null); // { valid, errors }
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);

  const validate = async (data) => {
    // dry_run devolve 422 com os erros: tratamos como resultado, não como falha
    try {
      return await apiFetch(withQuery('/api/equipments/import', { tenant_id: scope.tenant_id }), { method: 'POST', body: { rows: data, dry_run: true, default_unit_id: activeUnit || null } });
    } catch (err) {
      if (err.status === 422) return err.body;
      throw err;
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setFileName(file.name);
    setPreview(null);
    try {
      const { rows: parsed, unknownColumns } = await readSpreadsheet(file, HEADERS);
      if (unknownColumns.length) toast.info(`Colunas ignoradas: ${unknownColumns.join(', ')}`);
      setRows(parsed);
      setPreview(await validate(parsed));
    } catch (err) {
      toast.error(err.message);
      setRows(null);
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    setBusy(true);
    const result = await mutate({ method: 'POST', path: '/api/equipments/import', body: { rows, default_unit_id: activeUnit || null } });
    setBusy(false);
    if (result) {
      toast.success(`${result.imported} equipamento(s) importado(s)!`);
      onClose();
    }
  };

  const hasErrors = preview?.errors?.length > 0;

  return (
    <div className="modal-overlay">
      <div className="premium-card fade-in modal-card" style={styles.modal} role="dialog" aria-modal="true" aria-labelledby="import-title">
        <div style={styles.header}>
          <h3 id="import-title" style={styles.title}>Importar equipamentos</h3>
          <button onClick={onClose} style={styles.iconBtn} aria-label="Fechar"><X size={20} /></button>
        </div>

        <ol style={styles.steps}>
          <li>
            Baixe o modelo, preencha no Excel e salve como <strong>.xlsx</strong> ou <strong>.csv</strong>.
            {units.length > 1 && (activeUnitName
              ? <> Linhas sem a coluna <em>Unidade</em> vão para <strong>{activeUnitName}</strong> (unidade escolhida no topo).</>
              : <> A coluna <em>Unidade</em> deve ter um destes nomes: {units.map((u) => u.name).join(', ')}.</>)}
          </li>
          <li>Envie o arquivo. Nada é gravado até você confirmar.</li>
        </ol>

        <div style={styles.actions} className="stack-mobile">
          <button type="button" style={styles.secondaryBtn} onClick={() => downloadCsvTemplate('modelo-equipamentos.csv', TEMPLATE, ['Compressor 01', 'Pneumático', 'GA37', 'SN-001', units[0]?.name || 'Unidade Principal', '1200', '15/03/2024'])}>
            <Download size={16} /> Baixar modelo
          </button>
          <label className="btn-primary" style={{ cursor: busy ? 'wait' : 'pointer' }}>
            <Upload size={16} /> {busy ? 'Lendo...' : 'Escolher planilha'}
            <input type="file" accept=".xlsx,.csv" onChange={handleFile} disabled={busy} style={{ display: 'none' }} />
          </label>
        </div>

        {preview && (
          <div style={styles.preview}>
            <p style={styles.fileName}>{fileName}</p>
            {hasErrors ? (
              <>
                <p style={{ ...styles.status, color: 'var(--danger)' }}><AlertTriangle size={16} /> Corrija os erros abaixo e envie o arquivo novamente.</p>
                <ul style={styles.errors}>
                  {preview.errors.slice(0, 50).map((err, i) => (
                    <li key={i}>{err.line ? <strong>Linha {err.line}: </strong> : null}{err.message}</li>
                  ))}
                  {preview.errors.length > 50 && <li>... e mais {preview.errors.length - 50} erro(s).</li>}
                </ul>
              </>
            ) : (
              <p style={{ ...styles.status, color: 'var(--success)' }}><CheckCircle2 size={16} /> {preview.valid} equipamento(s) prontos para importar.</p>
            )}
          </div>
        )}

        <div style={styles.footer}>
          <button type="button" onClick={onClose} style={styles.cancelBtn}>Cancelar</button>
          <button type="button" className="btn-primary" disabled={!preview || hasErrors || busy} onClick={handleImport}>
            Importar {preview && !hasErrors ? preview.valid : ''}
          </button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  modal: { maxWidth: '560px', padding: '28px', background: 'white' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  title: { fontSize: '20px', fontWeight: 700 },
  iconBtn: { background: 'transparent', color: 'var(--text-muted)' },
  steps: { paddingLeft: '20px', fontSize: '14px', color: 'var(--text-muted)', display: 'grid', gap: '8px', marginBottom: '20px' },
  actions: { display: 'flex', gap: '12px', flexWrap: 'wrap' },
  secondaryBtn: { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'white', fontWeight: 500 },
  preview: { marginTop: '20px', padding: '16px', borderRadius: '10px', background: 'var(--bg-main)' },
  fileName: { fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' },
  status: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600 },
  errors: { marginTop: '10px', paddingLeft: '18px', fontSize: '13px', display: 'grid', gap: '4px', maxHeight: '200px', overflowY: 'auto' },
  footer: { display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' },
  cancelBtn: { background: 'transparent', color: 'var(--text-muted)', fontWeight: 600 },
};

export default ImportEquipmentsModal;
