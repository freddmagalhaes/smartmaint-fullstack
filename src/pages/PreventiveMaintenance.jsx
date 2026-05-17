import { useState } from 'react';
import { 
  CalendarCheck, Plus, Search, 
  Edit2, Trash2, Clock, CheckCircle2, AlertCircle
} from 'lucide-react';
import { useData } from '../contexts/DataContext';

const PreventiveMaintenance = () => {
  const { preventivePlans, equipments, addPreventivePlan, updatePreventivePlan, deletePreventivePlan } = useData();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [formData, setFormData] = useState({
    equipment_id: equipments[0]?.id || '',
    title: '',
    description: '',
    interval_days: 30,
    status: 'Ativo'
  });

  const filteredPlans = preventivePlans.filter(plan => 
    plan.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (plan.equipment_name && plan.equipment_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleOpenAdd = () => {
    setEditingId(null);
    setFormData({ 
      equipment_id: equipments[0]?.id || '', 
      title: '', description: '', interval_days: 30, status: 'Ativo' 
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (plan) => {
    setEditingId(plan.id);
    setFormData({ ...plan });
    setIsModalOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = { 
      ...formData, 
      equipment_id: Number(formData.equipment_id),
      interval_days: Number(formData.interval_days)
    };
    if (editingId) {
      updatePreventivePlan(editingId, data);
    } else {
      addPreventivePlan(data);
    }
    setIsModalOpen(false);
  };

  const handleExecute = (id) => {
    if(window.confirm('Marcar este plano como executado hoje? Isso reiniciará o ciclo.')) {
      updatePreventivePlan(id, { reset_due: true });
    }
  };

  const getStatusColor = (status) => status === 'Ativo' ? 'var(--success)' : 'var(--text-muted)';

  return (
    <div className="fade-in">
      <header style={styles.header}>
        <div>
          <h1 style={styles.pageTitle}>Planos Preventivos</h1>
          <p style={styles.pageSubtitle}>Agende e controle manutenções recorrentes nos equipamentos.</p>
        </div>
        <button className="btn-primary" onClick={handleOpenAdd}>
          <Plus size={20} />
          Novo Plano
        </button>
      </header>

      <div className="premium-card" style={styles.toolbar}>
        <div style={styles.searchWrapper}>
          <Search size={18} color="var(--text-muted)" />
          <input 
            type="text" 
            placeholder="Buscar por título ou equipamento..." 
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
                <th style={styles.th}>Plano de Manutenção</th>
                <th style={styles.th}>Equipamento</th>
                <th style={styles.th}>Ciclo (Dias)</th>
                <th style={styles.th}>Próxima Execução</th>
                <th style={styles.th}>Status</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredPlans.length > 0 ? filteredPlans.map(plan => {
                const isLate = new Date(plan.next_due) < new Date() && plan.status === 'Ativo';
                return (
                  <tr key={plan.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ padding: '8px', background: 'var(--bg-main)', borderRadius: '8px' }}>
                          <CalendarCheck size={18} color="var(--primary)" />
                        </div>
                        <div>
                          <strong>{plan.title}</strong>
                          <div style={{fontSize:'12px', color:'var(--text-muted)'}}>{plan.description}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ ...styles.td, color: 'var(--text-muted)' }}>
                      <strong>{plan.equipment_name}</strong>
                    </td>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={14} color="var(--text-muted)" /> {plan.interval_days} dias
                      </div>
                    </td>
                    <td style={styles.td}>
                      {isLate ? (
                         <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--danger)', fontSize: '13px', fontWeight: '600' }}>
                           <AlertCircle size={14} /> {new Date(plan.next_due).toLocaleDateString('pt-BR')} (Atrasado)
                         </div>
                      ) : (
                        <div style={{ fontSize: '13px', color: 'var(--text-main)' }}>
                          {new Date(plan.next_due).toLocaleDateString('pt-BR')}
                        </div>
                      )}
                    </td>
                    <td style={styles.td}>
                      <div style={{
                        ...styles.statusBadge,
                        background: `${getStatusColor(plan.status)}15`,
                        color: getStatusColor(plan.status),
                      }}>
                        <div style={{ ...styles.statusDot, background: getStatusColor(plan.status) }}></div>
                        {plan.status}
                      </div>
                    </td>
                    <td style={{ ...styles.td, textAlign: 'right' }}>
                      <button title="Marcar como Executado Hoje" style={{...styles.iconBtn, color: 'var(--success)', marginRight: '8px'}} onClick={() => handleExecute(plan.id)}><CheckCircle2 size={16} /></button>
                      <button style={styles.iconBtn} onClick={() => handleOpenEdit(plan)}><Edit2 size={16} /></button>
                      <button style={{ ...styles.iconBtn, color: 'var(--danger)' }} onClick={() => deletePreventivePlan(plan.id)}><Trash2 size={16} /></button>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Nenhum plano preventivo encontrado.
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
              <h3 style={styles.modalTitle}>{editingId ? 'Editar Plano' : 'Novo Plano Preventivo'}</h3>
            </div>
            <form onSubmit={handleSubmit}>
              <div style={styles.formGrid}>
                <div style={{...styles.inputGroup, gridColumn: 'span 2'}}>
                  <label style={styles.label}>Título do Plano</label>
                  <input required style={styles.input} value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} placeholder="Ex: Troca de Óleo Mensal" />
                </div>
                <div style={{...styles.inputGroup, gridColumn: 'span 2'}}>
                  <label style={styles.label}>Descrição / Procedimento</label>
                  <textarea rows="3" style={styles.input} value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} placeholder="Instruções para o técnico..." />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Equipamento</label>
                  <select style={styles.input} value={formData.equipment_id} onChange={(e) => setFormData({...formData, equipment_id: e.target.value})}>
                    {equipments.map(eq => <option key={eq.id} value={eq.id}>{eq.name}</option>)}
                  </select>
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Intervalo (Dias)</label>
                  <input type="number" required min="1" style={styles.input} value={formData.interval_days} onChange={(e) => setFormData({...formData, interval_days: e.target.value})} />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Status</label>
                  <select style={styles.input} value={formData.status} onChange={(e) => setFormData({...formData, status: e.target.value})}>
                    <option value="Ativo">Ativo</option>
                    <option value="Pausado">Pausado</option>
                  </select>
                </div>
              </div>
              <div style={styles.modalFooter}>
                <button type="button" onClick={() => setIsModalOpen(false)} style={styles.cancelBtn}>Cancelar</button>
                <button type="submit" className="btn-primary">{editingId ? 'Salvar Alterações' : 'Cadastrar Plano'}</button>
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
  iconBtn: { background: 'transparent', border: 'none', color: '#94a3b8', padding: '6px', cursor: 'pointer', borderRadius: '6px', transition: '0.2s' },
  statusBadge: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '600' },
  statusDot: { width: '8px', height: '8px', borderRadius: '50%' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { width: '100%', maxWidth: '600px', padding: '32px', background: 'white' },
  modalHeader: { marginBottom: '24px' },
  modalTitle: { fontSize: '20px', fontWeight: '700' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '8px' },
  label: { fontSize: '13px', fontWeight: '600' },
  input: { padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', background: 'white' },
  modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '20px' },
  cancelBtn: { background: 'transparent', color: 'var(--text-muted)', fontWeight: '600', cursor: 'pointer' }
};

export default PreventiveMaintenance;
