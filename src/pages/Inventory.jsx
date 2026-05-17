import { useState } from 'react';
import { 
  Package, Plus, Search, 
  Edit2, Trash2, AlertCircle, Hash, DollarSign
} from 'lucide-react';
import { useData } from '../contexts/DataContext';

const Inventory = () => {
  const { inventory, addInventoryItem, updateInventoryItem, deleteInventoryItem } = useData();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    quantity: 0,
    min_quantity: 5,
    unit_price: 0
  });

  const filteredInventory = inventory.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (item.sku && item.sku.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleOpenAdd = () => {
    setEditingId(null);
    setFormData({ name: '', sku: '', quantity: 0, min_quantity: 5, unit_price: 0 });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item) => {
    setEditingId(item.id);
    setFormData({ ...item });
    setIsModalOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = { 
      ...formData, 
      quantity: Number(formData.quantity),
      min_quantity: Number(formData.min_quantity),
      unit_price: Number(formData.unit_price)
    };
    if (editingId) {
      updateInventoryItem(editingId, data);
    } else {
      addInventoryItem(data);
    }
    setIsModalOpen(false);
  };

  return (
    <div className="fade-in">
      <header style={styles.header}>
        <div>
          <h1 style={styles.pageTitle}>Estoque de Peças</h1>
          <p style={styles.pageSubtitle}>Gerencie o inventário de reposição para manutenções.</p>
        </div>
        <button className="btn-primary" onClick={handleOpenAdd}>
          <Plus size={20} />
          Nova Peça
        </button>
      </header>

      <div className="premium-card" style={styles.toolbar}>
        <div style={styles.searchWrapper}>
          <Search size={18} color="var(--text-muted)" />
          <input 
            type="text" 
            placeholder="Buscar peça ou SKU..." 
            style={styles.searchInput}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="premium-card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-main)', borderBottom: '1px solid var(--border)' }}>
                <th style={styles.th}>Peça</th>
                <th style={styles.th}>SKU</th>
                <th style={styles.th}>Quantidade</th>
                <th style={styles.th}>Preço Unitário</th>
                <th style={styles.th}>Status</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredInventory.length > 0 ? filteredInventory.map(item => {
                const isLow = item.quantity <= item.min_quantity;
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ padding: '8px', background: 'var(--bg-main)', borderRadius: '8px' }}>
                          <Package size={18} color="var(--primary)" />
                        </div>
                        <strong>{item.name}</strong>
                      </div>
                    </td>
                    <td style={{ ...styles.td, color: 'var(--text-muted)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Hash size={14} /> {item.sku || '-'}
                      </div>
                    </td>
                    <td style={styles.td}>
                      <strong>{item.quantity}</strong> <span style={{fontSize:'12px', color:'var(--text-muted)'}}>/ min {item.min_quantity}</span>
                    </td>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <DollarSign size={14} color="var(--text-muted)" /> {Number(item.unit_price).toFixed(2)}
                      </div>
                    </td>
                    <td style={styles.td}>
                      {isLow ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--danger)', fontSize: '12px', fontWeight: '600' }}>
                          <AlertCircle size={14} /> Baixo
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--success)', fontSize: '12px', fontWeight: '600' }}>
                          Normal
                        </div>
                      )}
                    </td>
                    <td style={{ ...styles.td, textAlign: 'right' }}>
                      <button style={styles.iconBtn} onClick={() => handleOpenEdit(item)}><Edit2 size={16} /></button>
                      <button style={{ ...styles.iconBtn, color: 'var(--danger)' }} onClick={() => deleteInventoryItem(item.id)}><Trash2 size={16} /></button>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Nenhuma peça encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div style={styles.modalOverlay}>
          <div className="premium-card fade-in" style={styles.modal}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>{editingId ? 'Editar Peça' : 'Nova Peça'}</h3>
            </div>
            <form onSubmit={handleSubmit}>
              <div style={styles.formGrid}>
                <div style={{...styles.inputGroup, gridColumn: 'span 2'}}>
                  <label style={styles.label}>Nome da Peça</label>
                  <input required style={styles.input} value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>SKU / Código</label>
                  <input style={styles.input} value={formData.sku} onChange={(e) => setFormData({...formData, sku: e.target.value})} />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Preço Unitário (R$)</label>
                  <input type="number" step="0.01" style={styles.input} value={formData.unit_price} onChange={(e) => setFormData({...formData, unit_price: e.target.value})} />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Quantidade Atual</label>
                  <input type="number" required style={styles.input} value={formData.quantity} onChange={(e) => setFormData({...formData, quantity: e.target.value})} />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Quantidade Mínima</label>
                  <input type="number" required style={styles.input} value={formData.min_quantity} onChange={(e) => setFormData({...formData, min_quantity: e.target.value})} />
                </div>
              </div>
              <div style={styles.modalFooter}>
                <button type="button" onClick={() => setIsModalOpen(false)} style={styles.cancelBtn}>Cancelar</button>
                <button type="submit" className="btn-primary">{editingId ? 'Salvar Alterações' : 'Cadastrar Peça'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' },
  pageTitle: { fontSize: '24px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '4px' },
  pageSubtitle: { fontSize: '14px', color: 'var(--text-muted)' },
  toolbar: { padding: '16px 24px', marginBottom: '24px' },
  searchWrapper: { display: 'flex', alignItems: 'center', gap: '12px', flex: 1, maxWidth: '400px' },
  searchInput: { width: '100%', border: 'none', fontSize: '14px', outline: 'none' },
  th: { padding: '16px 24px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' },
  td: { padding: '16px 24px', fontSize: '14px', color: 'var(--text-main)', verticalAlign: 'middle' },
  iconBtn: { background: 'transparent', border: 'none', color: '#94a3b8', padding: '8px', cursor: 'pointer', borderRadius: '6px', transition: '0.2s' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { width: '100%', maxWidth: '600px', padding: '32px', background: 'white' },
  modalHeader: { marginBottom: '24px' },
  modalTitle: { fontSize: '20px', fontWeight: '700' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '8px' },
  label: { fontSize: '13px', fontWeight: '600' },
  input: { padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px' },
  modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '20px' },
  cancelBtn: { background: 'transparent', color: 'var(--text-muted)', fontWeight: '600', cursor: 'pointer' }
};

export default Inventory;
