import { useState } from 'react';
import { History } from 'lucide-react';
import { usePagedList } from '../../hooks/usePagedList';
import Pagination from '../../components/Pagination';

const ENTITIES = {
  '': 'Todos os registros',
  user: 'Usuários e acessos',
  equipment: 'Equipamentos',
  work_order: 'Ordens de serviço',
  failure: 'Falhas',
  fmea: 'FMEA',
  inventory: 'Estoque',
  preventive_plan: 'Planos preventivos',
  unit: 'Unidades',
  tenant: 'Dados da empresa',
};

const ACTIONS = {
  create: 'criou',
  update: 'alterou',
  delete: 'excluiu',
  login: 'entrou no sistema',
  login_failed: 'errou a senha',
  password_change: 'trocou a senha',
  password_reset: 'redefiniu a senha',
  executed: 'registrou execução',
};

const describeAction = (action) => {
  if (ACTIONS[action]) return ACTIONS[action];
  if (action.startsWith('status:')) return `mudou o status para "${action.slice(7)}"`;
  return action;
};

const formatDateTime = (value) => new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** Histórico de quem fez o quê no cliente (somente leitura). */
const AuditTab = () => {
  const [entity, setEntity] = useState('');
  const list = usePagedList('/api/audit', { entity: entity || undefined }, { pageSize: 30 });

  return (
    <div className="fade-in">
      <div className="stack-mobile" style={styles.header}>
        <div>
          <h3 style={styles.title}>Auditoria</h3>
          <p style={styles.desc}>Registro de acessos e alterações feitas pela sua equipe.</p>
        </div>
        <select aria-label="Filtrar por tipo de registro" style={styles.select} value={entity} onChange={(e) => setEntity(e.target.value)}>
          {Object.entries(ENTITIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      <div style={styles.list}>
        {list.items.map((log) => (
          <div key={log.id} style={styles.item}>
            <History size={16} color="var(--text-muted)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={styles.text}>
                <strong>{log.user_name || 'Sistema'}</strong> {describeAction(log.action)}
                {log.entity !== 'user' || !['login', 'login_failed'].includes(log.action) ? (
                  <> · {ENTITIES[log.entity] || log.entity}{log.entity_id ? ` #${log.entity_id}` : ''}</>
                ) : null}
              </p>
              {log.changes && typeof log.changes === 'object' && Object.keys(log.changes).length > 0 && (
                <p style={styles.changes}>
                  {Object.entries(log.changes).map(([k, v]) => `${k}: ${v === null ? '—' : String(v)}`).join(' · ')}
                </p>
              )}
            </div>
            <span style={styles.date}>{formatDateTime(log.created_at)}</span>
          </div>
        ))}
        {!list.loading && list.items.length === 0 && <p style={styles.desc}>Nenhum registro encontrado.</p>}
      </div>
      <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onChange={list.setPage} loading={list.loading} />
    </div>
  );
};

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid var(--border)' },
  title: { fontSize: '18px', fontWeight: '700', marginBottom: '4px' },
  desc: { fontSize: '13px', color: 'var(--text-muted)' },
  select: { padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'white', fontSize: '13px' },
  list: { display: 'flex', flexDirection: 'column' },
  item: { display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '12px 0', borderBottom: '1px solid var(--border)' },
  text: { fontSize: '14px', color: 'var(--text-main)' },
  changes: { fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', wordBreak: 'break-word' },
  date: { fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' },
};

export default AuditTab;
