import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Building2, Users, UserCircle, Shield,
  CreditCard, Save, Plus, Trash2, Edit2,
  X, FileText, CalendarDays, RefreshCw, CheckCircle2, KeyRound, Factory, History
} from 'lucide-react';
import UnitsTab from './settings/UnitsTab';
import AuditTab from './settings/AuditTab';
import BillingTab from './settings/BillingTab';
import DataExport from './settings/DataExport';
import { useAuth, ROLES, isBackofficeUser } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { apiFetch, withQuery } from '../api/client';
import { formatDate, formatCurrency, parseLocalDate } from '../utils/format';

const TEAM_ROLES = [
  { value: ROLES.ADMIN, label: 'Administrador' },
  { value: ROLES.MANAGER, label: 'Gerente / Supervisor' },
  { value: ROLES.USER, label: 'Operador (Usuário)' },
];

const EMPTY_USER = { name: '', email: '', role: ROLES.USER, password: '' };

// Dados cadastrais da empresa (também usados como tomador na nota fiscal de serviço)
const COMPANY_FIELDS = ['name', 'razao_social', 'cnpj', 'email_financeiro', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'municipio_ibge'];
const ADDRESS_FIELDS = [
  { key: 'razao_social', label: 'Razão social', span: 2 },
  { key: 'email_financeiro', label: 'E-mail financeiro (recebe faturas e notas)', type: 'email', span: 2 },
  { key: 'cep', label: 'CEP', maxLength: 9 },
  { key: 'logradouro', label: 'Logradouro' },
  { key: 'numero', label: 'Número', maxLength: 20 },
  { key: 'complemento', label: 'Complemento', maxLength: 100 },
  { key: 'bairro', label: 'Bairro', maxLength: 100 },
  { key: 'cidade', label: 'Cidade', maxLength: 100 },
  { key: 'uf', label: 'UF', maxLength: 2 },
  { key: 'municipio_ibge', label: 'Código IBGE do município', maxLength: 7 },
];

const Settings = () => {
  const { user, activeTenant, tenants, hasRole, setToken, updateCurrentUser, refreshTenants } = useAuth();
  const { users, addUser, updateUser, deleteUser } = useData();
  const [searchParams] = useSearchParams();
  const canAdmin = hasRole([ROLES.ROOT, ROLES.BACKOFFICE, ROLES.ADMIN]);
  // Conta ainda sem assinatura: só empresa, perfil e faturamento
  const isPending = !isBackofficeUser(user) && user?.tenant_status === 'Pendente';

  const tabs = [
    { id: 'company', label: 'Empresa', icon: Building2, visible: canAdmin },
    { id: 'users', label: 'Equipe', icon: Users, visible: canAdmin && !isPending },
    { id: 'units', label: 'Unidades', icon: Factory, visible: canAdmin && !isPending },
    { id: 'audit', label: 'Auditoria', icon: History, visible: canAdmin && !isPending },
    { id: 'profile', label: 'Meu Perfil', icon: UserCircle, visible: true },
    { id: 'billing', label: 'Faturamento', icon: CreditCard, visible: canAdmin },
  ].filter((tab) => tab.visible);

  const requestedTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    tabs.some((t) => t.id === requestedTab) ? requestedTab : (isPending ? 'billing' : canAdmin ? 'company' : 'profile')
  );
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);

  // Dados do contrato do tenant ativo
  const currentTenant = tenants.find(t => t.id === activeTenant) || null;

  const [userFormData, setUserFormData] = useState(EMPTY_USER);
  const [companyForm, setCompanyForm] = useState({ name: '', cnpj: '' });
  const [profileName, setProfileName] = useState(user?.name || '');
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    if (!currentTenant) return;
    setCompanyForm(Object.fromEntries(COMPANY_FIELDS.map((f) => [f, currentTenant[f] || ''])));
  }, [currentTenant]);

  const handleOpenAddUser = () => {
    setEditingUserId(null);
    setUserFormData(EMPTY_USER);
    setIsUserModalOpen(true);
  };

  const handleOpenEditUser = (u) => {
    setEditingUserId(u.id);
    setUserFormData({ name: u.name, email: u.email, role: u.role, password: '' });
    setIsUserModalOpen(true);
  };

  const handleUserSubmit = async (e) => {
    e.preventDefault();
    const { name, email, role, password } = userFormData;
    const ok = editingUserId
      ? await updateUser(editingUserId, { name, email, role })
      : await addUser({ name, email, role, ...(password && { password }) });
    if (ok) setIsUserModalOpen(false);
  };

  const save = async (key, action, successMessage) => {
    setSaving(key);
    try {
      await action();
      if (successMessage) toast.success(successMessage);
      return true;
    } catch (err) {
      toast.error(err.message);
      return false;
    } finally {
      setSaving(null);
    }
  };

  const handleCompanySave = (e) => {
    e.preventDefault();
    save('company', async () => {
      await apiFetch(withQuery('/api/tenant', { tenant_id: activeTenant }), { method: 'PUT', body: companyForm });
      await refreshTenants();
    }, 'Dados da empresa atualizados!');
  };

  const handleProfileSave = (e) => {
    e.preventDefault();
    save('profile', async () => {
      await apiFetch('/api/me', { method: 'PUT', body: { name: profileName } });
      updateCurrentUser({ name: profileName });
    }, 'Perfil atualizado!');
  };

  const handleNotificationsToggle = (enabled) => save('notifications', async () => {
    await apiFetch('/api/me', { method: 'PUT', body: { notifications_enabled: enabled } });
    updateCurrentUser({ notifications_enabled: enabled });
  }, enabled ? 'Notificações por e-mail ativadas' : 'Notificações por e-mail desativadas');

  const handlePasswordSave = async (e) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirm) return toast.error('As senhas não coincidem.');
    const ok = await save('password', async () => {
      const data = await apiFetch('/api/me/password', {
        method: 'PUT',
        body: { currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword },
      });
      setToken(data.token);
    }, 'Senha alterada! Outras sessões abertas foram encerradas.');
    if (ok) setPasswordForm({ currentPassword: '', newPassword: '', confirm: '' });
  };

  return (
    <div className="fade-in">
      <header className="page-header" style={styles.header}>
        <div>
          <h1 style={styles.pageTitle}>Configurações</h1>
          <p style={styles.pageSubtitle}>Gerencie os detalhes da sua conta e da sua empresa.</p>
        </div>
      </header>

      <div className="settings-layout" style={styles.container}>
        {/* Sidebar de Abas */}
        <div className="premium-card" style={styles.tabSidebar}>
          {tabs.map((tab) => {
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
              <form onSubmit={handleCompanySave}>
                <div className="form-grid" style={styles.formGrid}>
                  <div style={styles.inputGroup}>
                    <label style={styles.label} htmlFor="company-name">Nome Fantasia</label>
                    <input id="company-name" required maxLength={255} type="text" value={companyForm.name} onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })} style={styles.input} />
                  </div>
                  <div style={styles.inputGroup}>
                    <label style={styles.label} htmlFor="company-cnpj">CNPJ</label>
                    <input id="company-cnpj" type="text" maxLength={20} placeholder="00.000.000/0001-00" value={companyForm.cnpj} onChange={(e) => setCompanyForm({ ...companyForm, cnpj: e.target.value })} style={styles.input} />
                  </div>
                </div>
                <h4 style={{ ...styles.planTitle, margin: '32px 0 16px' }}>Dados para faturamento e nota fiscal</h4>
                <div className="form-grid" style={styles.formGrid}>
                  {ADDRESS_FIELDS.map((f) => (
                    <div key={f.key} style={{ ...styles.inputGroup, ...(f.span === 2 && { gridColumn: 'span 2' }) }}>
                      <label style={styles.label} htmlFor={`company-${f.key}`}>{f.label}</label>
                      <input id={`company-${f.key}`} type={f.type || 'text'} maxLength={f.maxLength || 255} value={companyForm[f.key] || ''} onChange={(e) => setCompanyForm({ ...companyForm, [f.key]: e.target.value })} style={styles.input} />
                    </div>
                  ))}
                </div>
                <button type="submit" className="btn-primary" style={{ marginTop: '24px' }} disabled={saving === 'company'}>
                  <Save size={18} />
                  {saving === 'company' ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </form>

              {/* Seção: Contrato de Prestação de Serviços */}
              <div style={{ marginTop: '48px' }}>
                <SectionHeader 
                  title="Contrato de Prestação de Serviços" 
                  description="Detalhes da vigência, renovação e valores do seu contrato com o SmartMaint." 
                />

                {currentTenant ? (
                  <>
                    {/* Status Card */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '16px',
                      padding: '20px', borderRadius: '12px', marginBottom: '24px',
                      background: currentTenant.status === 'Ativo' ? 'rgba(16, 185, 129, 0.06)' : 'rgba(239, 68, 68, 0.06)',
                      border: `1px solid ${currentTenant.status === 'Ativo' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                    }}>
                      <CheckCircle2 size={22} color={currentTenant.status === 'Ativo' ? '#10b981' : '#ef4444'} />
                      <div style={{ flex: 1 }}>
                        <p style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-main)' }}>
                          Contrato {currentTenant.status === 'Ativo' ? 'Ativo' : currentTenant.status}
                        </p>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                          Plano: <strong>{currentTenant.plan_type || 'Pro'}</strong> • Valor mensal: <strong>{formatCurrency(currentTenant.valor_mensal)}</strong>
                        </p>
                      </div>
                      {currentTenant.renovacao_auto ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.15)' }}>
                          <RefreshCw size={14} color="var(--primary)" />
                          <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--primary)' }}>Renovação Automática</span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '8px', background: '#fef3c7', border: '1px solid #fcd34d' }}>
                          <span style={{ fontSize: '12px', fontWeight: '700', color: '#b45309' }}>Renovação Manual</span>
                        </div>
                      )}
                    </div>

                    {/* Datas do Contrato */}
                    <div className="form-grid" style={styles.formGrid}>
                      <div style={styles.inputGroup}>
                        <label style={styles.label}><CalendarDays size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />Início do Contrato</label>
                        <input type="text" value={formatDate(currentTenant.contrato_inicio)} style={styles.input} disabled />
                      </div>
                      <div style={styles.inputGroup}>
                        <label style={styles.label}><CalendarDays size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />Término / Renovação</label>
                        <input type="text" value={formatDate(currentTenant.contrato_fim)} style={styles.input} disabled />
                      </div>
                    </div>

                    {/* Tempo restante */}
                    {currentTenant.contrato_fim && (() => {
                      const hoje = new Date();
                      const fim = parseLocalDate(currentTenant.contrato_fim);
                      const diffMs = fim - hoje;
                      const diasRestantes = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                      const isExpiring = diasRestantes <= 30;
                      return (
                        <div style={{
                          marginTop: '16px', padding: '14px 20px', borderRadius: '10px',
                          background: isExpiring ? 'rgba(245, 158, 11, 0.06)' : 'rgba(30, 58, 138, 0.04)',
                          border: `1px solid ${isExpiring ? 'rgba(245, 158, 11, 0.2)' : 'rgba(30, 58, 138, 0.1)'}`,
                          display: 'flex', alignItems: 'center', gap: '10px'
                        }}>
                          <FileText size={16} color={isExpiring ? '#f59e0b' : 'var(--primary)'} />
                          <span style={{ fontSize: '13px', color: 'var(--text-main)' }}>
                            {diasRestantes > 0 ? (
                              <>Faltam <strong>{diasRestantes} dias</strong> para a {currentTenant.renovacao_auto ? 'renovação automática' : 'expiração'} do contrato.</>
                            ) : (
                              <><strong style={{ color: '#ef4444' }}>Contrato expirado</strong> há {Math.abs(diasRestantes)} dias.</>
                            )}
                          </span>
                        </div>
                      );
                    })()}

                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '20px' }}>
                      Plano, forma de pagamento e cancelamento ficam em Configurações → Faturamento. Para condições contratuais especiais, fale com o suporte SmartMaint.
                    </p>
                  </>
                ) : (
                  <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Dados do contrato não disponíveis.</p>
                )}
              </div>
              <DataExport />
            </div>
          )}

          {activeTab === 'users' && (
            <div className="fade-in">
              <div className="stack-mobile" style={styles.usersHeader}>
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
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={styles.userName}>{u.name} {u.id === user?.id && '(Você)'}</p>
                      <p style={styles.userEmail}>{u.email}</p>
                    </div>
                    <div style={{
                      ...styles.roleBadge,
                      background: u.role === ROLES.ADMIN ? 'rgba(30, 58, 138, 0.1)' : '#f1f5f9',
                      color: u.role === ROLES.ADMIN ? 'var(--primary)' : '#64748b'
                    }}>
                      <Shield size={12} />
                      {u.role}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button style={styles.actionBtn} title="Editar" aria-label={`Editar ${u.name}`} onClick={() => handleOpenEditUser(u)}>
                        <Edit2 size={18} />
                      </button>
                      {u.id !== user?.id && (
                        <button style={styles.deleteBtn} title="Remover" aria-label={`Remover ${u.name}`} onClick={() => deleteUser(u.id)}>
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
              <form onSubmit={handleProfileSave}>
                <div className="form-grid" style={styles.formGrid}>
                  <div style={styles.inputGroup}>
                    <label style={styles.label} htmlFor="profile-name">Nome Completo</label>
                    <input id="profile-name" required maxLength={255} type="text" value={profileName} onChange={(e) => setProfileName(e.target.value)} style={styles.input} />
                  </div>
                  <div style={styles.inputGroup}>
                    <label style={styles.label} htmlFor="profile-email">E-mail</label>
                    <input id="profile-email" type="email" value={user?.email || ''} style={styles.input} disabled />
                  </div>
                </div>
                <button type="submit" className="btn-primary" style={{ marginTop: '24px' }} disabled={saving === 'profile'}>
                  <Save size={18} />
                  {saving === 'profile' ? 'Salvando...' : 'Atualizar Perfil'}
                </button>
              </form>

              {canAdmin || user?.role === ROLES.MANAGER ? (
                <div style={{ marginTop: '48px' }}>
                  <SectionHeader title="Notificações" description="Avisos por e-mail de O.S. crítica, preventiva gerada, estoque abaixo do mínimo e faturas." />
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px' }}>
                    <input
                      type="checkbox"
                      checked={user?.notifications_enabled !== false}
                      disabled={saving === 'notifications'}
                      onChange={(e) => handleNotificationsToggle(e.target.checked)}
                    />
                    Receber notificações por e-mail
                  </label>
                </div>
              ) : null}

              <div style={{ marginTop: '48px' }}>
                <SectionHeader title="Alterar Senha" description="Ao trocar a senha, as outras sessões abertas com sua conta são encerradas." />
                <form onSubmit={handlePasswordSave}>
                  <div className="form-grid" style={styles.formGrid}>
                    <div style={{ ...styles.inputGroup, gridColumn: 'span 2' }}>
                      <label style={styles.label} htmlFor="current-password">Senha atual</label>
                      <input id="current-password" required type="password" autoComplete="current-password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} style={styles.input} />
                    </div>
                    <div style={styles.inputGroup}>
                      <label style={styles.label} htmlFor="new-password">Nova senha</label>
                      <input id="new-password" required minLength={8} type="password" autoComplete="new-password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} style={styles.input} />
                    </div>
                    <div style={styles.inputGroup}>
                      <label style={styles.label} htmlFor="confirm-password">Confirmar nova senha</label>
                      <input id="confirm-password" required minLength={8} type="password" autoComplete="new-password" value={passwordForm.confirm} onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })} style={styles.input} />
                    </div>
                  </div>
                  <button type="submit" className="btn-primary" style={{ marginTop: '24px' }} disabled={saving === 'password'}>
                    <KeyRound size={18} />
                    {saving === 'password' ? 'Alterando...' : 'Alterar Senha'}
                  </button>
                </form>
              </div>
            </div>
          )}

          {activeTab === 'units' && <UnitsTab />}

          {activeTab === 'audit' && <AuditTab />}

          {activeTab === 'billing' && <BillingTab />}
        </div>
      </div>

      {/* Modal de Novo/Editar Usuário */}
      {isUserModalOpen && (
        <div className="modal-overlay">
          <div className="premium-card fade-in modal-card" style={styles.modal}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>{editingUserId ? 'Editar Membro' : 'Adicionar Membro'}</h3>
              <button onClick={() => setIsUserModalOpen(false)} style={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleUserSubmit}>
              <div className="form-grid" style={styles.formGrid}>
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
                    {TEAM_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                {!editingUserId && (
                  <div style={{...styles.inputGroup, gridColumn: 'span 2'}}>
                    <label style={styles.label}>Senha provisória (opcional)</label>
                    <input
                      type="password"
                      minLength={8}
                      autoComplete="new-password"
                      style={styles.input}
                      placeholder="Deixe em branco para enviar convite por e-mail"
                      value={userFormData.password || ''}
                      onChange={(e) => setUserFormData({...userFormData, password: e.target.value})}
                    />
                  </div>
                )}
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
  contentArea: { padding: 'clamp(20px, 4vw, 40px)', minHeight: '500px', minWidth: 0 },
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
  modal: { width: '100%', maxWidth: '500px', padding: '32px', background: 'white' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
  modalTitle: { fontSize: '20px', fontWeight: '700' },
  closeBtn: { background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' },
  modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--border)', paddingTop: '20px', marginTop: '20px' },
  cancelBtn: { background: 'transparent', color: 'var(--text-muted)', fontWeight: '600', cursor: 'pointer' }
};

const SectionHeader = ({ title, description }) => (
  <div style={styles.sectionHeader}>
    <h3 style={styles.sectionTitle}>{title}</h3>
    <p style={styles.sectionDesc}>{description}</p>
  </div>
);

export default Settings;
