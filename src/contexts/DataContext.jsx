import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth, ROLES } from './AuthContext';
import { useConfirm } from '../components/ConfirmDialog';
import { apiFetch, withQuery } from '../api/client';
import { toast } from 'sonner';

const DataContext = createContext();

const MANAGERS = [ROLES.ADMIN, ROLES.MANAGER];

// Recursos carregados por perfil (espelha as permissões do backend)
const RESOURCES = {
  equipments: { path: '/api/equipments' },
  workOrders: { path: '/api/work-orders' },
  users: { path: '/api/users' },
  failures: { path: '/api/failures', roles: MANAGERS },
  repairs: { path: '/api/repairs', roles: MANAGERS },
  inventory: { path: '/api/inventory', roles: MANAGERS },
  preventivePlans: { path: '/api/preventive-plans', roles: MANAGERS },
  fmea: { path: '/api/fmea', roles: [ROLES.ADMIN] },
};

const EMPTY = Object.fromEntries(Object.keys(RESOURCES).map((key) => [key, []]));

export const DataProvider = ({ children }) => {
  const { activeTenant, token, user, isBackoffice } = useAuth();
  const confirm = useConfirm();
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const tenantRef = useRef(activeTenant);
  useEffect(() => { tenantRef.current = activeTenant; }, [activeTenant]);

  // tenant_id é enviado em todas as chamadas: obrigatório para o backoffice e ignorado para clientes
  const url = useCallback((path) => withQuery(path, { tenant_id: activeTenant }), [activeTenant]);

  const canRead = useCallback((key) => {
    const roles = RESOURCES[key].roles;
    return isBackoffice || !roles || roles.includes(user?.role);
  }, [isBackoffice, user?.role]);

  const load = useCallback(async (keys = Object.keys(RESOURCES)) => {
    if (!activeTenant || !token) return;
    const tenantAtStart = activeTenant;
    const allowed = keys.filter(canRead);
    const results = await Promise.allSettled(allowed.map((key) => apiFetch(url(RESOURCES[key].path))));
    // Descarta respostas que chegaram depois da troca de cliente (backoffice)
    if (tenantRef.current !== tenantAtStart) return;

    const next = {};
    let failed = false;
    results.forEach((result, i) => {
      if (result.status === 'fulfilled' && Array.isArray(result.value)) next[allowed[i]] = result.value;
      else failed = true;
    });
    setData((prev) => ({ ...prev, ...next }));
    if (failed) toast.error('Alguns dados não puderam ser carregados.');
  }, [activeTenant, token, canRead, url]);

  useEffect(() => {
    setData(EMPTY);
    if (!activeTenant || !token) return;
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [activeTenant, token, load]);

  /** Executa uma alteração, mostra o resultado e recarrega apenas os recursos afetados. */
  const mutate = async ({ method, path, body, success, reload, confirmMessage }) => {
    if (confirmMessage && !(await confirm(confirmMessage))) return null;
    try {
      const result = await apiFetch(url(path), { method, body });
      if (success) toast.success(success);
      await load(reload);
      return result;
    } catch (error) {
      toast.error(error.message);
      return null;
    }
  };

  const crud = (resource, path, labels) => ({
    add: (body) => mutate({ method: 'POST', path, body, success: labels.added, reload: [resource] }),
    update: (id, body) => mutate({ method: 'PUT', path: `${path}/${id}`, body, success: labels.updated, reload: [resource] }),
    remove: (id) => mutate({ method: 'DELETE', path: `${path}/${id}`, success: labels.removed, reload: [resource], confirmMessage: labels.confirm }),
  });

  const equipments = crud('equipments', '/api/equipments', {
    added: 'Equipamento adicionado!', updated: 'Equipamento atualizado!', removed: 'Equipamento excluído.',
    confirm: 'Excluir este equipamento? Falhas, O.S. e planos vinculados também serão removidos.',
  });
  const failures = crud('failures', '/api/failures', {
    added: 'Falha registrada!', updated: 'Falha atualizada!', removed: 'Falha excluída.', confirm: 'Excluir este registro de falha?',
  });
  const fmea = crud('fmea', '/api/fmea', {
    added: 'FMEA adicionado!', updated: 'FMEA atualizado!', removed: 'FMEA excluído.', confirm: 'Excluir este item da análise FMEA?',
  });
  const inventory = crud('inventory', '/api/inventory', {
    added: 'Item adicionado ao estoque!', updated: 'Estoque atualizado!', removed: 'Item excluído.', confirm: 'Excluir item do estoque?',
  });
  const plans = crud('preventivePlans', '/api/preventive-plans', {
    added: 'Plano preventivo criado!', updated: 'Plano atualizado!', removed: 'Plano excluído.', confirm: 'Excluir este plano preventivo?',
  });
  const users = crud('users', '/api/users', {
    updated: 'Membro atualizado!', removed: 'Membro removido.', confirm: 'Remover este membro da equipe? Ele perderá o acesso imediatamente.',
  });

  const addUser = async (body) => {
    const result = await mutate({ method: 'POST', path: '/api/users', body, reload: ['users'] });
    if (result) {
      toast.success(result.invite_sent
        ? `Convite enviado para ${result.email}.`
        : body.password ? 'Membro adicionado!' : 'Membro adicionado, mas o e-mail de convite não pôde ser enviado. Peça para ele usar "Esqueci minha senha".');
    }
    return result;
  };

  // Equipamentos excluídos levam junto registros vinculados (ON DELETE CASCADE)
  const deleteEquipment = async (id) => {
    const result = await equipments.remove(id);
    if (result) load();
    return result;
  };

  const workOrderPath = '/api/work-orders';
  const addWorkOrder = (body) => mutate({ method: 'POST', path: workOrderPath, body, success: 'Ordem de Serviço criada!', reload: ['workOrders'] });
  const updateWorkOrder = (id, body) => mutate({ method: 'PUT', path: `${workOrderPath}/${id}`, body, success: 'O.S. atualizada!', reload: ['workOrders', 'repairs'] });
  const deleteWorkOrder = (id) => mutate({ method: 'DELETE', path: `${workOrderPath}/${id}`, success: 'O.S. excluída.', reload: ['workOrders', 'repairs'], confirmMessage: 'Excluir esta ordem de serviço?' });

  return (
    <DataContext.Provider value={{
      ...data,
      loading,
      addEquipment: equipments.add,
      updateEquipment: equipments.update,
      deleteEquipment,
      addFailure: failures.add,
      updateFailure: failures.update,
      deleteFailure: failures.remove,
      addFmea: fmea.add,
      updateFmea: fmea.update,
      deleteFmea: fmea.remove,
      addWorkOrder,
      updateWorkOrder,
      deleteWorkOrder,
      addUser,
      updateUser: users.update,
      deleteUser: users.remove,
      addInventoryItem: inventory.add,
      updateInventoryItem: inventory.update,
      deleteInventoryItem: inventory.remove,
      addPreventivePlan: plans.add,
      updatePreventivePlan: plans.update,
      deletePreventivePlan: plans.remove,
      refreshData: load
    }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => useContext(DataContext);
