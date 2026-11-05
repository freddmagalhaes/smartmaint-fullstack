import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { useConfirm } from '../components/ConfirmDialog';
import { apiFetch, withQuery } from '../api/client';
import { enqueue } from '../api/outbox';
import { toast } from 'sonner';

const DataContext = createContext();

const unitStorageKey = (tenant) => `sm_unit_${tenant}`;
const readStoredUnit = (tenant) => {
  try {
    const value = localStorage.getItem(unitStorageKey(tenant));
    return value ? Number(value) : null;
  } catch {
    return null;
  }
};

/**
 * Dados compartilhados entre as telas: unidades, unidade ativa, listas leves para
 * seletores (equipamentos e equipe) e as operações de alteração. As listas grandes
 * (O.S., falhas, estoque...) são paginadas no servidor por cada tela (usePagedList).
 */
export const DataProvider = ({ children }) => {
  const { activeTenant, token } = useAuth();
  const confirm = useConfirm();
  const [units, setUnits] = useState([]);
  const [unitState, setUnitState] = useState({ tenant: activeTenant, unit: activeTenant ? readStoredUnit(activeTenant) : null });
  const [equipments, setEquipments] = useState([]);
  const [users, setUsers] = useState([]);
  // Incrementado a cada alteração: as listas paginadas recarregam sozinhas
  const [dataVersion, setDataVersion] = useState(0);

  // Ao trocar de cliente, restaura a unidade escolhida anteriormente nele
  const activeUnit = unitState.tenant === activeTenant ? unitState.unit : (activeTenant ? readStoredUnit(activeTenant) : null);

  const scope = useMemo(
    () => ({ tenant_id: activeTenant || undefined, unit_id: activeUnit || undefined }),
    [activeTenant, activeUnit]
  );

  const url = useCallback((path, extra = {}) => withQuery(path, { tenant_id: activeTenant, ...extra }), [activeTenant]);

  const setActiveUnit = useCallback((unitId) => {
    setUnitState({ tenant: activeTenant, unit: unitId || null });
    try {
      if (unitId) localStorage.setItem(unitStorageKey(activeTenant), String(unitId));
      else localStorage.removeItem(unitStorageKey(activeTenant));
    } catch { /* armazenamento indisponível */ }
  }, [activeTenant]);

  const loadLookups = useCallback(async () => {
    if (!activeTenant || !token) return;
    const [u, eq, us] = await Promise.allSettled([
      apiFetch(url('/api/units')),
      apiFetch(url('/api/equipments/options', { unit_id: activeUnit || undefined })),
      apiFetch(url('/api/users')),
    ]);
    if (u.status === 'fulfilled') {
      setUnits(u.value);
      // Unidade salva que deixou de existir volta para "todas"
      if (activeUnit && !u.value.some((unit) => unit.id === activeUnit)) setActiveUnit(null);
    }
    if (eq.status === 'fulfilled') setEquipments(eq.value);
    if (us.status === 'fulfilled') setUsers(us.value);
  }, [activeTenant, activeUnit, token, url, setActiveUnit]);

  useEffect(() => {
    loadLookups();
  }, [loadLookups, dataVersion]);

  /** Executa uma alteração, mostra o resultado e faz as telas recarregarem. Retorna o resultado ou null. */
  const mutate = useCallback(async ({ method, path, body, success, confirmMessage }) => {
    if (confirmMessage && !(await confirm(confirmMessage))) return null;
    try {
      const result = await apiFetch(url(path), { method, body });
      if (success) toast.success(success);
      setDataVersion((v) => v + 1);
      return result ?? {};
    } catch (error) {
      // Sem internet: O.S., comentários e mudanças de status esperam no aparelho e são enviados depois
      if (error.status === 0 && !(body instanceof FormData) && enqueue({ method, path: url(path), body })) {
        toast.info('Sem conexão: salvo neste aparelho. Será enviado automaticamente quando a internet voltar.');
        return { queued: true };
      }
      toast.error(error.message);
      return null;
    }
  }, [confirm, url]);

  const crud = (path, labels) => ({
    add: (body) => mutate({ method: 'POST', path, body, success: labels.added }),
    update: (id, body) => mutate({ method: 'PUT', path: `${path}/${id}`, body, success: labels.updated }),
    remove: (id) => mutate({ method: 'DELETE', path: `${path}/${id}`, success: labels.removed, confirmMessage: labels.confirm }),
  });

  const equipmentOps = crud('/api/equipments', {
    added: 'Equipamento adicionado!', updated: 'Equipamento atualizado!', removed: 'Equipamento excluído.',
    confirm: 'Excluir este equipamento? Falhas, O.S. e planos vinculados também serão removidos.',
  });
  const failureOps = crud('/api/failures', {
    added: 'Falha registrada!', updated: 'Falha atualizada!', removed: 'Falha excluída.', confirm: 'Excluir este registro de falha?',
  });
  const fmeaOps = crud('/api/fmea', {
    added: 'FMEA adicionado!', updated: 'FMEA atualizado!', removed: 'FMEA excluído.', confirm: 'Excluir este item da análise FMEA?',
  });
  const inventoryOps = crud('/api/inventory', {
    added: 'Item adicionado ao estoque!', updated: 'Estoque atualizado!', removed: 'Item excluído.', confirm: 'Excluir item do estoque?',
  });
  const planOps = crud('/api/preventive-plans', {
    added: 'Plano preventivo criado!', updated: 'Plano atualizado!', removed: 'Plano excluído.', confirm: 'Excluir este plano preventivo?',
  });
  const workOrderOps = crud('/api/work-orders', {
    added: 'Ordem de Serviço criada!', updated: 'O.S. atualizada!', removed: 'O.S. excluída.', confirm: 'Excluir esta ordem de serviço?',
  });
  const unitOps = crud('/api/units', {
    added: 'Unidade criada!', updated: 'Unidade atualizada!', removed: 'Unidade excluída.', confirm: 'Excluir esta unidade?',
  });
  const userOps = crud('/api/users', {
    updated: 'Membro atualizado!', removed: 'Membro removido.', confirm: 'Remover este membro da equipe? Ele perderá o acesso imediatamente.',
  });

  const addUser = async (body) => {
    const result = await mutate({ method: 'POST', path: '/api/users', body });
    if (result) {
      toast.success(result.invite_sent
        ? `Convite enviado para ${result.email}.`
        : body.password ? 'Membro adicionado!' : 'Membro adicionado, mas o e-mail de convite não pôde ser enviado. Peça para ele usar "Esqueci minha senha".');
    }
    return result;
  };

  return (
    <DataContext.Provider value={{
      scope,
      dataVersion,
      units,
      activeUnit,
      setActiveUnit,
      equipments,
      users,
      mutate,
      refreshData: loadLookups,
      addEquipment: equipmentOps.add,
      updateEquipment: equipmentOps.update,
      deleteEquipment: equipmentOps.remove,
      addFailure: failureOps.add,
      updateFailure: failureOps.update,
      deleteFailure: failureOps.remove,
      addFmea: fmeaOps.add,
      updateFmea: fmeaOps.update,
      deleteFmea: fmeaOps.remove,
      addWorkOrder: workOrderOps.add,
      updateWorkOrder: workOrderOps.update,
      deleteWorkOrder: workOrderOps.remove,
      addInventoryItem: inventoryOps.add,
      updateInventoryItem: inventoryOps.update,
      deleteInventoryItem: inventoryOps.remove,
      addPreventivePlan: planOps.add,
      updatePreventivePlan: planOps.update,
      deletePreventivePlan: planOps.remove,
      addUnit: unitOps.add,
      updateUnit: unitOps.update,
      deleteUnit: unitOps.remove,
      addUser,
      updateUser: userOps.update,
      deleteUser: userOps.remove,
    }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => useContext(DataContext);
