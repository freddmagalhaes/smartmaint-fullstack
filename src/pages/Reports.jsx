import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { FileSpreadsheet, Printer, History, X } from 'lucide-react';
import { apiFetch, apiDownload, withQuery } from '../api/client';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency, formatDate, todayISO } from '../utils/format';

const shift = (iso, { months = 0, days = 0 }) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setMonth(d.getMonth() + months);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Períodos prontos; "custom" usa as datas digitadas
const PRESETS = {
  month: { label: 'Este mês', range: (t) => [`${t.slice(0, 7)}-01`, t] },
  last_month: { label: 'Mês anterior', range: (t) => { const first = shift(`${t.slice(0, 7)}-01`, { months: -1 }); return [first, shift(`${t.slice(0, 7)}-01`, { days: -1 })]; } },
  quarter: { label: 'Últimos 90 dias', range: (t) => [shift(t, { days: -89 }), t] },
  year: { label: 'Este ano', range: (t) => [`${t.slice(0, 4)}-01-01`, t] },
  last_year: { label: 'Últimos 12 meses', range: (t) => [shift(t, { months: -12, days: 1 }), t] },
  custom: { label: 'Personalizado' },
};

const decimal = (v, digits = 1) => Number(v).toFixed(digits).replace('.', ',');
const formatHours = (v) => (v === null || v === undefined ? '—' : `${decimal(v)} h`);
const formatPercent = (v) => (v === null || v === undefined ? '—' : `${decimal(v * 100)}%`);

const KIND_LABEL = { os: 'O.S.', falha: 'Falha', reparo: 'Reparo', peca: 'Peça' };
const KIND_COLOR = { os: 'var(--primary)', falha: 'var(--danger)', reparo: 'var(--success)', peca: 'var(--warning)' };

/** Relatório gerencial do período: O.S., preventivas, custos e indicadores por equipamento. */
const Reports = () => {
  const { scope, units } = useData();
  const { tenants, activeTenant } = useAuth();
  const [preset, setPreset] = useState('month');
  const [custom, setCustom] = useState(() => PRESETS.month.range(todayISO()));
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [historyFor, setHistoryFor] = useState(null);
  const [history, setHistory] = useState(null);

  const [from, to] = preset === 'custom' ? custom : PRESETS[preset].range(todayISO());
  const params = useMemo(() => ({ ...scope, from, to }), [scope, from, to]);

  useEffect(() => {
    if (!params.tenant_id || !from || !to || from > to) return;
    let cancelled = false;
    setLoading(true);
    apiFetch(withQuery('/api/reports/overview', params))
      .then((data) => { if (!cancelled) setReport(data); })
      .catch((err) => toast.error(err.message))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [params, from, to]);

  useEffect(() => {
    if (!historyFor) { setHistory(null); return; }
    let cancelled = false;
    apiFetch(withQuery(`/api/reports/equipment/${historyFor}`, params))
      .then((data) => { if (!cancelled) setHistory(data); })
      .catch((err) => toast.error(err.message));
    return () => { cancelled = true; };
  }, [historyFor, params]);

  const exportExcel = () => apiDownload(withQuery('/api/reports/overview.xlsx', params), 'relatorio.xlsx').catch((err) => toast.error(err.message));

  const tenantName = tenants.find((t) => t.id === activeTenant)?.name || '';
  const unitName = scope.unit_id ? units.find((u) => u.id === scope.unit_id)?.name : 'Todas as unidades';
  const months = (report?.costs.by_month || []).map((m) => ({ label: `${m.month.slice(5)}/${m.month.slice(2, 4)}`, cost: m.cost }));
  const wo = report?.work_orders;

  return (
    <div className="fade-in">
      <div className="print-only" style={styles.printHeader}>
        <h1 style={{ fontSize: '20px', fontWeight: 700 }}>Relatório de Manutenção — {tenantName}</h1>
        <p>Período: {formatDate(from)} a {formatDate(to)} · {unitName} · Emitido em {formatDate(todayISO())}</p>
      </div>

      <header className="page-header stack-mobile no-print" style={styles.header}>
        <div>
          <h1 style={styles.title}>Relatórios</h1>
          <p style={styles.subtitle}>Indicadores do período para acompanhar a manutenção e apresentar à gestão. {unitName}.</p>
        </div>
        <div style={styles.actions}>
          <button className="btn-secondary" onClick={exportExcel} disabled={!report}><FileSpreadsheet size={16} /> Excel</button>
          <button className="btn-primary" onClick={() => window.print()} disabled={!report}><Printer size={16} /> Imprimir / PDF</button>
        </div>
      </header>

      <div className="premium-card no-print stack-mobile" style={styles.filters}>
        <label style={styles.field}>
          <span style={styles.label}>Período</span>
          <select style={styles.input} value={preset} onChange={(e) => { setPreset(e.target.value); if (e.target.value === 'custom') setCustom([from, to]); }}>
            {Object.entries(PRESETS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
          </select>
        </label>
        {preset === 'custom' && (
          <>
            <label style={styles.field}>
              <span style={styles.label}>De</span>
              {/* O servidor aceita até 3 anos por relatório */}
              <input type="date" style={styles.input} value={custom[0]} min={shift(custom[1], { months: -36 })} max={custom[1]} onChange={(e) => setCustom([e.target.value, custom[1]])} />
            </label>
            <label style={styles.field}>
              <span style={styles.label}>Até</span>
              <input type="date" style={styles.input} value={custom[1]} min={custom[0]} onChange={(e) => setCustom([custom[0], e.target.value])} />
            </label>
          </>
        )}
        <p style={{ ...styles.subtitle, alignSelf: 'center' }}>{formatDate(from)} a {formatDate(to)}{loading ? ' · atualizando...' : ''}</p>
      </div>

      {!report ? <p style={styles.subtitle}>Carregando...</p> : (
        <>
          <div style={styles.kpis}>
            <Kpi label="O.S. abertas no período" value={wo.total} />
            <Kpi label="O.S. concluídas" value={wo.concluded_in_period} />
            <Kpi label="Tempo médio de solução" value={wo.avg_resolution_days === null ? '—' : `${decimal(wo.avg_resolution_days)} dias`} />
            <Kpi label="Cumprimento das preventivas" value={formatPercent(report.preventive.compliance)}
              note={`${report.preventive.completed} de ${report.preventive.scheduled} concluídas`} />
            <Kpi label="Custo de peças" value={formatCurrency(report.costs.parts_total)} />
            <Kpi label="Em aberto hoje" value={wo.open_now} note={report.preventive.overdue_plans ? `${report.preventive.overdue_plans} preventiva(s) vencida(s)` : 'Nenhuma preventiva vencida'} alert={report.preventive.overdue_plans > 0} />
          </div>

          <div style={styles.grid}>
            <section className="premium-card" style={styles.card}>
              <h3 style={styles.cardTitle}>Ordens de serviço no período</h3>
              <div style={styles.breakdowns}>
                <Breakdown title="Por tipo" data={wo.by_type} />
                <Breakdown title="Por status" data={wo.by_status} />
                <Breakdown title="Por prioridade" data={wo.by_priority} />
              </div>
            </section>
            <section className="premium-card" style={styles.card}>
              <h3 style={styles.cardTitle}>Custo de peças por mês</h3>
              {months.length === 0 ? <p style={styles.subtitle}>Nenhuma peça lançada nas O.S. do período.</p> : (
                <div style={{ height: 220 }}>
                  <ResponsiveContainer>
                    <BarChart data={months} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} width={70} tickFormatter={(v) => formatCurrency(v).replace(',00', '')} />
                      <Tooltip formatter={(v) => formatCurrency(v)} />
                      <Bar dataKey="cost" name="Custo" fill="#1e3a8a" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>
          </div>

          <section className="premium-card" style={styles.card}>
            <h3 style={styles.cardTitle}>Indicadores por equipamento</h3>
            <p style={{ ...styles.subtitle, marginBottom: '12px' }}>
              Falhas, reparos, MTTR e custo referem-se ao período. MTBF e disponibilidade usam as horas de operação acumuladas do equipamento.
            </p>
            <div className="table-wrap">
              <table style={styles.table}>
                <thead>
                  <tr style={styles.theadRow}>
                    {['Equipamento', 'Unidade', 'O.S.', 'Falhas', 'Reparos', 'MTTR', 'MTBF', 'Disponib.', 'Peças', ''].map((h) => <th key={h} style={styles.th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {report.equipments.map((e) => (
                    <tr key={e.id} style={styles.tr}>
                      <td style={{ ...styles.td, fontWeight: 600 }}>{e.name}</td>
                      <td style={styles.td}>{e.unit_name || '—'}</td>
                      <td style={styles.tdNum}>{e.work_orders}</td>
                      <td style={styles.tdNum}>{e.failures}</td>
                      <td style={styles.tdNum}>{e.repairs}</td>
                      <td style={styles.tdNum}>{formatHours(e.mttr)}</td>
                      <td style={styles.tdNum}>{formatHours(e.mtbf)}</td>
                      <td style={styles.tdNum}>{formatPercent(e.availability)}</td>
                      <td style={styles.tdNum}>{formatCurrency(e.parts_cost)}</td>
                      <td style={styles.td} className="no-print">
                        <button style={styles.linkBtn} onClick={() => setHistoryFor(e.id)} aria-label={`Histórico de ${e.name}`}>
                          <History size={14} /> Histórico
                        </button>
                      </td>
                    </tr>
                  ))}
                  {report.equipments.length === 0 && <tr><td colSpan={10} style={styles.td}>Nenhum equipamento nesta unidade.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          {history && (
            <section className="premium-card print-break" style={styles.card} aria-label="Histórico do equipamento">
              <div style={styles.historyHeader}>
                <div>
                  <h3 style={styles.cardTitle}>Histórico: {history.equipment.name}</h3>
                  <p style={styles.subtitle}>
                    {[history.equipment.type, history.equipment.model, history.equipment.serie && `Série ${history.equipment.serie}`, history.equipment.unit_name].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <button className="no-print" style={styles.iconBtn} onClick={() => setHistoryFor(null)} aria-label="Fechar histórico"><X size={18} /></button>
              </div>
              <p style={{ ...styles.subtitle, margin: '8px 0 16px' }}>
                {history.summary.work_orders} O.S. · {history.summary.failures} falha(s) · {history.summary.repairs} reparo(s) ·{' '}
                {formatHours(history.summary.repair_hours)} de reparo · MTTR {formatHours(history.summary.mttr)} · peças {formatCurrency(history.summary.parts_cost)}
              </p>
              {history.events.length === 0 ? <p style={styles.subtitle}>Nada registrado neste período.</p> : (
                <div className="table-wrap">
                  <table style={styles.table}>
                    <thead><tr style={styles.theadRow}><th style={styles.th}>Data</th><th style={styles.th}>Tipo</th><th style={styles.th}>Registro</th><th style={styles.th}>Detalhes</th></tr></thead>
                    <tbody>
                      {history.events.map((ev, i) => (
                        <tr key={`${ev.kind}-${ev.ref}-${i}`} style={styles.tr}>
                          <td style={styles.td}>{formatDate(ev.date)}</td>
                          <td style={{ ...styles.td, color: KIND_COLOR[ev.kind], fontWeight: 600 }}>{KIND_LABEL[ev.kind]}</td>
                          <td style={styles.td}>{ev.title}</td>
                          <td style={{ ...styles.td, color: 'var(--text-muted)' }}>{ev.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
};

const Kpi = ({ label, value, note, alert }) => (
  <div className="premium-card" style={styles.kpi}>
    <p style={styles.kpiLabel}>{label}</p>
    <p style={styles.kpiValue}>{value}</p>
    {note && <p style={{ ...styles.kpiNote, color: alert ? 'var(--danger)' : 'var(--text-muted)' }}>{note}</p>}
  </div>
);

const Breakdown = ({ title, data }) => {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  return (
    <div>
      <p style={styles.label}>{title}</p>
      {entries.length === 0 ? <p style={styles.subtitle}>—</p> : entries.map(([k, v]) => (
        <p key={k} style={styles.breakdownRow}><span>{k}</span><strong>{v}</strong></p>
      ))}
    </div>
  );
};

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '20px' },
  title: { fontSize: '28px', fontWeight: 700, color: 'var(--text-main)' },
  subtitle: { fontSize: '14px', color: 'var(--text-muted)' },
  actions: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  filters: { display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap', padding: '16px 20px', marginBottom: '20px', background: 'white' },
  field: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' },
  input: { padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', background: 'white' },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: '12px', marginBottom: '20px' },
  kpi: { padding: '16px', background: 'white' },
  kpiLabel: { fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' },
  kpiValue: { fontSize: '24px', fontWeight: 700, color: 'var(--text-main)', marginTop: '6px' },
  kpiNote: { fontSize: '12px', marginTop: '4px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: '20px', marginBottom: '20px' },
  card: { padding: '20px', background: 'white', marginBottom: '20px' },
  cardTitle: { fontSize: '16px', fontWeight: 700, marginBottom: '12px' },
  breakdowns: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '16px' },
  breakdownRow: { display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '14px', padding: '4px 0', borderBottom: '1px dashed var(--border)' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' },
  theadRow: { textAlign: 'left', color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' },
  th: { padding: '8px 10px', fontWeight: 600, whiteSpace: 'nowrap' },
  tr: { borderTop: '1px solid var(--border)' },
  td: { padding: '10px' },
  tdNum: { padding: '10px', textAlign: 'right', whiteSpace: 'nowrap' },
  linkBtn: { display: 'flex', alignItems: 'center', gap: '4px', background: 'transparent', color: 'var(--primary)', fontWeight: 600, cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap' },
  historyHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' },
  iconBtn: { background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' },
  printHeader: { marginBottom: '16px', borderBottom: '2px solid #1e3a8a', paddingBottom: '8px' },
};

export default Reports;
