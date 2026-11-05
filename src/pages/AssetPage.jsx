import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ClipboardList, Cpu, Calendar, Hash, Activity, ArrowLeft, Loader2, AlertTriangle } from 'lucide-react';
import { useAuth, ROLES } from '../contexts/AuthContext';
import OfflineBanner from '../components/OfflineBanner';
import logo from '../assets/logo.png';

const day = (v) => (v ? String(v).split('T')[0] : null);
const fmtDate = (v) => {
  const d = day(v);
  if (!d) return '—';
  const [y, m, dd] = d.split('-');
  return `${dd}/${m}/${y}`;
};

const STATUS_COLOR = { 'Concluída': '#10b981', 'Aberta': '#f59e0b', 'Em Andamento': '#3b82f6' };

/**
 * Ficha do equipamento, aberta pelo QR code colado na máquina. Pensada para celular:
 * uma coluna, botões grandes e sem o menu lateral do sistema.
 */
const AssetPage = () => {
  const { id } = useParams();
  const { token, user, activeTenant, hasRole } = useAuth();
  const [state, setState] = useState({ status: 'loading', asset: null });

  useEffect(() => {
    let active = true;
    const backoffice = user?.isMaster || user?.role === 'Suporte';
    const url = `/api/equipments/${encodeURIComponent(id)}${backoffice ? `?tenant_id=${encodeURIComponent(activeTenant || '')}` : ''}`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!active) return;
        if (res.ok) setState({ status: 'ok', asset: await res.json() });
        else setState({ status: res.status === 404 ? 'notfound' : 'error', asset: null });
      })
      .catch(() => active && setState({ status: 'error', asset: null }));
    return () => { active = false; };
  }, [id, token, user, activeTenant]);

  const { status, asset } = state;
  const canSeeSystem = hasRole([ROLES.ROOT, ROLES.BACKOFFICE, ROLES.ADMIN, ROLES.MANAGER]);

  return (
    <div style={styles.page}>
      <OfflineBanner />
      <header style={styles.header}>
        <img src={logo} alt="" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
        <strong style={{ color: 'var(--primary)' }}>SmartMaint</strong>
        <Link to="/" style={styles.headerLink}><ArrowLeft size={16} /> Sistema</Link>
      </header>

      <main style={styles.main}>
        {status === 'loading' && <p style={styles.center}><Loader2 className="animate-spin" size={22} /> Carregando equipamento…</p>}

        {status === 'notfound' && (
          <div className="premium-card" style={styles.card} role="alert">
            <AlertTriangle size={28} color="#f59e0b" />
            <h1 style={styles.h1}>Equipamento não encontrado</h1>
            <p style={styles.muted}>Ele pode ter sido excluído ou pertencer a outra empresa. Confira se você entrou com a conta correta.</p>
          </div>
        )}

        {status === 'error' && (
          <div className="premium-card" style={styles.card} role="alert">
            <AlertTriangle size={28} color="#ef4444" />
            <h1 style={styles.h1}>Não foi possível carregar</h1>
            <p style={styles.muted}>Verifique sua conexão e tente de novo.</p>
          </div>
        )}

        {status === 'ok' && (
          <>
            <div className="premium-card" style={styles.card}>
              <div style={styles.iconCircle}><Cpu size={26} /></div>
              <h1 style={styles.h1}>{asset.name}</h1>
              <p style={styles.muted}>{[asset.type, asset.model].filter(Boolean).join(' • ') || 'Sem tipo/modelo cadastrado'}</p>
              <dl style={styles.grid}>
                <div><dt style={styles.dt}><Hash size={14} /> Série</dt><dd style={styles.dd}>{asset.serie || '—'}</dd></div>
                <div><dt style={styles.dt}><Activity size={14} /> Horas operadas</dt><dd style={styles.dd}>{asset.total_op_time ?? 0} h</dd></div>
                <div><dt style={styles.dt}><Calendar size={14} /> Início de operação</dt><dd style={styles.dd}>{fmtDate(asset.data_inicio)}</dd></div>
                <div><dt style={styles.dt}><AlertTriangle size={14} /> Falhas registradas</dt><dd style={styles.dd}>{asset.failures_count}</dd></div>
              </dl>
              <Link to={`/work-orders?equipment=${asset.id}&new=1`} className="btn-primary" style={styles.bigBtn}>
                <ClipboardList size={20} /> Abrir O.S. para este equipamento
              </Link>
              {canSeeSystem && <Link to="/equipments" style={styles.secondary}>Ver todos os equipamentos</Link>}
            </div>

            <section className="premium-card" style={styles.card}>
              <h2 style={styles.h2}>Últimas ordens de serviço</h2>
              {asset.work_orders.length === 0 ? <p style={styles.muted}>Nenhuma O.S. para este equipamento.</p> : (
                <ul style={styles.list}>
                  {asset.work_orders.map((w) => (
                    <li key={w.id} style={styles.li}>
                      <div>
                        <strong style={{ fontSize: '14px' }}>{w.titulo}</strong>
                        <div style={styles.muted}>{w.tipo} • prioridade {w.prioridade} • {fmtDate(w.data_criacao)}</div>
                      </div>
                      <span style={{ ...styles.chip, color: STATUS_COLOR[w.status] || '#64748b', borderColor: STATUS_COLOR[w.status] || '#cbd5e1' }}>{w.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="premium-card" style={styles.card}>
              <h2 style={styles.h2}>Manutenção preventiva</h2>
              {asset.preventive_plans.length === 0 ? <p style={styles.muted}>Nenhum plano preventivo cadastrado.</p> : (
                <ul style={styles.list}>
                  {asset.preventive_plans.map((p) => (
                    <li key={p.id} style={styles.li}>
                      <div>
                        <strong style={{ fontSize: '14px' }}>{p.title}</strong>
                        <div style={styles.muted}>Próxima: {fmtDate(p.next_due)}</div>
                      </div>
                      <span style={{ ...styles.chip, color: '#64748b', borderColor: '#cbd5e1' }}>{p.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
};

const styles = {
  page: { minHeight: '100vh', background: 'var(--bg-main)' },
  header: { display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: 'white', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 5 },
  headerLink: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '14px', fontWeight: 600, color: 'var(--primary)' },
  main: { maxWidth: '560px', margin: '0 auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' },
  card: { padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'white' },
  center: { display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center', padding: '48px 0', color: 'var(--text-muted)' },
  iconCircle: { width: '52px', height: '52px', borderRadius: '14px', background: 'rgba(30, 58, 138, 0.08)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  h1: { fontSize: '22px', fontWeight: 700, margin: 0, lineHeight: 1.2 },
  h2: { fontSize: '16px', fontWeight: 700, margin: 0 },
  muted: { fontSize: '13px', color: 'var(--text-muted)', margin: 0 },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', margin: '4px 0' },
  dt: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '2px' },
  dd: { margin: 0, fontSize: '15px', fontWeight: 600 },
  bigBtn: { minHeight: '52px', justifyContent: 'center', fontSize: '15px', textAlign: 'center' },
  secondary: { textAlign: 'center', padding: '12px', fontSize: '14px', fontWeight: 600, color: 'var(--primary)' },
  list: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '12px' },
  li: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--border)' },
  chip: { fontSize: '12px', fontWeight: 700, border: '1px solid', borderRadius: '999px', padding: '2px 10px', whiteSpace: 'nowrap' },
};

export default AssetPage;
