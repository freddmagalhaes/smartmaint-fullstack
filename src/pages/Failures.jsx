import { useState } from 'react';
import { 
  AlertTriangle, Wrench, Clock, 
  Search, CheckCircle2, X, Trash2, Edit2
} from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { formatDate } from '../utils/format';
import { usePagedList } from '../hooks/usePagedList';
import Pagination from '../components/Pagination';

const Failures = () => {
  const { equipments, addFailure, updateFailure, deleteFailure } = useData();
  const [activeTab, setActiveTab] = useState('failures');
  const failures = usePagedList('/api/failures', {}, { pageSize: 20, enabled: activeTab === 'failures' });
  const repairs = usePagedList('/api/repairs', {}, { pageSize: 20, enabled: activeTab === 'repairs' });
  const current = activeTab === 'failures' ? failures : repairs;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  const [formData, setFormData] = useState({
    equipment_id: equipments[0]?.id || '',
    descricao: '',
    tempo_operacao: ''
  });


  const handleOpenAdd = () => {
    setEditingId(null);
    setFormData({ equipment_id: equipments[0]?.id || '', descricao: '', tempo_operacao: '' });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (f) => {
    setEditingId(f.id);
    setFormData({ ...f });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const data = {
      equipment_id: Number(formData.equipment_id),
      descricao: formData.descricao,
      tempo_operacao: Number(formData.tempo_operacao),
      ...(formData.data_falha && { data_falha: formData.data_falha }),
    };
    const ok = editingId ? await updateFailure(editingId, data) : await addFailure(data);
    if (ok) setIsModalOpen(false);
  };

  return (
    <div className="fade-in">
      <header className="page-header" style={styles.header}>
        <div>
          <h1 style={styles.pageTitle}>Eventos de Manutenção</h1>
          <p style={styles.pageSubtitle}>Histórico completo de falhas e reparos realizados.</p>
        </div>
        <div style={styles.tabGroup}>
          <button 
            style={{...styles.tab, borderBottom: activeTab === 'failures' ? '2px solid var(--primary)' : 'none'}}
            onClick={() => setActiveTab('failures')}
          >
            <AlertTriangle size={18} color={activeTab === 'failures' ? 'var(--primary)' : 'var(--text-muted)'} />
            <span style={{color: activeTab === 'failures' ? 'var(--primary)' : 'var(--text-muted)'}}>Falhas</span>
          </button>
          <button 
            style={{...styles.tab, borderBottom: activeTab === 'repairs' ? '2px solid var(--primary)' : 'none'}}
            onClick={() => setActiveTab('repairs')}
          >
            <Wrench size={18} color={activeTab === 'repairs' ? 'var(--primary)' : 'var(--text-muted)'} />
            <span style={{color: activeTab === 'repairs' ? 'var(--primary)' : 'var(--text-muted)'}}>Reparos</span>
          </button>
        </div>
      </header>

      {/* Toolbar */}
      <div className="premium-card" style={styles.toolbar}>
        <div style={styles.searchWrapper}>
          <Search size={18} color="var(--text-muted)" />
          <input type="text" placeholder="Filtrar por equipamento ou descrição..." style={styles.searchInput} />
        </div>
        {/* Reparos são gerados ao concluir uma O.S. */}
        {activeTab === 'failures' && (
          <button className="btn-primary" onClick={handleOpenAdd} disabled={equipments.length === 0}>
            <Plus size={18} />
            Registrar Falha
          </button>
        )}
      </div>

      {/* Listagem */}
      <div style={styles.listContainer}>
        {activeTab === 'failures' ? (
          failures.items.map((failure) => (
            <div key={failure.id} className="premium-card" style={styles.eventCard}>
              <div style={{...styles.eventIcon, overflow: 'hidden'}}>
                {failure.equipment_image ? (
                  <img src={failure.equipment_image} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <AlertTriangle size={20} color="var(--danger)" />
                )}
              </div>
              <div style={styles.eventInfo}>
                <div style={styles.eventHeader}>
                  <h3 style={styles.eventTitle}>{failure.equipment_name}</h3>
                  <span style={styles.eventDate}>{formatDate(failure.data_falha)}</span>
                </div>
                <p style={styles.eventDesc}>{failure.descricao}</p>
                <div style={styles.eventMeta}>
                  <Clock size={14} />
                  <span>Operou por {failure.tempo_operacao}h até a falha</span>
                </div>
              </div>
              <div style={styles.eventAction}>
                <button style={styles.actionBtn} title="Editar" aria-label="Editar falha" onClick={() => handleOpenEdit(failure)}>
                  <Edit2 size={18} />
                </button>
                <button style={styles.deleteBtn} title="Excluir" aria-label="Excluir falha" onClick={() => deleteFailure(failure.id)}>
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))
        ) : (
          repairs.items.map((repair) => (
            <div key={repair.id} className="premium-card" style={styles.eventCard}>
              <div style={{...styles.eventIcon, background: 'rgba(22, 163, 74, 0.1)'}}>
                <CheckCircle2 size={20} color="var(--success)" />
              </div>
              <div style={styles.eventInfo}>
                <div style={styles.eventHeader}>
                  <h3 style={styles.eventTitle}>{repair.equipment_name}</h3>
                  <span style={styles.eventDate}>{formatDate(repair.data_reparo)}</span>
                </div>
                <p style={styles.eventDesc}>Manutenção {repair.tipo} concluída com sucesso.</p>
                <div style={styles.eventMeta}>
                  <Clock size={14} />
                  <span>Duração do Reparo: {Number(repair.tempo_reparo)}h</span>
                </div>
              </div>
            </div>
          ))
        )}
        {!current.loading && current.items.length === 0 && (
          <p style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
            {activeTab === 'failures' ? 'Nenhuma falha registrada.' : 'Nenhum reparo ainda: eles são registrados ao concluir uma O.S.'}
          </p>
        )}
      </div>
      <Pagination page={current.page} pageSize={current.pageSize} total={current.total} onChange={current.setPage} loading={current.loading} />

      {/* Modal de Registro */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="premium-card fade-in modal-card" style={styles.modal}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>{editingId ? 'Editar Ocorrência' : 'Registrar Ocorrência'}</h3>
              <button onClick={() => setIsModalOpen(false)} style={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-grid" style={styles.formGrid}>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Ativo Afetado</label>
                  <select 
                    style={styles.select}
                    value={formData.equipment_id}
                    onChange={(e) => setFormData({...formData, equipment_id: e.target.value})}
                  >
                    {equipments.map(eq => (
                      <option key={eq.id} value={eq.id}>{eq.name}</option>
                    ))}
                  </select>
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Tempo de Operação (desde último reparo)</label>
                  <input 
                    required
                    type="number" 
                    style={styles.input} 
                    placeholder="Ex: 450"
                    value={formData.tempo_operacao}
                    onChange={(e) => setFormData({...formData, tempo_operacao: e.target.value})}
                  />
                </div>
                <div style={{...styles.inputGroup, gridColumn: 'span 2'}}>
                  <label style={styles.label}>Descrição da Falha</label>
                  <textarea 
                    required
                    style={{...styles.input, height: '80px', resize: 'none'}} 
                    placeholder="Descreva o que ocorreu..."
                    value={formData.descricao}
                    onChange={(e) => setFormData({...formData, descricao: e.target.value})}
                  />
                </div>
              </div>
              <div style={styles.modalFooter}>
                <button type="button" onClick={() => setIsModalOpen(false)} style={styles.cancelBtn}>Cancelar</button>
                <button type="submit" className="btn-primary">
                  {editingId ? 'Salvar Alterações' : 'Registrar Evento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const Plus = ({ size }) => <Wrench size={size} />; // Fallback icon

const styles = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '32px',
  },
  pageTitle: {
    fontSize: '24px',
    fontWeight: '700',
    color: 'var(--text-main)',
    marginBottom: '4px',
  },
  pageSubtitle: {
    fontSize: '14px',
    color: 'var(--text-muted)',
  },
  tabGroup: {
    display: 'flex',
    background: 'white',
    padding: '4px',
    borderRadius: '12px',
    border: '1px solid var(--border)',
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 20px',
    fontSize: '14px',
    fontWeight: '600',
    transition: 'var(--transition)',
    background: 'transparent',
    cursor: 'pointer',
  },
  toolbar: {
    padding: '16px 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  searchWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flex: 1,
    maxWidth: '400px',
  },
  searchInput: {
    width: '100%',
    border: 'none',
    fontSize: '14px',
    color: 'var(--text-main)',
  },
  listContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  eventCard: {
    padding: '20px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '20px',
  },
  eventIcon: {
    width: '44px',
    height: '44px',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  eventInfo: {
    flex: 1,
  },
  eventHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '4px',
  },
  eventTitle: {
    fontSize: '16px',
    fontWeight: '700',
    color: 'var(--text-main)',
  },
  eventDate: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    fontWeight: '500',
  },
  eventDesc: {
    fontSize: '14px',
    color: 'var(--text-muted)',
    marginBottom: '12px',
  },
  eventMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    color: 'var(--primary)',
    fontWeight: '600',
  },
  eventAction: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  actionBtn: {
    color: 'var(--text-muted)',
    padding: '8px',
    borderRadius: '8px',
    background: 'transparent',
    cursor: 'pointer',
  },
  deleteBtn: {
    color: '#94a3b8',
    padding: '8px',
    borderRadius: '8px',
    background: 'transparent',
    cursor: 'pointer',
  },
  modal: {
    width: '100%',
    maxWidth: '600px',
    padding: '32px',
    background: 'white',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  modalTitle: {
    fontSize: '20px',
    fontWeight: '700',
    color: 'var(--text-main)',
  },
  closeBtn: {
    color: 'var(--text-muted)',
    background: 'transparent',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px',
    marginBottom: '32px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-main)',
  },
  input: {
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    fontSize: '14px',
  },
  select: {
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    fontSize: '14px',
    background: 'white',
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    borderTop: '1px solid var(--border)',
    paddingTop: '20px',
  },
  cancelBtn: {
    padding: '10px 20px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    background: 'transparent',
  }
};

export default Failures;
