import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  X, CheckSquare, Square, Package, MessageSquare, Paperclip, Trash2, Plus, Send, FileText, Cpu, Calendar, User,
} from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { useAuth, ROLES } from '../contexts/AuthContext';
import { apiFetch, withQuery } from '../api/client';
import { formatDate, formatCurrency } from '../utils/format';

const formatDateTime = (value) => new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/**
 * Detalhe da O.S.: checklist, peças (com baixa no estoque), comentários e anexos.
 * Operadores podem comentar e anexar fotos; gestores também lançam peças e marcam o checklist.
 */
const WorkOrderDetail = ({ workOrderId, onClose }) => {
  const { scope, mutate } = useData();
  const { user, hasRole } = useAuth();
  const canManage = hasRole([ROLES.ROOT, ROLES.BACKOFFICE, ROLES.ADMIN, ROLES.MANAGER]);
  const [os, setOs] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [part, setPart] = useState({ inventory_id: '', quantity: 1 });
  const [comment, setComment] = useState('');
  const [newItem, setNewItem] = useState('');
  const [uploading, setUploading] = useState(false);

  const url = useCallback((path) => withQuery(path, { tenant_id: scope.tenant_id }), [scope.tenant_id]);
  // Ref: o pai recria onClose a cada renderização; não deve disparar novo carregamento
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  const load = useCallback(async () => {
    try {
      setOs(await apiFetch(url(`/api/work-orders/${workOrderId}`)));
    } catch (err) {
      toast.error(err.message);
      closeRef.current();
    }
  }, [url, workOrderId]);

  useEffect(() => { load(); }, [load]);

  // Peças disponíveis para a unidade do equipamento (somente gestores lançam peças)
  useEffect(() => {
    if (!canManage || !os?.unit_id) return;
    apiFetch(withQuery('/api/inventory/options', { tenant_id: scope.tenant_id, unit_id: os.unit_id }))
      .then(setInventory)
      .catch(() => setInventory([]));
  }, [canManage, os?.unit_id, scope.tenant_id]);

  const act = async (request, success) => {
    const result = await mutate({ ...request, success });
    if (result) await load();
    return result;
  };

  if (!os) return null;
  const done = os.status === 'Concluída';
  const editable = canManage && !done;
  const pending = os.checklist.filter((c) => !c.done).length;

  const toggleItem = (item) => act({ method: 'PUT', path: `/api/work-orders/${os.id}/checklist/${item.id}`, body: { done: !item.done } });

  const addItem = async (e) => {
    e.preventDefault();
    if (await act({ method: 'POST', path: `/api/work-orders/${os.id}/checklist`, body: { description: newItem } })) setNewItem('');
  };

  const addPart = async (e) => {
    e.preventDefault();
    const ok = await act(
      { method: 'POST', path: `/api/work-orders/${os.id}/parts`, body: { inventory_id: Number(part.inventory_id), quantity: Number(part.quantity) } },
      'Peça lançada e baixada do estoque'
    );
    if (ok) setPart({ inventory_id: '', quantity: 1 });
  };

  const removePart = (p) => act(
    { method: 'DELETE', path: `/api/work-orders/${os.id}/parts/${p.id}`, confirmMessage: `Remover "${p.item_name}" da O.S.? A quantidade volta para o estoque.` },
    'Peça devolvida ao estoque'
  );

  const addComment = async (e) => {
    e.preventDefault();
    if (await act({ method: 'POST', path: `/api/work-orders/${os.id}/comments`, body: { body: comment } })) setComment('');
  };

  const upload = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    const body = new FormData();
    body.append('file', file);
    await act({ method: 'POST', path: `/api/work-orders/${os.id}/attachments`, body }, 'Anexo enviado');
    setUploading(false);
  };

  const removeAttachment = (a) => act(
    { method: 'DELETE', path: `/api/work-orders/${os.id}/attachments/${a.id}`, confirmMessage: 'Remover este anexo?' },
    'Anexo removido'
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="premium-card fade-in modal-card" style={styles.modal} role="dialog" aria-modal="true" aria-labelledby="os-title" onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={{ minWidth: 0 }}>
            <p style={styles.kicker}>O.S. #{os.id} · {os.tipo} · {os.prioridade}</p>
            <h3 id="os-title" style={styles.title}>{os.titulo}</h3>
          </div>
          <button onClick={onClose} style={styles.iconBtn} aria-label="Fechar"><X size={20} /></button>
        </div>

        <div style={styles.meta}>
          <span style={styles.metaItem}><Cpu size={14} /> {os.equipment_name}</span>
          <span style={styles.metaItem}><User size={14} /> {os.responsavel || 'A definir'}</span>
          <span style={styles.metaItem}><Calendar size={14} /> {formatDate(os.data_criacao)}</span>
          <span style={{ ...styles.badge, background: done ? 'rgba(16,185,129,0.12)' : 'rgba(59,130,246,0.12)', color: done ? '#047857' : '#1d4ed8' }}>{os.status}</span>
        </div>
        {os.preventive_plan_title && <p style={styles.note}>Gerada automaticamente pelo plano preventivo "{os.preventive_plan_title}".</p>}
        {os.descricao && <p style={styles.description}>{os.descricao}</p>}

        {/* Checklist */}
        {(os.checklist.length > 0 || editable) && (
          <section style={styles.section}>
            <h4 style={styles.sectionTitle}><CheckSquare size={16} /> Checklist {os.checklist.length > 0 && <span style={styles.count}>{os.checklist.length - pending}/{os.checklist.length}</span>}</h4>
            <ul style={styles.list}>
              {os.checklist.map((item) => (
                <li key={item.id}>
                  <button type="button" style={styles.checkItem} onClick={() => toggleItem(item)} disabled={!editable} aria-pressed={item.done}>
                    {item.done ? <CheckSquare size={18} color="var(--success)" /> : <Square size={18} color="var(--text-muted)" />}
                    <span style={{ textDecoration: item.done ? 'line-through' : 'none', color: item.done ? 'var(--text-muted)' : 'var(--text-main)' }}>{item.description}</span>
                    {item.done && item.done_by && <span style={styles.small}>{item.done_by}</span>}
                  </button>
                </li>
              ))}
            </ul>
            {editable && (
              <form onSubmit={addItem} style={styles.inlineForm}>
                <input required maxLength={500} placeholder="Novo item do checklist" style={styles.input} value={newItem} onChange={(e) => setNewItem(e.target.value)} aria-label="Novo item do checklist" />
                <button type="submit" style={styles.smallBtn} aria-label="Adicionar item"><Plus size={16} /></button>
              </form>
            )}
          </section>
        )}

        {/* Peças */}
        <section style={styles.section}>
          <h4 style={styles.sectionTitle}><Package size={16} /> Peças utilizadas <span style={styles.count}>{formatCurrency(os.parts_cost)}</span></h4>
          {os.parts.length === 0 && <p style={styles.small}>Nenhuma peça lançada.</p>}
          <ul style={styles.list}>
            {os.parts.map((p) => (
              <li key={p.id} style={styles.row}>
                <span style={{ flex: 1 }}>{p.quantity} × {p.item_name}</span>
                <span style={styles.small}>{formatCurrency(p.quantity * Number(p.unit_price))}</span>
                {editable && <button type="button" style={styles.iconBtn} onClick={() => removePart(p)} aria-label={`Remover ${p.item_name}`}><Trash2 size={16} /></button>}
              </li>
            ))}
          </ul>
          {editable && (
            <form onSubmit={addPart} style={styles.inlineForm}>
              <select required style={{ ...styles.input, flex: 3 }} value={part.inventory_id} onChange={(e) => setPart({ ...part, inventory_id: e.target.value })} aria-label="Peça do estoque">
                <option value="">{inventory.length ? 'Escolha a peça do estoque' : 'Sem peças com saldo para esta unidade'}</option>
                {inventory.map((i) => <option key={i.id} value={i.id}>{i.name}{i.sku ? ` (${i.sku})` : ''} · saldo {i.quantity}</option>)}
              </select>
              <input required type="number" min="1" style={{ ...styles.input, flex: 1, minWidth: '70px' }} value={part.quantity} onChange={(e) => setPart({ ...part, quantity: e.target.value })} aria-label="Quantidade" />
              <button type="submit" style={styles.smallBtn} aria-label="Lançar peça"><Plus size={16} /></button>
            </form>
          )}
        </section>

        {/* Anexos */}
        <section style={styles.section}>
          <h4 style={styles.sectionTitle}><Paperclip size={16} /> Fotos e anexos</h4>
          <div style={styles.attachments}>
            {os.attachments.map((a) => (
              <div key={a.id} style={styles.attachment}>
                <a href={a.url} target="_blank" rel="noreferrer" title={a.filename || 'Anexo'}>
                  {a.content_type.startsWith('image/')
                    ? <img src={a.url} alt={a.filename || 'Foto'} loading="lazy" style={styles.thumb} />
                    : <div style={{ ...styles.thumb, ...styles.pdf }}><FileText size={24} /> PDF</div>}
                </a>
                {(canManage || a.uploaded_by === user?.id) && (
                  <button type="button" style={styles.removeThumb} onClick={() => removeAttachment(a)} aria-label="Remover anexo"><X size={12} /></button>
                )}
              </div>
            ))}
            <label style={{ ...styles.thumb, ...styles.addThumb }} aria-label="Enviar foto ou PDF">
              {uploading ? '...' : <Plus size={20} />}
              <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" capture="environment" onChange={upload} disabled={uploading} style={{ display: 'none' }} />
            </label>
          </div>
        </section>

        {/* Comentários */}
        <section style={styles.section}>
          <h4 style={styles.sectionTitle}><MessageSquare size={16} /> Comentários</h4>
          <ul style={styles.list}>
            {os.comments.map((c) => (
              <li key={c.id} style={styles.comment}>
                <p style={styles.small}><strong>{c.user_name}</strong> · {formatDateTime(c.created_at)}</p>
                <p style={{ fontSize: '14px', whiteSpace: 'pre-wrap' }}>{c.body}</p>
              </li>
            ))}
          </ul>
          <form onSubmit={addComment} style={styles.inlineForm}>
            <input required maxLength={5000} placeholder="Escreva um comentário" style={styles.input} value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Comentário" />
            <button type="submit" style={styles.smallBtn} aria-label="Enviar comentário"><Send size={16} /></button>
          </form>
        </section>
      </div>
    </div>
  );
};

const styles = {
  modal: { maxWidth: '640px', padding: '28px', background: 'white' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' },
  kicker: { fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' },
  title: { fontSize: '20px', fontWeight: 700, wordBreak: 'break-word' },
  iconBtn: { background: 'transparent', color: 'var(--text-muted)', padding: '4px' },
  meta: { display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', marginBottom: '12px' },
  metaItem: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)' },
  badge: { padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' },
  note: { fontSize: '13px', color: 'var(--info)', marginBottom: '8px' },
  description: { fontSize: '14px', whiteSpace: 'pre-wrap', marginBottom: '8px' },
  section: { borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '16px' },
  sectionTitle: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 700, marginBottom: '10px' },
  count: { marginLeft: 'auto', fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 },
  list: { listStyle: 'none', display: 'grid', gap: '6px' },
  checkItem: { display: 'flex', alignItems: 'center', gap: '10px', width: '100%', textAlign: 'left', padding: '6px 4px', fontSize: '14px', background: 'transparent' },
  row: { display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px' },
  small: { fontSize: '12px', color: 'var(--text-muted)', marginLeft: 'auto' },
  inlineForm: { display: 'flex', gap: '8px', marginTop: '10px' },
  input: { flex: 1, minWidth: 0, padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', background: 'white' },
  smallBtn: { padding: '0 14px', borderRadius: '8px', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center' },
  attachments: { display: 'flex', flexWrap: 'wrap', gap: '10px' },
  attachment: { position: 'relative' },
  thumb: { width: '84px', height: '84px', borderRadius: '10px', objectFit: 'cover', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  pdf: { flexDirection: 'column', gap: '4px', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 },
  addThumb: { borderStyle: 'dashed', color: 'var(--text-muted)', cursor: 'pointer' },
  removeThumb: { position: 'absolute', top: '-6px', right: '-6px', width: '20px', height: '20px', borderRadius: '50%', background: 'var(--danger)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  comment: { padding: '8px 0', borderBottom: '1px solid var(--bg-main)' },
};

export default WorkOrderDetail;
