import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { 
  Building2, Users, CreditCard, Plus,
  CheckCircle2, XCircle, ExternalLink, RefreshCw, X, Trash2, DollarSign, FileText
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Backoffice = () => {
  const { user, token, switchTenant } = useAuth();
  const navigate = useNavigate();
  const [tenants, setTenants] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [boUsers, setBoUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('clients');
  const [modalType, setModalType] = useState(null); // 'client' | 'invoice' | 'agent'
  const [form, setForm] = useState({});
  const [contractTenant, setContractTenant] = useState(null); // tenant being edited for contract
  const [contractForm, setContractForm] = useState({});

  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

  const fetchAll = async () => {
    try {
      const [t, i, u] = await Promise.all([
        fetch('/api/admin/tenants', { headers }).then(r => r.json()),
        fetch('/api/admin/invoices', { headers }).then(r => r.json()),
        fetch('/api/admin/users', { headers }).then(r => r.json()).catch(() => [])
      ]);
      setTenants(t || []); setInvoices(i || []); setBoUsers(u || []);
    } catch { toast.error('Erro ao carregar dados'); }
    finally { setLoading(false); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAll(); }, [token]);

  const toggleStatus = async (id, cur) => {
    const s = cur === 'Ativo' ? 'Cancelado' : 'Ativo';
    await fetch(`/api/admin/tenants/${id}/status`, { method: 'PUT', headers, body: JSON.stringify({ status: s }) });
    toast.success(`Status → ${s}`); fetchAll();
  };

  const deleteTenant = async (id) => {
    if (!window.confirm(`Excluir permanentemente o cliente "${id}"? Todos os dados serão perdidos.`)) return;
    await fetch(`/api/admin/tenants/${id}`, { method: 'DELETE', headers });
    toast.success('Cliente excluído'); fetchAll();
  };

  const handleImpersonate = (tid) => { switchTenant(tid); navigate('/'); toast.success(`Modo Cliente: ${tid.toUpperCase()}`); };

  const openContract = (t) => {
    setContractTenant(t);
    setContractForm({
      contrato_inicio: t.contrato_inicio ? t.contrato_inicio.split('T')[0] : '',
      contrato_fim: t.contrato_fim ? t.contrato_fim.split('T')[0] : '',
      renovacao_auto: t.renovacao_auto ?? true,
      valor_mensal: t.valor_mensal || '',
      plan_type: t.plan_type || 'Pro',
      status: t.status || 'Ativo',
    });
  };

  const saveContract = async (e) => {
    e.preventDefault();
    try {
      await fetch(`/api/admin/tenants/${contractTenant.id}/contract`, {
        method: 'PUT', headers,
        body: JSON.stringify(contractForm)
      });
      toast.success('Contrato atualizado!');
      setContractTenant(null); fetchAll();
    } catch { toast.error('Erro ao salvar contrato'); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (modalType === 'client') {
        await fetch('/api/admin/tenants', { method: 'POST', headers, body: JSON.stringify(form) });
        toast.success('Cliente cadastrado!');
      } else if (modalType === 'invoice') {
        await fetch('/api/admin/invoices', { method: 'POST', headers, body: JSON.stringify(form) });
        toast.success('Fatura criada!');
      } else if (modalType === 'agent') {
        await fetch('/api/admin/users', { method: 'POST', headers, body: JSON.stringify(form) });
        toast.success('Agente criado!');
      }
      setModalType(null); fetchAll();
    } catch { toast.error('Erro ao salvar'); }
  };

  const markInvoice = async (id, s) => {
    await fetch(`/api/admin/invoices/${id}/status`, { method: 'PUT', headers, body: JSON.stringify({ status: s }) });
    toast.success(`Fatura → ${s}`); fetchAll();
  };

  const activeClients = tenants.filter(t => t.status === 'Ativo').length;
  const totalUsers = tenants.reduce((a, t) => a + (t.users_count || 0), 0);
  const pendingValue = tenants.reduce((a, t) => a + parseFloat(t.pending_value || 0), 0);
  const getColor = (s) => s === 'Ativo' ? '#10b981' : s === 'Inadimplente' ? '#f59e0b' : '#ef4444';
  const getInvColor = (s) => s === 'Paga' ? '#10b981' : s === 'Atrasada' ? '#ef4444' : '#f59e0b';

  if (loading) return <div className="flex-center" style={{ height: '50vh' }}><RefreshCw /></div>;

  const tabs = [
    { id: 'clients', label: 'Clientes', icon: Building2 },
    { id: 'billing', label: 'Faturas', icon: CreditCard },
  ];
  if (user?.isMaster) tabs.push({ id: 'team', label: 'Equipe Backoffice', icon: Users });

  return (
    <div className="fade-in">
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700' }}>Painel Administrativo</h1>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Gestão de contratos, faturamento e equipe de suporte.</p>
      </div>

      {/* Métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '32px' }}>
        {[
          { label: 'Clientes Ativos', value: `${activeClients}/${tenants.length}`, icon: Building2, color: '#10b981' },
          { label: 'Usuários Totais', value: totalUsers, icon: Users, color: '#3b82f6' },
          { label: 'A Receber', value: `R$ ${pendingValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: DollarSign, color: '#f59e0b' },
        ].map((m, i) => (
          <div key={i} className="premium-card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: `${m.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <m.icon size={20} color={m.color} />
            </div>
            <div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>{m.label}</p>
              <h2 style={{ fontSize: '22px', fontWeight: '800' }}>{m.value}</h2>
            </div>
          </div>
        ))}
      </div>

      {/* Alertas Inteligentes */}
      {(() => {
        const hoje = new Date();
        const vencendo = tenants.filter(t => {
          if (!t.contrato_fim) return false;
          const fim = new Date(t.contrato_fim);
          const diff = Math.ceil((fim - hoje) / (1000*60*60*24));
          return diff >= 0 && diff <= 30 && t.status === 'Ativo';
        });
        const bloqueados = tenants.filter(t => t.status === 'Cancelado' || t.status === 'Inadimplente');
        const atrasadas = invoices.filter(i => i.status === 'Atrasada');
        const hasAlerts = vencendo.length > 0 || bloqueados.length > 0 || atrasadas.length > 0;

        return hasAlerts ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', marginBottom: '28px' }}>
            {vencendo.length > 0 && (
              <div style={{ padding: '16px 20px', borderRadius: '12px', background: '#fffbeb', border: '1px solid #fde68a' }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#b45309', marginBottom: '8px' }}>⏳ Contratos Vencendo em 30 dias</p>
                {vencendo.map(t => {
                  const dias = Math.ceil((new Date(t.contrato_fim) - hoje) / (1000*60*60*24));
                  return (
                    <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #fde68a' }}>
                      <span style={{ fontSize: '13px', fontWeight: '600' }}>{t.name}</span>
                      <span style={{ fontSize: '12px', color: '#b45309', fontWeight: '600' }}>{dias} dias restantes</span>
                    </div>
                  );
                })}
              </div>
            )}
            {atrasadas.length > 0 && (
              <div style={{ padding: '16px 20px', borderRadius: '12px', background: '#fef2f2', border: '1px solid #fecaca' }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#dc2626', marginBottom: '8px' }}>💰 Faturas Atrasadas ({atrasadas.length})</p>
                {atrasadas.slice(0, 5).map(inv => (
                  <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #fecaca' }}>
                    <span style={{ fontSize: '13px', fontWeight: '600' }}>{inv.tenant_name}</span>
                    <span style={{ fontSize: '12px', color: '#dc2626', fontWeight: '600' }}>R$ {parseFloat(inv.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} • {inv.mes_ref}</span>
                  </div>
                ))}
              </div>
            )}
            {bloqueados.length > 0 && (
              <div style={{ padding: '16px 20px', borderRadius: '12px', background: '#f1f5f9', border: '1px solid #e2e8f0' }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#475569', marginBottom: '8px' }}>🚫 Clientes Bloqueados ({bloqueados.length})</p>
                {bloqueados.map(t => (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '13px', fontWeight: '600' }}>{t.name}</span>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: t.status === 'Inadimplente' ? '#f59e0b' : '#ef4444' }}>{t.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null;
      })()}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', background: 'white', padding: '4px', borderRadius: '10px', border: '1px solid var(--border)', width: 'fit-content' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', background: activeTab === t.id ? 'var(--primary)' : 'transparent', color: activeTab === t.id ? 'white' : 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {/* --- TAB: CLIENTES --- */}
      {activeTab === 'clients' && (
        <div className="premium-card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700' }}>Contratos / Clientes</h3>
            <button className="btn-primary" onClick={() => { setForm({ id: '', name: '', plan_type: 'Pro', contact_email: '', contact_phone: '' }); setModalType('client'); }}>
              <Plus size={16} /> Novo Cliente
            </button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {['Cliente', 'Plano', 'Usuários', 'Equipamentos', 'Financeiro', 'Status', 'Ações'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '14px 20px', fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', background: '#f8fafc' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {tenants.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '14px 20px' }}>
                    <p style={{ fontWeight: '600', fontSize: '14px' }}>{t.name}</p>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>ID: {t.id} {t.contact_email && `• ${t.contact_email}`}</p>
                  </td>
                  <td style={{ padding: '14px 20px' }}><span style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', background: '#f1f5f9' }}>{t.plan_type}</span></td>
                  <td style={{ padding: '14px 20px', fontWeight: '600' }}>{t.users_count}</td>
                  <td style={{ padding: '14px 20px', fontWeight: '600' }}>{t.equipments_count}</td>
                  <td style={{ padding: '14px 20px' }}>
                    <span style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', background: t.pending_invoices > 0 ? '#fef3c7' : '#d1fae5', color: t.pending_invoices > 0 ? '#b45309' : '#059669' }}>
                      {t.pending_invoices > 0 ? `${t.pending_invoices} pendente(s)` : 'Em dia'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '600', color: getColor(t.status) }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: getColor(t.status) }} /> {t.status}
                    </div>
                  </td>
                  <td style={{ padding: '14px 20px' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button style={{ background: 'rgba(59,130,246,0.08)', border: 'none', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', color: 'var(--primary)', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => openContract(t)} title="Gerenciar Contrato"><FileText size={14} /> Contrato</button>
                      <button style={{ background: 'transparent', border: 'none', padding: '6px', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => handleImpersonate(t.id)} title="Acessar como cliente"><ExternalLink size={16} /></button>
                      <button style={{ background: 'transparent', border: 'none', padding: '6px', cursor: 'pointer', color: t.status === 'Ativo' ? '#ef4444' : '#10b981' }} onClick={() => toggleStatus(t.id, t.status)} title={t.status === 'Ativo' ? 'Bloquear' : 'Reativar'}>
                        {t.status === 'Ativo' ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
                      </button>
                      {user?.isMaster && <button style={{ background: 'transparent', border: 'none', padding: '6px', cursor: 'pointer', color: '#94a3b8' }} onClick={() => deleteTenant(t.id)} title="Excluir"><Trash2 size={16} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* --- TAB: FATURAS --- */}
      {activeTab === 'billing' && (
        <div className="premium-card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700' }}>Gestão de Faturas</h3>
            <button className="btn-primary" onClick={() => { setForm({ tenant_id: tenants[0]?.id || '', valor: '', vencimento: '', mes_ref: '', status: 'Pendente' }); setModalType('invoice'); }}>
              <Plus size={16} /> Nova Fatura
            </button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {['Cliente', 'Mês Ref.', 'Valor', 'Vencimento', 'Status', 'Ações'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '14px 20px', fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', background: '#f8fafc' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '14px 20px', fontWeight: '600', fontSize: '14px' }}>{inv.tenant_name}</td>
                  <td style={{ padding: '14px 20px', fontSize: '14px' }}>{inv.mes_ref}</td>
                  <td style={{ padding: '14px 20px', fontWeight: '700', fontSize: '14px' }}>R$ {parseFloat(inv.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td style={{ padding: '14px 20px', fontSize: '14px' }}>{new Date(inv.vencimento).toLocaleDateString('pt-BR')}</td>
                  <td style={{ padding: '14px 20px' }}>
                    <span style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '700', background: `${getInvColor(inv.status)}15`, color: getInvColor(inv.status) }}>{inv.status}</span>
                  </td>
                  <td style={{ padding: '14px 20px' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {inv.status !== 'Paga' && <button onClick={() => markInvoice(inv.id, 'Paga')} style={{ background: '#d1fae5', border: 'none', padding: '4px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', color: '#059669', cursor: 'pointer' }}>Pagar</button>}
                      {inv.status === 'Pendente' && <button onClick={() => markInvoice(inv.id, 'Atrasada')} style={{ background: '#fee2e2', border: 'none', padding: '4px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', color: '#dc2626', cursor: 'pointer' }}>Atrasar</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* --- TAB: EQUIPE BACKOFFICE (Root only) --- */}
      {activeTab === 'team' && (
        <div className="premium-card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700' }}>Agentes de Suporte</h3>
            <button className="btn-primary" onClick={() => { setForm({ name: '', email: '', password: '' }); setModalType('agent'); }}>
              <Plus size={16} /> Novo Agente
            </button>
          </div>
          <div style={{ padding: '20px' }}>
            {boUsers.map(u => (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px', borderRadius: '10px', border: '1px solid var(--border)', marginBottom: '10px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: u.is_master ? 'rgba(30,58,138,0.1)' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Users size={18} color={u.is_master ? 'var(--primary)' : '#64748b'} />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: '600', fontSize: '14px' }}>{u.name}</p>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{u.email}</p>
                </div>
                <span style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', background: u.is_master ? 'rgba(30,58,138,0.1)' : '#fef3c7', color: u.is_master ? 'var(--primary)' : '#b45309' }}>
                  {u.is_master ? 'ROOT' : u.role}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- MODAL UNIVERSAL --- */}
      {modalType && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="premium-card fade-in" style={{ width: '100%', maxWidth: '500px', padding: '32px', background: 'white' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700' }}>
                {modalType === 'client' ? 'Novo Cliente' : modalType === 'invoice' ? 'Nova Fatura' : 'Novo Agente'}
              </h3>
              <button onClick={() => setModalType(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                {modalType === 'client' && <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '600' }}>ID (slug)</label>
                    <input required style={inputStyle} placeholder="ex: acme" value={form.id || ''} onChange={e => setForm({...form, id: e.target.value})} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '600' }}>Razão Social</label>
                    <input required style={inputStyle} value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '600' }}>E-mail Contato</label>
                    <input type="email" style={inputStyle} value={form.contact_email || ''} onChange={e => setForm({...form, contact_email: e.target.value})} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '600' }}>Telefone</label>
                    <input style={inputStyle} value={form.contact_phone || ''} onChange={e => setForm({...form, contact_phone: e.target.value})} />
                  </div>
                </>}
                {modalType === 'invoice' && <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '600' }}>Cliente</label>
                    <select style={inputStyle} value={form.tenant_id || ''} onChange={e => setForm({...form, tenant_id: e.target.value})}>
                      {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '600' }}>Valor (R$)</label>
                    <input required type="number" step="0.01" style={inputStyle} value={form.valor || ''} onChange={e => setForm({...form, valor: e.target.value})} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '600' }}>Vencimento</label>
                    <input required type="date" style={inputStyle} value={form.vencimento || ''} onChange={e => setForm({...form, vencimento: e.target.value})} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '600' }}>Mês Referência</label>
                    <input required style={inputStyle} placeholder="05/2026" value={form.mes_ref || ''} onChange={e => setForm({...form, mes_ref: e.target.value})} />
                  </div>
                </>}
                {modalType === 'agent' && <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: 'span 2' }}>
                    <label style={{ fontSize: '13px', fontWeight: '600' }}>Nome</label>
                    <input required style={inputStyle} value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '600' }}>E-mail</label>
                    <input required type="email" style={inputStyle} value={form.email || ''} onChange={e => setForm({...form, email: e.target.value})} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '600' }}>Senha</label>
                    <input type="password" style={inputStyle} placeholder="123456" value={form.password || ''} onChange={e => setForm({...form, password: e.target.value})} />
                  </div>
                </>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                <button type="button" onClick={() => setModalType(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontWeight: '600', cursor: 'pointer' }}>Cancelar</button>
                <button type="submit" className="btn-primary">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL DE CONTRATO --- */}
      {contractTenant && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="premium-card fade-in" style={{ width: '100%', maxWidth: '560px', padding: '32px', background: 'white' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '700' }}>Gestão de Contrato</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{contractTenant.name} ({contractTenant.id})</p>
              </div>
              <button onClick={() => setContractTenant(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <form onSubmit={saveContract}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>Plano</label>
                  <select style={inputStyle} value={contractForm.plan_type} onChange={e => setContractForm({...contractForm, plan_type: e.target.value})}>
                    <option value="Starter">Starter</option>
                    <option value="Pro">Pro</option>
                    <option value="Enterprise">Enterprise</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>Status do Contrato</label>
                  <select style={inputStyle} value={contractForm.status} onChange={e => setContractForm({...contractForm, status: e.target.value})}>
                    <option value="Ativo">Ativo</option>
                    <option value="Trial">Trial</option>
                    <option value="Inadimplente">Inadimplente</option>
                    <option value="Cancelado">Cancelado</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>Valor Mensal (R$)</label>
                  <input type="number" step="0.01" style={inputStyle} value={contractForm.valor_mensal} onChange={e => setContractForm({...contractForm, valor_mensal: e.target.value})} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>Renovação</label>
                  <select style={inputStyle} value={contractForm.renovacao_auto ? '1' : '0'} onChange={e => setContractForm({...contractForm, renovacao_auto: e.target.value === '1'})}>
                    <option value="1">Automática</option>
                    <option value="0">Manual</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>Início do Contrato</label>
                  <input type="date" style={inputStyle} value={contractForm.contrato_inicio} onChange={e => setContractForm({...contractForm, contrato_inicio: e.target.value})} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>Término / Renovação</label>
                  <input type="date" style={inputStyle} value={contractForm.contrato_fim} onChange={e => setContractForm({...contractForm, contrato_fim: e.target.value})} />
                </div>
              </div>

              {/* Ações rápidas */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--border)' }}>
                <button type="button" onClick={() => setContractForm({...contractForm, status: 'Cancelado'})} style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', border: '1px solid #fee2e2', background: '#fee2e2', color: '#dc2626', cursor: 'pointer' }}>
                  Cancelar Contrato
                </button>
                <button type="button" onClick={() => {
                  const fim = contractForm.contrato_fim ? new Date(contractForm.contrato_fim) : new Date();
                  fim.setFullYear(fim.getFullYear() + 1);
                  setContractForm({...contractForm, contrato_fim: fim.toISOString().split('T')[0], status: 'Ativo'});
                }} style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', border: '1px solid #d1fae5', background: '#d1fae5', color: '#059669', cursor: 'pointer' }}>
                  Renovar +1 Ano
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" onClick={() => setContractTenant(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontWeight: '600', cursor: 'pointer' }}>Cancelar</button>
                <button type="submit" className="btn-primary">Salvar Contrato</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const inputStyle = { padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', width: '100%' };

export default Backoffice;
