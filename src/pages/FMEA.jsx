import React, { useState, useMemo } from 'react';
import { 
  Activity, AlertTriangle, AlertCircle, 
  ShieldAlert, Info, TrendingUp, Search, Plus, X, Trash2, Edit2
} from 'lucide-react';
import { calculateRPN } from '../utils/formulas';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';

const FMEA = () => {
  const { activeTenant } = useAuth();
  const { equipments, fmea, addFmea, updateFmea, deleteFmea } = useData();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  const [formData, setFormData] = useState({
    equipment_id: equipments[0]?.id || '',
    componente: '',
    modo_falha: '',
    severity: 5,
    ocorrencia: 5,
    deteccao: 5
  });

  const getEquipmentName = (id) => {
    return equipments.find(eq => eq.id === id)?.name || 'Desconhecido';
  };

  const getRiskColor = (rpn) => {
    if (rpn >= 100) return 'var(--danger)';
    if (rpn >= 50) return 'var(--warning)';
    return 'var(--success)';
  };

  const getRiskLabel = (rpn) => {
    if (rpn >= 100) return 'Crítico';
    if (rpn >= 50) return 'Médio';
    return 'Baixo';
  };

  const handleOpenAdd = () => {
    setEditingId(null);
    setFormData({ equipment_id: equipments[0]?.id || '', componente: '', modo_falha: '', severity: 5, ocorrencia: 5, deteccao: 5 });
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
      equipment_id: Number(formData.equipment_id),
      severity: Number(formData.severity),
      ocorrencia: Number(formData.ocorrencia),
      deteccao: Number(formData.deteccao)
    };

    if (editingId) {
      updateFmea(editingId, data);
    } else {
      addFmea(data);
    }
    setIsModalOpen(false);
  };

  return (
    <div className="fade-in">
      <header style={styles.header}>
        <div>
          <h1 style={styles.pageTitle}>Análise de Risco (FMEA)</h1>
          <p style={styles.pageSubtitle}>Priorize suas ações de manutenção baseado no RPN (Risk Priority Number).</p>
        </div>
        <div style={styles.rpnBadge}>
          <Activity size={16} />
          <span>RPN = S × O × D</span>
        </div>
      </header>

      {/* Tabela FMEA */}
      <div className="premium-card" style={styles.tableCard}>
        <div style={styles.toolbar}>
          <div style={styles.searchWrapper}>
            <Search size={18} color="var(--text-muted)" />
            <input type="text" placeholder="Filtrar por equipamento ou componente..." style={styles.searchInput} />
          </div>
          <button className="btn-primary" onClick={handleOpenAdd}>
            <Plus size={18} />
            Nova Análise
          </button>
        </div>

        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Ativo / Componente</th>
              <th style={styles.th}>Modo de Falha</th>
              <th style={styles.th}>S</th>
              <th style={styles.th}>O</th>
              <th style={styles.th}>D</th>
              <th style={styles.th}>RPN</th>
              <th style={styles.th}>Risco</th>
              <th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {fmea.map((item) => {
              const rpn = calculateRPN(item.severity, item.ocorrencia, item.deteccao);
              return (
                <tr key={item.id} style={styles.tr}>
                  <td style={styles.td}>
                    <p style={styles.eqName}>{getEquipmentName(item.equipment_id)}</p>
                    <p style={styles.compName}>{item.componente}</p>
                  </td>
                  <td style={styles.td}>
                    <span style={styles.failureMode}>{item.modo_falha}</span>
                  </td>
                  <td style={styles.td}>{item.severity}</td>
                  <td style={styles.td}>{item.ocorrencia}</td>
                  <td style={styles.td}>{item.deteccao}</td>
                  <td style={styles.td}>
                    <span style={{...styles.rpnValue, color: getRiskColor(rpn)}}>{rpn}</span>
                  </td>
                  <td style={styles.td}>
                    <div style={{
                      ...styles.riskBadge,
                      background: `${getRiskColor(rpn)}15`,
                      color: getRiskColor(rpn),
                    }}>
                      {getRiskLabel(rpn)}
                    </div>
                  </td>
                  <td style={styles.td}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button style={styles.actionBtn} onClick={() => handleOpenEdit(item)}>
                        <Edit2 size={16} />
                      </button>
                      <button style={styles.deleteBtn} onClick={() => deleteFmea(item.id)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal de Análise */}
      {isModalOpen && (
        <div style={styles.modalOverlay}>
          <div className="premium-card fade-in" style={styles.modal}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>{editingId ? 'Editar Análise' : 'Nova Análise FMEA'}</h3>
              <button onClick={() => setIsModalOpen(false)} style={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div style={styles.formGrid}>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Equipamento</label>
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
                  <label style={styles.label}>Componente</label>
                  <input 
                    required
                    type="text" 
                    style={styles.input} 
                    placeholder="Ex: Rolamento"
                    value={formData.componente}
                    onChange={(e) => setFormData({...formData, componente: e.target.value})}
                  />
                </div>
                <div style={{...styles.inputGroup, gridColumn: 'span 2'}}>
                  <label style={styles.label}>Modo de Falha</label>
                  <input 
                    required
                    type="text" 
                    style={styles.input} 
                    placeholder="Ex: Desgaste Excessivo"
                    value={formData.modo_falha}
                    onChange={(e) => setFormData({...formData, modo_falha: e.target.value})}
                  />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Severidade (S): {formData.severity}</label>
                  <input type="range" min="1" max="10" value={formData.severity} onChange={(e) => setFormData({...formData, severity: e.target.value})} />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Ocorrência (O): {formData.ocorrencia}</label>
                  <input type="range" min="1" max="10" value={formData.ocorrencia} onChange={(e) => setFormData({...formData, ocorrencia: e.target.value})} />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Detecção (D): {formData.deteccao}</label>
                  <input type="range" min="1" max="10" value={formData.deteccao} onChange={(e) => setFormData({...formData, deteccao: e.target.value})} />
                </div>
              </div>
              <div style={styles.modalFooter}>
                <button type="button" onClick={() => setIsModalOpen(false)} style={styles.cancelBtn}>Cancelar</button>
                <button type="submit" className="btn-primary">
                  {editingId ? 'Salvar Alterações' : 'Salvar Análise'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Legenda e Info */}
      <div style={styles.infoGrid}>
        <div className="premium-card" style={styles.infoCard}>
          <h4 style={styles.infoTitle}>Legenda de Variáveis</h4>
          <div style={styles.legendGrid}>
            <div style={styles.legendItem}>
              <strong>S (Severidade):</strong> Impacto da falha na operação (1-10)
            </div>
            <div style={styles.legendItem}>
              <strong>O (Ocorrência):</strong> Frequência com que a falha acontece (1-10)
            </div>
            <div style={styles.legendItem}>
              <strong>D (Detecção):</strong> Facilidade de detectar antes da falha (1-10)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  rpnBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    background: 'var(--primary)',
    color: 'white',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '700',
  },
  tableCard: {
    overflow: 'hidden',
    marginBottom: '24px',
  },
  toolbar: {
    padding: '16px 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid var(--border)',
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
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left',
    padding: '16px 24px',
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderBottom: '1px solid var(--border)',
    background: 'rgba(248, 250, 252, 0.5)',
  },
  tr: {
    borderBottom: '1px solid var(--border)',
    transition: 'var(--transition)',
  },
  td: {
    padding: '16px 24px',
    fontSize: '14px',
  },
  eqName: {
    fontWeight: '700',
    color: 'var(--text-main)',
  },
  compName: {
    fontSize: '12px',
    color: 'var(--text-muted)',
  },
  failureMode: {
    fontSize: '14px',
    color: 'var(--text-main)',
  },
  rpnValue: {
    fontSize: '16px',
    fontWeight: '800',
  },
  riskBadge: {
    display: 'inline-flex',
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '11px',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  actionBtn: {
    color: 'var(--text-muted)',
    background: 'transparent',
    padding: '8px',
    cursor: 'pointer',
  },
  deleteBtn: {
    color: '#94a3b8',
    background: 'transparent',
    padding: '8px',
    cursor: 'pointer',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    width: '100%',
    maxWidth: '550px',
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
  closeBtn: { background: 'transparent', color: 'var(--text-muted)' },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px',
    marginBottom: '32px',
  },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '8px' },
  label: { fontSize: '13px', fontWeight: '600' },
  input: { padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' },
  select: { padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'white' },
  modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--border)', paddingTop: '20px' },
  cancelBtn: { background: 'transparent', color: 'var(--text-muted)', fontWeight: '600' },
  infoGrid: { display: 'grid', gridTemplateColumns: '1fr', gap: '24px' },
  infoCard: { padding: '24px' },
  infoTitle: { fontSize: '15px', fontWeight: '700', marginBottom: '16px' },
  legendGrid: { display: 'flex', flexDirection: 'column', gap: '12px' },
  legendItem: { fontSize: '13px', color: 'var(--text-muted)' }
};

export default FMEA;
