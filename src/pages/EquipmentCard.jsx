import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Cpu, Plus, ClipboardList, CalendarCheck, History, AlertTriangle, QrCode, WifiOff } from 'lucide-react';
import { apiFetch, withQuery } from '../api/client';
import { useAuth, ROLES } from '../contexts/AuthContext';
import { formatDate } from '../utils/format';
import EquipmentQr from '../components/EquipmentQr';

const PRIORITY_COLOR = { 'Crítica': '#ef4444', Alta: '#f97316', 'Média': '#f59e0b', Baixa: '#10b981' };

/**
 * Ficha do equipamento, aberta ao escanear o QR Code da etiqueta. Pensada para o celular:
 * dados do equipamento, O.S. em aberto, próximas preventivas e botão para abrir uma O.S.
 */
const EquipmentCard = () => {
  const { id } = useParams();
  const { activeTenant, hasRole } = useAuth();
  const navigate = useNavigate();
  const [card, setCard] = useState(null);
  const [error, setError] = useState(null);
  const [showQr, setShowQr] = useState(false);
  const canManage = hasRole([ROLES.ROOT, ROLES.BACKOFFICE, ROLES.ADMIN, ROLES.MANAGER]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    apiFetch(withQuery(`/api/equipments/${id}/card`, { tenant_id: activeTenant }))
      .then((data) => { if (!cancelled) setCard(data); })
      .catch((err) => { if (!cancelled) setError(err); });
    return () => { cancelled = true; };
  }, [id, activeTenant]);

  if (error) {
    return (
      <div className="premium-card" style={styles.message}>
        {error.status === 0 ? <WifiOff size={32} color="var(--text-muted)" /> : <AlertTriangle size={32} color="var(--danger)" />}
        <p>{error.status === 0 ? 'Sem conexão e esta ficha ainda não foi aberta neste aparelho.' : error.message}</p>
        <Link to="/work-orders" className="btn-primary">Ir para as O.S.</Link>
      </div>
    );
  }
  if (!card) return <p style={styles.muted}>Carregando...</p>;

  const newOrder = () => navigate(`/work-orders?new=1&equipment=${card.id}`, { state: { equipment: { id: card.id, name: card.name } } });
  const details = [card.type, card.model, card.serie && `Série ${card.serie}`].filter(Boolean).join(' · ');

  return (
    <div className="fade-in" style={styles.page}>
      <section className="premium-card" style={styles.header}>
        <div style={styles.photo}>
          {card.image ? <img src={card.image} alt="" style={styles.img} /> : <Cpu size={32} color="var(--primary)" />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={styles.title}>{card.name}</h1>
          {details && <p style={styles.muted}>{details}</p>}
          <p style={styles.muted}>{card.unit_name}{card.total_op_time ? ` · ${Number(card.total_op_time).toLocaleString('pt-BR')} h de operação` : ''}</p>
        </div>
        {canManage && (
          <button style={styles.iconBtn} onClick={() => setShowQr(!showQr)} aria-label="Mostrar QR Code" title="QR Code"><QrCode size={20} /></button>
        )}
      </section>

      {showQr && (
        <div className="premium-card" style={styles.qr}>
          <EquipmentQr id={card.id} label={card.name} size={180} />
          <Link to={`/equipments/labels?ids=${card.id}`}>Imprimir etiqueta</Link>
        </div>
      )}

      <button className="btn-primary" style={styles.bigBtn} onClick={newOrder}>
        <Plus size={20} /> Abrir O.S. para este equipamento
      </button>

      <section className="premium-card" style={styles.section}>
        <h2 style={styles.h2}><ClipboardList size={18} /> O.S. em aberto ({card.open_orders.length})</h2>
        {card.open_orders.length === 0 ? <p style={styles.muted}>Nenhuma O.S. em aberto.</p> : (
          <ul style={styles.list}>
            {card.open_orders.map((o) => (
              <li key={o.id}>
                <Link to={`/work-orders?open=${o.id}`} style={styles.item}>
                  <span style={{ ...styles.dot, background: PRIORITY_COLOR[o.prioridade] }} aria-hidden="true" />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong style={styles.itemTitle}>#{o.id} {o.titulo}</strong>
                    <span style={styles.itemSub}>{o.tipo} · {o.prioridade} · {o.status}{o.responsavel ? ` · ${o.responsavel}` : ''}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {card.preventive_plans.length > 0 && (
        <section className="premium-card" style={styles.section}>
          <h2 style={styles.h2}><CalendarCheck size={18} /> Próximas preventivas</h2>
          <ul style={styles.list}>
            {card.preventive_plans.map((p) => (
              <li key={p.id} style={styles.row}>
                <span>{p.title}</span>
                <strong style={{ color: p.next_due < new Date().toISOString().slice(0, 10) ? 'var(--danger)' : 'var(--text-main)' }}>{formatDate(p.next_due)}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="premium-card" style={styles.section}>
        <h2 style={styles.h2}><History size={18} /> Últimas manutenções</h2>
        {card.recent_orders.length === 0 ? <p style={styles.muted}>Nenhuma O.S. concluída ainda.</p> : (
          <ul style={styles.list}>
            {card.recent_orders.map((o) => (
              <li key={o.id} style={styles.row}>
                <span style={{ minWidth: 0 }}>#{o.id} {o.titulo} <span style={styles.itemSub}>{o.tipo}{o.responsavel ? ` · ${o.responsavel}` : ''}</span></span>
                <span style={styles.muted}>{formatDate(o.data_conclusao)}</span>
              </li>
            ))}
          </ul>
        )}
        {card.last_failure && (
          <p style={{ ...styles.muted, marginTop: '12px' }}>Última falha: {formatDate(card.last_failure.data_falha)} — {card.last_failure.descricao}</p>
        )}
      </section>
    </div>
  );
};

const styles = {
  page: { maxWidth: '720px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' },
  header: { display: 'flex', gap: '16px', alignItems: 'center', padding: '20px', background: 'white' },
  photo: { width: '72px', height: '72px', borderRadius: '14px', background: 'rgba(30, 58, 138, 0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' },
  img: { width: '100%', height: '100%', objectFit: 'cover' },
  title: { fontSize: '22px', fontWeight: 700, lineHeight: 1.2 },
  muted: { fontSize: '14px', color: 'var(--text-muted)' },
  iconBtn: { background: 'transparent', color: 'var(--primary)', cursor: 'pointer', padding: '8px', alignSelf: 'flex-start' },
  qr: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '16px', background: 'white', fontWeight: 600 },
  bigBtn: { width: '100%', justifyContent: 'center', height: '52px', fontSize: '16px' },
  section: { padding: '18px 20px', background: 'white' },
  h2: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px', fontWeight: 700, marginBottom: '12px' },
  list: { listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px' },
  item: { display: 'flex', gap: '10px', alignItems: 'center', padding: '12px', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-main)', textDecoration: 'none' },
  dot: { width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0 },
  itemTitle: { display: 'block', fontSize: '14px' },
  itemSub: { display: 'block', fontSize: '12px', color: 'var(--text-muted)' },
  row: { display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '14px', padding: '6px 0', borderBottom: '1px dashed var(--border)' },
  message: { maxWidth: '480px', margin: '40px auto', padding: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', textAlign: 'center', background: 'white' },
};

export default EquipmentCard;
