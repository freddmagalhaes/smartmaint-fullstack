import { useState } from 'react';
import { 
  Plus, Search, 
  AlertCircle, Printer,
  User, Cpu, Tag, Calendar, X, Edit2, Trash2
} from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { useAuth, ROLES } from '../contexts/AuthContext';
import { escapeHtml, formatDate } from '../utils/format';

const WorkOrders = () => {
  const { equipments, workOrders, users, addWorkOrder, updateWorkOrder, deleteWorkOrder } = useData();
  const { hasRole } = useAuth();
  // Usuário operacional apenas abre e acompanha chamados
  const canManage = hasRole([ROLES.ROOT, ROLES.BACKOFFICE, ROLES.ADMIN, ROLES.MANAGER]);
  const [completing, setCompleting] = useState(null); // O.S. sendo concluída (pede o tempo de reparo)
  const [repairHours, setRepairHours] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  const [formData, setFormData] = useState({
    equipment_id: equipments[0]?.id || '',
    titulo: '',
    tipo: 'Preventiva',
    prioridade: 'Média',
    status: 'Aberta',
    responsavel: users[0]?.name || ''
  });

  const getEquipmentName = (id) => equipments.find(eq => eq.id === id)?.name || 'Desconhecido';

  const getStatusColor = (status) => {
    switch (status) {
      case 'Aberta': return '#3b82f6';
      case 'Em Execução': return '#f59e0b';
      case 'Concluída': return '#10b981';
      case 'Pausada': return '#ef4444';
      default: return '#64748b';
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'Crítica': return '#ef4444';
      case 'Alta': return '#f97316';
      case 'Média': return '#f59e0b';
      default: return '#10b981';
    }
  };

  const handleOpenAdd = () => {
    setEditingId(null);
    setFormData({ 
      equipment_id: equipments[0]?.id || '', 
      titulo: '', tipo: 'Preventiva', prioridade: 'Média', 
      status: 'Aberta', responsavel: users[0]?.name || '' 
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (os) => {
    setEditingId(os.id);
    setFormData({ ...os });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { equipment_id, titulo, descricao, tipo, prioridade, responsavel } = formData;
    const data = { equipment_id: Number(equipment_id), titulo, descricao, tipo, prioridade, responsavel };
    const ok = editingId ? await updateWorkOrder(editingId, data) : await addWorkOrder(data);
    if (ok) setIsModalOpen(false);
  };

  const updateStatus = (id, newStatus) => {
    updateWorkOrder(id, { status: newStatus });
  };

  const openComplete = (os) => {
    setCompleting(os);
    setRepairHours(os.tempo_reparo || '');
  };

  const handleComplete = async (e) => {
    e.preventDefault();
    const ok = await updateWorkOrder(completing.id, { status: 'Concluída', tempo_reparo: Number(repairHours) });
    if (ok) setCompleting(null);
  };

  const handlePrint = (os) => {
    // Todo texto vindo do usuário é escapado: a janela de impressão compartilha a origem do sistema
    const v = (value) => escapeHtml(value);
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Ordem de Serviço #${v(os.id)}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
            .header { border-bottom: 2px solid #1e3a8a; padding-bottom: 20px; margin-bottom: 30px; }
            h1 { color: #1e3a8a; margin: 0 0 10px 0; }
            .meta { display: flex; justify-content: space-between; margin-bottom: 30px; }
            .box { border: 1px solid #ccc; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
            .box h3 { margin-top: 0; color: #1e3a8a; }
            .footer { margin-top: 50px; text-align: center; }
            .signature { margin-top: 60px; border-top: 1px solid #333; width: 300px; padding-top: 10px; display: inline-block; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Ordem de Serviço #${v(os.id)}</h1>
            <p><strong>Status:</strong> ${v(os.status)} | <strong>Prioridade:</strong> ${v(os.prioridade)}</p>
          </div>
          <div class="meta">
            <div><strong>Data de Abertura:</strong> ${v(formatDate(os.data_criacao))}</div>
            <div><strong>Responsável:</strong> ${v(os.responsavel)}</div>
          </div>
          <div class="box">
            <h3>Detalhes da Manutenção</h3>
            <p><strong>Equipamento:</strong> ${v(getEquipmentName(os.equipment_id))}</p>
            <p><strong>Tipo de Manutenção:</strong> ${v(os.tipo)}</p>
            <p><strong>Título:</strong> ${v(os.titulo)}</p>
            ${os.descricao ? `<p><strong>Descrição:</strong> ${v(os.descricao)}</p>` : ''}
            ${os.tempo_reparo ? `<p><strong>Tempo de reparo:</strong> ${v(os.tempo_reparo)} h</p>` : ''}
          </div>
          <div class="box">
            <h3>Peças / Materiais Utilizados</h3>
            <p><br/><br/></p>
          </div>
          <div class="box">
            <h3>Observações Técnicas</h3>
            <p><br/><br/><br/></p>
          </div>
          <div class="footer">
            <div class="signature">
              Assinatura do Técnico (${v(os.responsavel)})
            </div>
            <div class="signature" style="margin-left: 50px;">
              Assinatura do Cliente / Supervisor
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  };

  return (
    <div className="fade-in">
      <header className="page-header" style={styles.header}>
        <div>
          <h1 style={styles.pageTitle}>Ordens de Serviço</h1>
          <p style={styles.pageSubtitle}>Planejamento e controle das atividades de manutenção.</p>
        </div>
        <button className="btn-primary" onClick={handleOpenAdd} disabled={equipments.length === 0} title={equipments.length === 0 ? 'Cadastre um equipamento primeiro' : undefined}>
          <Plus size={20} />
          Abrir O.S.
        </button>
      </header>

      {/* Toolbar */}
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

      {/* Grid de O.S. */}
      <div style={styles.grid}>
        {workOrders.filter(os => 
          os.titulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
          getEquipmentName(os.equipment_id).toLowerCase().includes(searchTerm.toLowerCase())
        ).map((os) => (
          <div key={os.id} className="premium-card" style={styles.card}>
            <div style={styles.cardHeader}>
              <div style={{...styles.statusBadge, background: `${getStatusColor(os.status)}15`, color: getStatusColor(os.status)}}>
                {os.status}
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button title="Imprimir O.S." style={styles.iconBtn} onClick={() => handlePrint(os)}><Printer size={14} /></button>
                {canManage && (
                  <>
                    <button title="Editar" aria-label="Editar O.S." style={styles.iconBtn} onClick={() => handleOpenEdit(os)}><Edit2 size={14} /></button>
                    <button title="Excluir" aria-label="Excluir O.S." style={styles.iconBtn} onClick={() => deleteWorkOrder(os.id)}><Trash2 size={14} color="var(--danger)" /></button>
                  </>
                )}
              </div>
            </div>

            <h3 style={styles.cardTitle}>{os.titulo}</h3>
            
            <div style={styles.cardMeta}>
              <div style={styles.metaItem}>
                <Cpu size={14} />
                <span>{getEquipmentName(os.equipment_id)}</span>
              </div>
              <div style={styles.metaItem}>
                <Tag size={14} />
                <span>{os.tipo}</span>
              </div>
              <div style={styles.metaItem}>
                <User size={14} />
                <span>{os.responsavel}</span>
              </div>
              <div style={styles.metaItem}>
                <Calendar size={14} />
                <span>{formatDate(os.data_criacao)}</span>
              </div>
            </div>

            <div style={styles.cardFooter}>
              <div style={{...styles.priorityBadge, color: getPriorityColor(os.prioridade)}}>
                <AlertCircle size={14} />
                {os.prioridade}
              </div>
              <div style={styles.actionGroup}>
                {canManage && (os.status === 'Aberta' || os.status === 'Pausada') && (
                  <button style={styles.startBtn} onClick={() => updateStatus(os.id, 'Em Execução')}>{os.status === 'Pausada' ? 'Retomar' : 'Iniciar'}</button>
                )}
                {canManage && os.status === 'Em Execução' && (
                  <>
                    <button style={styles.pauseBtn} onClick={() => updateStatus(os.id, 'Pausada')}>Pausar</button>
                    <button style={styles.doneBtn} onClick={() => openComplete(os)}>Concluir</button>
                  </>
                )}
                {os.status === 'Concluída' && os.tempo_reparo && (
                  <span style={styles.repairInfo}>{Number(os.tempo_reparo)} h de reparo</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="premium-card fade-in modal-card" style={styles.modal}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>{editingId ? 'Editar O.S.' : 'Abrir Nova O.S.'}</h3>
              <button onClick={() => setIsModalOpen(false)} style={styles.closeBtn}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-grid" style={styles.formGrid}>
                <div style={{...styles.inputGroup, gridColumn: 'span 2'}}>
                  <label style={styles.label}>Título da Atividade</label>
                  <input required maxLength={255} style={styles.input} value={formData.titulo} onChange={(e) => setFormData({...formData, titulo: e.target.value})} />
                </div>
                <div style={{...styles.inputGroup, gridColumn: 'span 2'}}>
                  <label style={styles.label}>Descrição (opcional)</label>
                  <textarea rows={3} maxLength={5000} style={styles.input} value={formData.descricao || ''} onChange={(e) => setFormData({...formData, descricao: e.target.value})} />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Equipamento</label>
                  <select style={styles.select} value={formData.equipment_id} onChange={(e) => setFormData({...formData, equipment_id: e.target.value})}>
                    {equipments.map(eq => <option key={eq.id} value={eq.id}>{eq.name}</option>)}
                  </select>
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Responsável</label>
                  <select style={styles.select} value={formData.responsavel || ''} onChange={(e) => setFormData({...formData, responsavel: e.target.value})}>
                    <option value="">A definir</option>
                    {users.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                  </select>
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Tipo</label>
                  <select style={styles.select} value={formData.tipo} onChange={(e) => setFormData({...formData, tipo: e.target.value})}>
                    <option>Preventiva</option>
                    <option>Corretiva</option>
                    <option>Preditiva</option>
                    <option>Melhoria</option>
                  </select>
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Prioridade</label>
                  <select style={styles.select} value={formData.prioridade} onChange={(e) => setFormData({...formData, prioridade: e.target.value})}>
                    <option>Baixa</option>
                    <option>Média</option>
                    <option>Alta</option>
                    <option>Crítica</option>
                  </select>
                </div>
              </div>
              <div style={styles.modalFooter}>
                <button type="button" onClick={() => setIsModalOpen(false)} style={styles.cancelBtn}>Cancelar</button>
                <button type="submit" className="btn-primary">{editingId ? 'Salvar O.S.' : 'Abrir O.S.'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de conclusão: o tempo real de reparo alimenta MTTR e disponibilidade */}
      {completing && (
        <div className="modal-overlay">
          <div className="premium-card fade-in modal-card" style={{ ...styles.modal, maxWidth: '420px' }}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Concluir O.S. #{completing.id}</h3>
              <button onClick={() => setCompleting(null)} style={styles.closeBtn} aria-label="Fechar"><X size={20} /></button>
            </div>
            <form onSubmit={handleComplete}>
              <div style={styles.inputGroup}>
                <label style={styles.label} htmlFor="repair-hours">Tempo efetivo de reparo (horas)</label>
                <input id="repair-hours" required autoFocus type="number" min="0.1" step="0.1" style={styles.input} value={repairHours} onChange={(e) => setRepairHours(e.target.value)} />
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Usado no cálculo de MTTR e disponibilidade do equipamento.</p>
              </div>
              <div style={styles.modalFooter}>
                <button type="button" onClick={() => setCompleting(null)} style={styles.cancelBtn}>Cancelar</button>
                <button type="submit" className="btn-primary">Concluir O.S.</button>
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
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: '24px' },
  card: { padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  statusBadge: { padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' },
  iconBtn: { background: 'transparent', color: '#94a3b8', padding: '4px' },
  cardTitle: { fontSize: '16px', fontWeight: '700', color: 'var(--text-main)' },
  cardMeta: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  metaItem: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-muted)' },
  cardFooter: { marginTop: '8px', paddingTop: '16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  priorityBadge: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '600' },
  startBtn: { padding: '6px 16px', borderRadius: '6px', background: '#3b82f6', color: 'white', fontSize: '12px', fontWeight: '600' },
  actionGroup: { display: 'flex', alignItems: 'center', gap: '8px' },
  pauseBtn: { padding: '6px 12px', borderRadius: '6px', background: '#f1f5f9', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600' },
  repairInfo: { fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' },
  doneBtn: { padding: '6px 16px', borderRadius: '6px', background: '#10b981', color: 'white', fontSize: '12px', fontWeight: '600' },
  modal: { width: '100%', maxWidth: '550px', padding: '32px', background: 'white' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
  modalTitle: { fontSize: '20px', fontWeight: '700' },
  closeBtn: { background: 'transparent', color: 'var(--text-muted)' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '8px' },
  label: { fontSize: '13px', fontWeight: '600' },
  input: { padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px' },
  select: { padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'white' },
  modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '20px' },
  cancelBtn: { background: 'transparent', color: 'var(--text-muted)', fontWeight: '600' }
};

export default WorkOrders;
