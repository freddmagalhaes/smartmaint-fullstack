import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

const DataContext = createContext();

export const DataProvider = ({ children }) => {
  const { activeTenant } = useAuth();
  
  const [equipments, setEquipments] = useState([]);
  const [failures, setFailures] = useState([]);
  const [repairs, setRepairs] = useState([]);
  const [fmea, setFmea] = useState([]);
  const [users, setUsers] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  // --- BUSCA DE DADOS ---
  const fetchData = useCallback(async () => {
    if (!activeTenant) return;
    setLoading(true);
    try {
      const [eqs, fls, fma, usr, wos] = await Promise.all([
        fetch(`/api/equipments?tenant_id=${activeTenant}`).then(res => res.json()),
        fetch(`/api/failures?tenant_id=${activeTenant}`).then(res => res.json()),
        fetch(`/api/fmea?tenant_id=${activeTenant}`).then(res => res.json()),
        fetch(`/api/users?tenant_id=${activeTenant}`).then(res => res.json()),
        fetch(`/api/work-orders?tenant_id=${activeTenant}`).then(res => res.json())
      ]);

      setEquipments(eqs || []);
      setFailures(fls || []);
      setFmea(fma || []);
      setUsers(usr || []);
      setWorkOrders(wos || []);
    } catch (error) {
      console.error('Erro ao sincronizar dados com o servidor:', error);
    } finally {
      setLoading(false);
    }
  }, [activeTenant]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- OPERAÇÕES CRUD (API) ---
  const addEquipment = async (data) => {
    try {
      const res = await fetch('/api/equipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, tenant_id: activeTenant })
      });
      if (res.ok) fetchData();
    } catch (err) { console.error('Erro ao adicionar equipamento:', err); }
  };

  const updateEquipment = async (id, data) => {
    try {
      const res = await fetch(`/api/equipments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) fetchData();
    } catch (err) { console.error('Erro ao atualizar equipamento:', err); }
  };

  const deleteEquipment = async (id) => {
    if (!window.confirm('Tem certeza que deseja excluir este equipamento?')) return;
    try {
      const res = await fetch(`/api/equipments/${id}`, { method: 'DELETE' });
      if (res.ok) fetchData();
    } catch (err) { console.error('Erro ao excluir equipamento:', err); }
  };

  const addFailure = async (data) => {
    try {
      const res = await fetch('/api/failures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, tenant_id: activeTenant })
      });
      if (res.ok) fetchData();
    } catch (err) { console.error('Erro ao registrar falha:', err); }
  };

  const deleteFailure = async (id) => {
    try {
      await fetch(`/api/failures/${id}`, { method: 'DELETE' });
      fetchData();
    } catch (err) { console.error('Erro ao excluir falha:', err); }
  };

  const addFmea = async (data) => {
    try {
      const res = await fetch('/api/fmea', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, tenant_id: activeTenant })
      });
      if (res.ok) fetchData();
    } catch (err) { console.error('Erro ao adicionar FMEA:', err); }
  };

  const deleteFmea = async (id) => {
    try {
      await fetch(`/api/fmea/${id}`, { method: 'DELETE' });
      fetchData();
    } catch (err) { console.error('Erro ao excluir FMEA:', err); }
  };

  const addWorkOrder = async (data) => {
    try {
      const res = await fetch('/api/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, tenant_id: activeTenant })
      });
      if (res.ok) fetchData();
    } catch (err) { console.error('Erro ao criar O.S.:', err); }
  };

  const updateWorkOrder = async (id, data) => {
    try {
      const res = await fetch(`/api/work-orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) fetchData();
    } catch (err) { console.error('Erro ao atualizar O.S.:', err); }
  };

  const deleteWorkOrder = async (id) => {
    try {
      await fetch(`/api/work-orders/${id}`, { method: 'DELETE' });
      fetchData();
    } catch (err) { console.error('Erro ao excluir O.S.:', err); }
  };

  const addUser = async (data) => {
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, tenant_id: activeTenant })
      });
      if (res.ok) fetchData();
    } catch (err) { console.error('Erro ao adicionar usuário:', err); }
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
