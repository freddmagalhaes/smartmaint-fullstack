import { useState } from 'react';
import { X, ArrowDownCircle, ArrowUpCircle, RefreshCw, RotateCcw } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { usePagedList } from '../hooks/usePagedList';
import Pagination from './Pagination';

const TYPES = {
  entrada: { label: 'Entrada', icon: ArrowDownCircle, color: 'var(--success)' },
  saida: { label: 'Saída', icon: ArrowUpCircle, color: 'var(--danger)' },
  ajuste: { label: 'Ajuste', icon: RefreshCw, color: 'var(--warning)' },
  estorno: { label: 'Estorno', icon: RotateCcw, color: 'var(--info)' },
};

const formatDateTime = (value) => new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** Entrada de mercadoria, ajuste por contagem e histórico de movimentações de uma peça. */
const StockMovementsModal = ({ item, onClose }) => {
  const { mutate } = useData();
  const [form, setForm] = useState({ type: 'entrada', value: '', note: '' });
  const history = usePagedList(`/api/inventory/${item.id}/movements`, {}, { pageSize: 15 });

  const submit = async (e) => {
    e.preventDefault();
    const body = form.type === 'entrada'
      ? { type: 'entrada', quantity: Number(form.value), note: form.note || null }
      : { type: 'ajuste', counted: Number(form.value), note: form.note || null };
    const result = await mutate({
      method: 'POST',
      path: `/api/inventory/${item.id}/movements`,
      body,
      success: form.type === 'entrada' ? 'Entrada registrada' : 'Estoque ajustado',
    });
    if (result) setForm({ ...form, value: '', note: '' });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="premium-card fade-in modal-card" style={styles.modal} role="dialog" aria-modal="true" aria-labelledby="stock-title" onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div>
            <h3 id="stock-title" style={styles.title}>{item.name}</h3>
            <p style={styles.muted}>Saldo atual: <strong>{history.items[0]?.balance_after ?? item.quantity}</strong> · mínimo {item.min_quantity}</p>
          </div>
          <button onClick={onClose} style={styles.iconBtn} aria-label="Fechar"><X size={20} /></button>
        </div>

        <form onSubmit={submit} style={styles.form} className="stack-mobile">
          <select style={styles.input} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} aria-label="Tipo de movimentação">
            <option value="entrada">Entrada (compra/recebimento)</option>
            <option value="ajuste">Ajuste (saldo contado)</option>
          </select>
          <input required type="number" min={form.type === 'entrada' ? 1 : 0} placeholder={form.type === 'entrada' ? 'Quantidade' : 'Saldo contado'} style={{ ...styles.input, maxWidth: '140px' }} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} aria-label="Quantidade" />
          <input maxLength={500} placeholder="Observação (ex.: NF 1234)" style={styles.input} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} aria-label="Observação" />
          <button type="submit" className="btn-primary">Registrar</button>
        </form>

        <h4 style={styles.subtitle}>Histórico</h4>
        <ul style={styles.list}>
          {history.items.map((m) => {
            const type = TYPES[m.type];
            return (
              <li key={m.id} style={styles.row}>
                <type.icon size={18} color={type.color} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '14px' }}>
                    <strong>{type.label}</strong> {m.quantity > 0 ? `+${m.quantity}` : m.quantity} → saldo {m.balance_after}
                  </p>
                  <p style={styles.muted}>
                    {formatDateTime(m.created_at)}{m.user_name ? ` · ${m.user_name}` : ''}
                    {m.work_order_id ? ` · O.S. #${m.work_order_id}${m.work_order_title ? ` (${m.work_order_title})` : ''}` : ''}
                    {m.note ? ` · ${m.note}` : ''}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
        <Pagination page={history.page} pageSize={history.pageSize} total={history.total} onChange={history.setPage} loading={history.loading} />
      </div>
    </div>
  );
};

const styles = {
  modal: { maxWidth: '620px', padding: '28px', background: 'white' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' },
  title: { fontSize: '20px', fontWeight: 700 },
  subtitle: { fontSize: '14px', fontWeight: 700, margin: '24px 0 8px' },
  muted: { fontSize: '12px', color: 'var(--text-muted)' },
  iconBtn: { background: 'transparent', color: 'var(--text-muted)' },
  form: { display: 'flex', gap: '8px', alignItems: 'center' },
  input: { flex: 1, minWidth: 0, padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', background: 'white' },
  list: { listStyle: 'none', display: 'grid' },
  row: { display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--bg-main)' },
};

export default StockMovementsModal;
