import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';

const DataContext = createContext();

export const DataProvider = ({ children }) => {
  const { activeTenant, token } = useAuth();
  
  const [equipments, setEquipments] = useState([]);
  const [failures, setFailures] = useState([]);
  const [repairs, setRepairs] = useState([]);
  const [fmea, setFmea] = useState([]);
  const [users, setUsers] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  const getHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  });

  // --- BUSCA DE DADOS ---
  const fetchData = useCallback(async () => {
    if (!activeTenant || !token) return;
    setLoading(true);
    try {
      const [eqs, fls, rps, fma, usr, wos] = await Promise.all([
        fetch(`/api/equipments?tenant_id=${activeTenant}`, { headers: getHeaders() }).then(res => res.json()),
        fetch(`/api/failures?tenant_id=${activeTenant}`, { headers: getHeaders() }).then(res => res.json()),
        fetch(`/api/repairs?tenant_id=${activeTenant}`, { headers: getHeaders() }).then(res => res.json()),
        fetch(`/api/fmea?tenant_id=${activeTenant}`, { headers: getHeaders() }).then(res => res.json()),
        fetch(`/api/users?tenant_id=${activeTenant}`, { headers: getHeaders() }).then(res => res.json()),
        fetch(`/api/work-orders?tenant_id=${activeTenant}`, { headers: getHeaders() }).then(res => res.json())
      ]);

      setEquipments(eqs || []);
      setFailures(fls || []);
      setRepairs(rps || []);
      setFmea(fma || []);
      setUsers(usr || []);
      setWorkOrders(wos || []);
    } catch (error) {
      console.error('Erro ao sincronizar dados:', error);
      toast.error('Erro ao sincronizar dados com o servidor.');
    } finally {
      setLoading(false);
    }
  }, [activeTenant, token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- OPERAÇÕES CRUD (API) ---
  const addEquipment = async (data) => {
    try {
      const res = await fetch('/api/equipments', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ ...data, tenant_id: activeTenant })
      });
      if (res.ok) {
        toast.success('Equipamento adicionado!');
        fetchData();
      } else throw new Error();
    } catch (err) { toast.error('Erro ao adicionar equipamento.'); }
  };

  const updateEquipment = async (id, data) => {
    try {
      const res = await fetch(`/api/equipments/${id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(data)
      });
      if (res.ok) {
        toast.success('Equipamento atualizado!');
        fetchData();
      } else throw new Error();
    } catch (err) { toast.error('Erro ao atualizar equipamento.'); }
  };

  const deleteEquipment = async (id) => {
    if (!window.confirm('Tem certeza que deseja excluir este equipamento?')) return;
    try {
      const res = await fetch(`/api/equipments/${id}`, { 
        method: 'DELETE',
        headers: getHeaders() 
      });
      if (res.ok) {
        toast.success('Equipamento excluído.');
        fetchData();
      } else throw new Error();
    } catch (err) { toast.error('Erro ao excluir equipamento.'); }
  };

  const addFailure = async (data) => {
    try {
      const res = await fetch('/api/failures', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ ...data, tenant_id: activeTenant })
      });
      if (res.ok) {
        toast.success('Falha registrada!');
        fetchData();
      } else throw new Error();
    } catch (err) { toast.error('Erro ao registrar falha.'); }
  };

  const deleteFailure = async (id) => {
    try {
      const res = await fetch(`/api/failures/${id}`, { 
        method: 'DELETE',
        headers: getHeaders()
      });
      if (res.ok) {
        toast.success('Falha excluída.');
        fetchData();
      } else throw new Error();
    } catch (err) { toast.error('Erro ao excluir falha.'); }
  };

  const addFmea = async (data) => {
    try {
      const res = await fetch('/api/fmea', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ ...data, tenant_id: activeTenant })
      });
      if (res.ok) {
        toast.success('FMEA adicionado!');
        fetchData();
      } else throw new Error();
    } catch (err) { toast.error('Erro ao adicionar FMEA.'); }
  };

  const deleteFmea = async (id) => {
    try {
      const res = await fetch(`/api/fmea/${id}`, { 
        method: 'DELETE',
        headers: getHeaders()
      });
      if (res.ok) {
        toast.success('FMEA excluído.');
        fetchData();
      } else throw new Error();
    } catch (err) { toast.error('Erro ao excluir FMEA.'); }
  };

  const addWorkOrder = async (data) => {
    try {
      const res = await fetch('/api/work-orders', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ ...data, tenant_id: activeTenant })
      });
      if (res.ok) {
        toast.success('Ordem de Serviço criada!');
        fetchData();
      } else throw new Error();
    } catch (err) { toast.error('Erro ao criar O.S.'); }
  };

  const updateWorkOrder = async (id, data) => {
    try {
      const res = await fetch(`/api/work-orders/${id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(data)
      });
      if (res.ok) {
        toast.success('Status da O.S. atualizado!');
        fetchData();
      } else throw new Error();
    } catch (err) { toast.error('Erro ao atualizar O.S.'); }
  };

  const deleteWorkOrder = async (id) => {
    try {
      const res = await fetch(`/api/work-orders/${id}`, { 
        method: 'DELETE',
        headers: getHeaders()
      });
      if (res.ok) {
        toast.success('O.S. excluída.');
        fetchData();
      } else throw new Error();
    } catch (err) { toast.error('Erro ao excluir O.S.'); }
  };

  const addUser = async (data) => {
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ ...data, tenant_id: activeTenant })
      });
      if (res.ok) {
        toast.success('Membro da equipe adicionado!');
        fetchData();
      } else {
        const error = await res.json();
        toast.error(error.error || 'Erro ao adicionar membro.');
      }
    } catch (err) { toast.error('Erro ao adicionar membro.'); }
  };

  return (
    <DataContext.Provider value={{
      equipments,
      failures,
      repairs,
      fmea,
      users,
      workOrders,
      loading,
      addEquipment,
      updateEquipment,
      deleteEquipment,
      addFailure,
      deleteFailure,
      addFmea,
      deleteFmea,
      addWorkOrder,
      updateWorkOrder,
      deleteWorkOrder,
      addUser,
      refreshData: fetchData
    }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => useContext(DataContext);
