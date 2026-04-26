import React, { useState } from 'react';
import { 
  Building2, Users, UserCircle, Shield, 
  CreditCard, Bell, Save, Plus, Trash2, Edit2,
  Mail, ShieldCheck, ExternalLink, X
} from 'lucide-react';
import { useAuth, ROLES } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';

const Settings = () => {
  const { user, hasRole } = useAuth();
  const { users, addUser, updateUser, deleteUser } = useData();
  const [activeTab, setActiveTab] = useState(hasRole([ROLES.OWNER, ROLES.ADMIN]) ? 'company' : 'profile');
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  
  const [userFormData, setUserFormData] = useState({
    name: '',
    email: '',
    role: 'USUARIO'
  });

  const tabs = [
    { id: 'company', label: 'Empresa', icon: Building2, roles: [ROLES.OWNER, ROLES.ADMIN] },
    { id: 'users', label: 'Equipe', icon: Users, roles: [ROLES.OWNER, ROLES.ADMIN] },
    { id: 'profile', label: 'Meu Perfil', icon: UserCircle, roles: [ROLES.OWNER, ROLES.ADMIN, ROLES.USER] },
    { id: 'billing', label: 'Faturamento', icon: CreditCard, roles: [ROLES.OWNER] },
  ];

  const handleOpenAddUser = () => {
    setEditingUserId(null);
    setUserFormData({ name: '', email: '', role: 'USUARIO' });
    setIsUserModalOpen(true);
  };

  const handleOpenEditUser = (u) => {
    setEditingUserId(u.id);
    setUserFormData({ ...u });
    setIsUserModalOpen(true);
  };

  const handleUserSubmit = (e) => {
    e.preventDefault();
    if (editingUserId) {
      updateUser(editingUserId, userFormData);
    } else {
      addUser(userFormData);
    }
    setIsUserModalOpen(false);
  };

  const SectionHeader = ({ title, description }) => (
    <div style={styles.sectionHeader}>
      <h3 style={styles.sectionTitle}>{title}</h3>
      <p style={styles.sectionDesc}>{description}</p>
    </div>
  );

  return (
    <div className="fade-in">
      <header style={styles.header}>
        <div>
          <h1 style={styles.pageTitle}>Configurações</h1>
          <p style={styles.pageSubtitle}>Gerencie os detalhes da sua conta e da sua empresa.</p>
        </div>
      </header>

      <div style={styles.container}>
        {/* Sidebar de Abas */}
        <div className="premium-card" style={styles.tabSidebar}>
          {tabs.map((tab) => {
            if (!hasRole(tab.roles)) return null;
            const isActive = activeTab === tab.id;
            return (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  ...styles.tabBtn,
                  background: isActive ? 'rgba(30, 58, 138, 0.05)' : 'transparent',
                  color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                <tab.icon size={20} />
                <span style={{ fontWeight: isActive ? '600' : '400' }}>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Conteúdo da Aba */}
        <div className="premium-card" style={styles.contentArea}>
          {activeTab === 'company' && (
            <div className="fade-in">
              <SectionHeader 
                title="Informações da Empresa" 
                description="Dados básicos da sua organização e unidade fabril." 
              />
              <div style={styles.formGrid}>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Nome Fantasia</label>
                  <input type="text" defaultValue={user?.company} style={styles.input} />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>CNPJ</label>
                  <input type="text" placeholder="00.000.000/0001-00" style={styles.input} />
                </div>
              </div>
              <button className="btn-primary" style={{ marginTop: '24px' }}>
                <Save size={18} />
                Salvar Alterações
              </button>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="fade-in">
              <div style={styles.usersHeader}>
                <SectionHeader 
                  title="Gestão de Equipe" 
                  description="Adicione ou remova membros da sua unidade na empresa." 
                />
                <button className="btn-primary" onClick={handleOpenAddUser}>
                  <Plus size={18} />
                  Adicionar Membro
                </button>
              </div>

              <div style={styles.userList}>
                {users.map((u) => (
                  <div key={u.id} style={styles.userItem}>
                    <div style={styles.userAvatar}>
                      <UserCircle size={24} color={u.id === user?.id ? 'var(--primary)' : 'var(--text-muted)'} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={styles.userName}>{u.name} {u.id === user?.id && '(Você)'}</p>
                      <p style={styles.userEmail}>{u.email}</p>
                    </div>
                    <div style={{
                      ...styles.roleBadge,
                      background: u.role === 'DONO' ? 'rgba(30, 58, 138, 0.1)' : '#f1f5f9',
                      color: u.role === 'DONO' ? 'var(--primary)' : '#64748b'
                    }}>
                      <Shield size={12} />
                      {u.role}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button style={styles.actionBtn} onClick={() => handleOpenEditUser(u)}>
                        <Edit2 size={18} />
                      </button>
                      {u.id !== user?.id && (
                        <button style={styles.deleteBtn} onClick={() => deleteUser(u.id)}>
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="fade-in">
              <SectionHeader 
                title="Meu Perfil" 
                description="Suas informações pessoais de acesso ao sistema." 
              />
              <div style={styles.formGrid}>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Nome Completo</label>
                  <input type="text" defaultValue={user?.name} style={styles.input} />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>E-mail</label>
                  <input type="email" defaultValue={user?.email} style={styles.input} disabled />
                </div>
              </div>
              <button className="btn-primary" style={{ marginTop: '24px' }}>
                <Save size={18} />
                Atualizar Perfil
              </button>
            </div>
          )}

          {activeTab === 'billing' && (
            <div className="fade-in">
              <SectionHeader 
                title="Plano e Faturamento" 
                description="Gerencie sua assinatura do SmartMaint e histórico de pagamentos." 
              />
              <div style={styles.billingCard}>
                <div style={styles.billingHeader}>
                  <div>
                    <h4 style={styles.planTitle}>Plano Enterprise Industrial</h4>
                    <p style={styles.planDesc}>Ativos ilimitados • 15 usuários • Suporte 24/7</p>
                  </div>
                  <div style={styles.planStatus}>Ativo</div>
                </div>
                <button style={styles.billingBtn}>
                  Ver Notas Fiscais
                  <ExternalLink size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Novo/Editar Usuário */}
      {isUserModalOpen && (
        <div style={styles.modalOverlay}>
          <div className="premium-card fade-in" style={styles.modal}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>{editingUserId ? 'Editar Membro' : 'Adicionar Membro'}</h3>
              <button onClick={() => setIsUserModalOpen(false)} style={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleUserSubmit}>
              <div style={styles.formGrid}>
                <div style={{...styles.inputGroup, gridColumn: 'span 2'}}>
                  <label style={styles.label}>Nome Completo</label>
                  <input 
                    required 
                    type="text" 
                    style={styles.input} 
                    value={userFormData.name}
                    onChange={(e) => setUserFormData({...userFormData, name: e.target.value})}
                  />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>E-mail Corporativo</label>
                  <input 
                    required 
                    type="email" 
                    style={styles.input} 
                    value={userFormData.email}
                    onChange={(e) => setUserFormData({...userFormData, email: e.target.value})}
                  />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Cargo / Permissão</label>
                  <select 
                    style={styles.select}
                    value={userFormData.role}
                    onChange={(e) => setUserFormData({...userFormData, role: e.target.value})}
                  >
                    <option value="ADMINISTRADOR">Administrador</option>
                    <option value="USUARIO">Operador (Usuário)</option>
                  </select>
                </div>
              </div>
              <div style={styles.modalFooter}>
                <button type="button" onClick={() => setIsUserModalOpen(false)} style={styles.cancelBtn}>Cancelar</button>
                <button type="submit" className="btn-primary">
                  {editingUserId ? 'Salvar Alterações' : 'Convidar Membro'}
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
  header: { marginBottom: '32px' },
  pageTitle: { fontSize: '24px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '4px' },
  pageSubtitle: { fontSize: '14px', color: 'var(--text-muted)' },
  container: { display: 'grid', gridTemplateColumns: '260px 1fr', gap: '24px', alignItems: 'start' },
  tabSidebar: { padding: '12px', display: 'flex', flexDirection: 'column', gap: '4px' },
  tabBtn: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '8px', fontSize: '14px', textAlign: 'left', transition: 'var(--transition)' },
  contentArea: { padding: '40px', minHeight: '500px' },
  sectionHeader: { marginBottom: '32px', borderBottom: '1px solid var(--border)', paddingBottom: '20px' },
  sectionTitle: { fontSize: '18px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '4px' },
  sectionDesc: { fontSize: '14px', color: 'var(--text-muted)' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '8px' },
  label: { fontSize: '13px', fontWeight: '600', color: 'var(--text-main)' },
  input: { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px' },
  select: { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', background: 'white' },
  usersHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  userList: { display: 'flex', flexDirection: 'column', gap: '12px' },
  userItem: { display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' },
  userAvatar: { width: '40px', height: '40px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  userName: { fontSize: '14px', fontWeight: '600', color: 'var(--text-main)' },
  userEmail: { fontSize: '12px', color: 'var(--text-muted)' },
  roleBadge: { display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' },
  actionBtn: { color: 'var(--text-muted)', background: 'transparent', cursor: 'pointer', padding: '8px' },
  deleteBtn: { color: '#94a3b8', background: 'transparent', cursor: 'pointer', padding: '8px' },
  billingCard: { background: '#f8fafc', borderRadius: '16px', padding: '24px', border: '1px solid var(--border)' },
  billingHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' },
  planTitle: { fontSize: '16px', fontWeight: '700', color: 'var(--text-main)' },
  planDesc: { fontSize: '13px', color: 'var(--text-muted)' },
  planStatus: { background: 'var(--success)', color: 'white', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '700' },
  billingBtn: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--primary)', fontWeight: '600', background: 'transparent', cursor: 'pointer' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { width: '100%', maxWidth: '500px', padding: '32px', background: 'white' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
  modalTitle: { fontSize: '20px', fontWeight: '700' },
  closeBtn: { background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' },
  modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--border)', paddingTop: '20px', marginTop: '20px' },
  cancelBtn: { background: 'transparent', color: 'var(--text-muted)', fontWeight: '600', cursor: 'pointer' }
};

export default Settings;
