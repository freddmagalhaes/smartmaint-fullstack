import { useState } from 'react';
import { 
  Plus, Search, 
  Calendar, Hash, Tag, Activity, X, Trash2, Edit2, Cpu, FileSpreadsheet, QrCode
} from 'lucide-react';
import { Link } from 'react-router-dom';
import ImportEquipmentsModal from '../components/ImportEquipmentsModal';
import { toast } from 'sonner';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch, withQuery } from '../api/client';
import { formatDate, todayISO, formatCurrency } from '../utils/format';
import { usePagedList, useDebounced } from '../hooks/usePagedList';
import Pagination from '../components/Pagination';

const Equipments = () => {
  const { units, activeUnit, addEquipment, updateEquipment, deleteEquipment } = useData();
  const { activeTenant } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  
  // Estado do formulário
  const [formData, setFormData] = useState({
    name: '',
    type: 'Mecânico',
    model: '',
    serie: '',
    image: '',
    total_op_time: 0,
    data_inicio: todayISO()
  });

  const search = useDebounced(searchTerm.trim());
  const list = usePagedList('/api/equipments', { q: search || undefined });
  const showUnits = units.length > 1;

  const handleOpenAdd = () => {
    setEditingId(null);
    setFormData({ 
      name: '', type: 'Mecânico', model: '', serie: '',
      unit_id: activeUnit || units[0]?.id || '',
      image: '',
      total_op_time: 0,
      data_inicio: todayISO()
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (eq) => {
    setEditingId(eq.id);
    setFormData({ ...eq });
    setIsModalOpen(true);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    const formDataObj = new FormData();
    formDataObj.append('file', file);

    try {
      const data = await apiFetch(withQuery('/api/upload', { tenant_id: activeTenant }), { method: 'POST', body: formDataObj });
      setFormData(prev => ({ ...prev, image: data.url }));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { name, type, model, serie, image, total_op_time, data_inicio, unit_id } = formData;
    const data = {
      name, type, model, serie, image: image || null, total_op_time: Number(total_op_time) || 0, data_inicio: data_inicio || null,
      ...(unit_id && { unit_id: Number(unit_id) }),
    };
    const ok = editingId ? await updateEquipment(editingId, data) : await addEquipment(data);
    if (ok) setIsModalOpen(false);
  };

  return (
    <div className="fade-in">
      <header className="page-header" style={styles.header}>
        <div>
          <h1 style={styles.pageTitle}>Gestão de Ativos</h1>
          <p style={styles.pageSubtitle}>Visualize e gerencie todos os equipamentos da planta.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Link to="/equipments/labels" style={styles.secondaryBtn}>
            <QrCode size={18} />
            Etiquetas QR
          </Link>
          <button type="button" style={styles.secondaryBtn} onClick={() => setIsImportOpen(true)}>
            <FileSpreadsheet size={18} />
            Importar planilha
          </button>
          <button className="btn-primary" onClick={handleOpenAdd}>
            <Plus size={20} />
            Novo Equipamento
          </button>
        </div>
      </header>
      {isImportOpen && <ImportEquipmentsModal onClose={() => setIsImportOpen(false)} />}

      {/* Filtros e Busca */}
      <div className="premium-card" style={styles.toolbar}>
        <div style={styles.searchWrapper}>
          <Search size={18} color="var(--text-muted)" />
          <input 
            type="text" 
            placeholder="Buscar por nome ou série..." 
            style={styles.searchInput}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Tabela de Equipamentos */}
      <div className="premium-card" style={styles.tableContainer}>
        <div className="table-wrap">
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Equipamento</th>
              <th style={styles.th}>Modelo / Série</th>
              <th style={styles.th}>Data Início</th>
              <th style={styles.th}>Horas Operação</th>
              <th style={styles.th}>Custo em peças</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((eq) => (
              <tr key={eq.id} style={styles.tr}>
                <td style={styles.td}>
                  <div style={styles.eqInfo}>
                    <div style={styles.eqIcon}>
                      {eq.image ? (
                        <img
                          src={eq.image}
                          loading="lazy"
                          alt={eq.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '10px' }}
                        />
                      ) : (
                        <Cpu size={20} color="var(--primary)" />
                      )}
                    </div>
                    <div>
                      <p style={styles.eqName}>{eq.name}</p>
                      <p style={styles.eqType}>{eq.type}{showUnits && eq.unit_name ? ` · ${eq.unit_name}` : ''}</p>
                    </div>
                  </div>
                </td>
                <td style={styles.td}>
                  <div style={styles.subInfo}>
                    <Tag size={14} />
                    <span>{eq.model}</span>
                  </div>
                  <div style={styles.subInfo}>
                    <Hash size={14} />
                    <span>{eq.serie}</span>
                  </div>
                </td>
                <td style={styles.td}>
                  <div style={styles.subInfo}>
                    <Calendar size={14} />
                    <span>{formatDate(eq.data_inicio)}</span>
                  </div>
                </td>
                <td style={styles.td}>
                  <div style={styles.opTime}>
                    <Activity size={14} />
                    <span>{Number(eq.total_op_time || 0).toLocaleString('pt-BR')}h</span>
                  </div>
                </td>
                <td style={styles.td}>{formatCurrency(eq.parts_cost)}</td>
                <td style={styles.td}>
                  {(() => {
                    // Equipamento com O.S. em execução está em manutenção
                    const maintenance = Number(eq.running_os_count) > 0;
                    const color = maintenance ? '#f59e0b' : '#16a34a';
                    return (
                      <div style={{ ...styles.statusBadge, background: `${color}15`, color }}>
                        <div style={{ ...styles.statusDot, background: color }}></div>
                        {maintenance ? 'Em Manutenção' : 'Operacional'}
                      </div>
                    );
                  })()}
                </td>
                <td style={styles.td}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Link to={`/equipamento/${eq.id}`} style={styles.actionBtn} title="Ficha e QR Code" aria-label={`Ficha e QR Code de ${eq.name}`}>
                      <QrCode size={16} />
                    </Link>
                    <button style={styles.actionBtn} title="Editar" aria-label={`Editar ${eq.name}`} onClick={() => handleOpenEdit(eq)}>
                      <Edit2 size={16} />
                    </button>
                    <button style={styles.actionBtn} title="Excluir" aria-label={`Excluir ${eq.name}`} onClick={() => deleteEquipment(eq.id)}>
                      <Trash2 size={16} color="var(--danger)" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {!list.loading && list.items.length === 0 && (
          <p style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
            {search ? 'Nenhum equipamento encontrado.' : 'Nenhum equipamento cadastrado. Clique em "Novo Equipamento" para começar.'}
          </p>
        )}
      </div>
      <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onChange={list.setPage} loading={list.loading} />

      {/* Modal de Cadastro/Edição */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="premium-card fade-in modal-card" style={styles.modal}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>{editingId ? 'Editar Equipamento' : 'Novo Equipamento'}</h3>
              <button onClick={() => setIsModalOpen(false)} style={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-grid" style={styles.formGrid}>
                <div style={{...styles.inputGroup, gridColumn: 'span 2'}}>
                  <label style={styles.label}>Nome do Equipamento</label>
                  <input 
                    required
                    type="text" 
                    style={styles.input} 
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                  />
                </div>
                {showUnits && (
                  <div style={{...styles.inputGroup, gridColumn: 'span 2'}}>
                    <label style={styles.label}>Unidade</label>
                    <select required style={styles.select} value={formData.unit_id || ''} onChange={(e) => setFormData({...formData, unit_id: e.target.value})}>
                      {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>
                )}
                <div style={{...styles.inputGroup, gridColumn: 'span 2'}}>
                  <label style={styles.label}>Foto do Equipamento</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {formData.image ? (
                      <img src={formData.image} alt="Pré-visualização" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border)' }} />
                    ) : (
                      <div className="flex-center" style={{ width: '48px', height: '48px', borderRadius: '8px', border: '1px dashed var(--border)' }}><Cpu size={20} color="var(--text-muted)" /></div>
                    )}
                    <input 
                      type="file" 
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleImageUpload}
                      disabled={isUploading}
                      style={{ fontSize: '13px' }}
                    />
                    {isUploading && <span style={{ fontSize: '13px', color: 'var(--primary)' }}>Enviando...</span>}
                  </div>
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Tipo</label>
                  <select 
                    style={styles.select}
                    value={formData.type}
                    onChange={(e) => setFormData({...formData, type: e.target.value})}
                  >
                    <option>Mecânico</option>
                    <option>Elétrico</option>
                    <option>Hidráulico</option>
                    <option>Pneumático</option>
                    <option>Robótica</option>
                  </select>
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Horas Totais (Op.)</label>
                  <input 
                    type="number" 
                    style={styles.input} 
                    value={formData.total_op_time ?? 0}
                    min="0"
                    onChange={(e) => setFormData({...formData, total_op_time: Number(e.target.value)})}
                  />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Modelo</label>
                  <input 
                    required
                    type="text" 
                    style={styles.input} 
                    value={formData.model || ''}
                    onChange={(e) => setFormData({...formData, model: e.target.value})}
                  />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Nº de Série</label>
                  <input 
                    required
                    type="text" 
                    style={styles.input} 
                    value={formData.serie || ''}
                    onChange={(e) => setFormData({...formData, serie: e.target.value})}
                  />
                </div>
              </div>
              <div style={styles.modalFooter}>
                <button type="button" onClick={() => setIsModalOpen(false)} style={styles.cancelBtn}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={isUploading}>
                  {editingId ? 'Salvar Alterações' : 'Criar Ativo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  secondaryBtn: { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'white', fontWeight: 500, color: 'var(--text-main)' },
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
  tableContainer: {
    overflow: 'hidden',
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
    verticalAlign: 'middle',
  },
  eqInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  eqIcon: {
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    background: 'rgba(30, 58, 138, 0.05)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eqName: {
    fontWeight: '600',
    color: 'var(--text-main)',
  },
  eqType: {
    fontSize: '12px',
    color: 'var(--text-muted)',
  },
  subInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    color: 'var(--text-muted)',
    fontSize: '13px',
    marginBottom: '4px',
  },
  opTime: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontWeight: '600',
    color: 'var(--primary)',
  },
  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '600',
  },
  statusDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
  },
  actionBtn: {
    color: 'var(--text-muted)',
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

export default Equipments;
