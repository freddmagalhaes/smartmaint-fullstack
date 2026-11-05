import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Save, CheckCircle2, XCircle, FileText } from 'lucide-react';
import { apiFetch, withQuery } from '../../api/client';
import { formatCurrency } from '../../utils/format';
import Pagination from '../../components/Pagination';

const FIELDS = [
  { key: 'cnpj', label: 'CNPJ', maxLength: 18 },
  { key: 'razao_social', label: 'Razão social' },
  { key: 'inscricao_municipal', label: 'Inscrição municipal', maxLength: 30 },
  { key: 'municipio_ibge', label: 'Código IBGE do município', maxLength: 7, placeholder: 'São José da Lapa/MG: confirme com o contador' },
  { key: 'codigo_tributacao_nacional', label: 'Código de tributação nacional (cTribNac)', maxLength: 6, placeholder: 'Definido pelo contador' },
  { key: 'codigo_tributacao_municipal', label: 'Código de tributação municipal', maxLength: 20 },
  { key: 'aliquota_iss', label: 'Alíquota de ISS (%)', type: 'number' },
];

const REGIMES = [
  ['', 'Selecione'],
  ['simples_nacional', 'Simples Nacional'],
  ['mei', 'MEI'],
  ['lucro_presumido', 'Lucro Presumido'],
  ['lucro_real', 'Lucro Real'],
];

const STATUS_COLORS = { Pendente: '#f59e0b', Emitida: '#10b981', Erro: '#ef4444', Cancelada: '#64748b' };

/**
 * Configuração da NFS-e padrão nacional (somente Root). Mostra o que falta para emitir
 * (dados do prestador, certificado A1 nas variáveis de ambiente) e a fila de notas.
 */
const FiscalTab = () => {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState({ items: [], total: 0 });
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    try {
      const result = await apiFetch('/api/admin/fiscal');
      setData(result);
      setForm(Object.fromEntries(Object.entries(result.settings).map(([k, v]) => [k, v ?? ''])));
    } catch (err) {
      toast.error(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    apiFetch(withQuery('/api/admin/nfse', { page, pageSize: 20 })).then(setNotes).catch((err) => toast.error(err.message));
  }, [page]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        ...Object.fromEntries(FIELDS.map(({ key }) => [key, form[key] === '' ? null : form[key]])),
        aliquota_iss: form.aliquota_iss === '' ? null : Number(form.aliquota_iss),
        regime_tributario: form.regime_tributario || null,
        optante_simples: form.regime_tributario ? ['simples_nacional', 'mei'].includes(form.regime_tributario) : null,
        descricao_servico: form.descricao_servico || null,
      };
      const result = await apiFetch('/api/admin/fiscal', { method: 'PUT', body });
      setData(result);
      toast.success('Dados fiscais salvos');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!data) return null;

  return (
    <div style={{ display: 'grid', gap: '24px' }}>
      <div className="premium-card" style={styles.card}>
        <h3 style={styles.title}>Prontidão para emitir NFS-e</h3>
        <p style={styles.hint}>
          Emissão pelo Emissor Nacional (Sefin Nacional). O certificado A1 é configurado nas variáveis de ambiente
          do servidor (NFSE_CERT_BASE64 e NFSE_CERT_PASSWORD), nunca por esta tela.
        </p>
        <ul style={styles.checklist}>
          {data.readiness.checks.map((c) => (
            <li key={c.item} style={styles.checkItem}>
              {c.ok ? <CheckCircle2 size={16} color="var(--success)" /> : <XCircle size={16} color="var(--danger)" />}
              <span>{c.item}</span>
            </li>
          ))}
        </ul>
      </div>

      <form className="premium-card" style={styles.card} onSubmit={save}>
        <h3 style={styles.title}>Dados do prestador (sua empresa)</h3>
        <div className="form-grid" style={styles.grid}>
          {FIELDS.map((f) => (
            <label key={f.key} style={styles.label}>{f.label}
              <input
                type={f.type || 'text'}
                step={f.type === 'number' ? '0.01' : undefined}
                maxLength={f.maxLength}
                placeholder={f.placeholder}
                style={styles.input}
                value={form[f.key] ?? ''}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              />
            </label>
          ))}
          <label style={styles.label}>Regime tributário
            <select style={styles.input} value={form.regime_tributario || ''} onChange={(e) => setForm({ ...form, regime_tributario: e.target.value })}>
              {REGIMES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label style={{ ...styles.label, gridColumn: '1 / -1' }}>Descrição do serviço na nota
            <textarea rows={3} maxLength={1000} style={styles.input} placeholder="Ex.: Licenciamento de uso do software SmartMaint (SaaS) - mensalidade" value={form.descricao_servico || ''} onChange={(e) => setForm({ ...form, descricao_servico: e.target.value })} />
          </label>
        </div>
        <button type="submit" className="btn-primary" style={{ marginTop: '16px' }} disabled={saving}>
          <Save size={16} /> {saving ? 'Salvando...' : 'Salvar dados fiscais'}
        </button>
      </form>

      <div className="premium-card" style={styles.card}>
        <h3 style={styles.title}>Notas fiscais</h3>
        <p style={styles.hint}>Cada fatura paga gera uma nota "Pendente", emitida automaticamente quando a integração estiver ativa.</p>
        {notes.items.length === 0 ? (
          <p style={styles.hint}>Nenhuma nota na fila.</p>
        ) : (
          <div className="table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>
                  <th style={styles.th}>Cliente</th><th style={styles.th}>Referência</th><th style={styles.th}>Valor</th><th style={styles.th}>Número</th><th style={styles.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {notes.items.map((n) => (
                  <tr key={n.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={styles.td}><FileText size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />{n.tenant_name}</td>
                    <td style={styles.td}>{n.mes_ref}</td>
                    <td style={styles.td}>{formatCurrency(n.valor)}</td>
                    <td style={styles.td}>{n.numero || '—'}</td>
                    <td style={{ ...styles.td, fontWeight: 700, color: STATUS_COLORS[n.status] }} title={n.error_message || undefined}>{n.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageSize={20} total={notes.total} onChange={setPage} />
      </div>
    </div>
  );
};

const styles = {
  card: { padding: '24px' },
  title: { fontSize: '16px', fontWeight: 700, marginBottom: '8px' },
  hint: { fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' },
  checklist: { listStyle: 'none', display: 'grid', gap: '8px' },
  checkItem: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '12px' },
  label: { display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: 600 },
  input: { padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', fontWeight: 400, width: '100%', background: 'white' },
  th: { padding: '10px 12px', fontWeight: 600 },
  td: { padding: '12px' },
};

export default FiscalTab;
