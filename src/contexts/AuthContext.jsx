import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const ROLES = {
  ADMIN: 'Administrador',
  USER: 'Usuário'
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [activeTenant, setActiveTenant] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchTenants = async () => {
    try {
      const res = await fetch('/api/tenants');
      if (res.ok) {
        const data = await res.json();
        setTenants(data);
      }
    } catch (error) {
      console.error('Erro ao buscar unidades:', error);
    }
  };

  useEffect(() => {
    const savedUser = localStorage.getItem('sm_user');
    const savedTenant = localStorage.getItem('sm_tenant');
    if (savedUser) {
      const parsedUser = JSON.parse(savedUser);
      setUser(parsedUser);
      setActiveTenant(savedTenant || parsedUser.tenant_id);
      fetchTenants();
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (res.ok) {
        const userData = await res.json();
        const formattedUser = {
          ...userData,
          isMaster: userData.is_master === 1,
          company: userData.tenant_id ? userData.tenant_id.toUpperCase() : 'SmartMaint'
        };
        
        setUser(formattedUser);
        setActiveTenant(formattedUser.tenant_id || 'delp');
        
        localStorage.setItem('sm_user', JSON.stringify(formattedUser));
        localStorage.setItem('sm_tenant', formattedUser.tenant_id || 'delp');
        
        await fetchTenants();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Erro na autenticação:', error);
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    setActiveTenant(null);
    setTenants([]);
    localStorage.removeItem('sm_user');
    localStorage.removeItem('sm_tenant');
  };

  const switchTenant = (tenantId) => {
    if (user?.isMaster) {
      setActiveTenant(tenantId);
      localStorage.setItem('sm_tenant', tenantId);
    }
  };

  const hasRole = (allowedRoles) => {
    if (!user) return false;
    if (user.isMaster) return true;
    return allowedRoles.includes(user.role);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      activeTenant, 
      tenants,
      login, 
      logout, 
      hasRole, 
      switchTenant,
      loading 
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
