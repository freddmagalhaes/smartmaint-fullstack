import React, { createContext, useContext, useState, useEffect } from 'react';
import { toast } from 'sonner';

const AuthContext = createContext();

export const ROLES = {
  ROOT: 'Dono',               // Root - dono do sistema, acessa tudo
  BACKOFFICE: 'Suporte',      // Backoffice - suporte ao cliente, acessa sistema + backoffice restrito
  ADMIN: 'Administrador',     // Admin - responsável da empresa contratante, sem backoffice
  MANAGER: 'Gerente',         // Gerente/Supervisor - visualiza parte do sistema
  USER: 'Usuário'             // Usuário - apenas abre e acompanha chamados
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [activeTenant, setActiveTenant] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchTenants = async (authToken) => {
    try {
      const res = await fetch('/api/tenants', {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
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
    const savedToken = localStorage.getItem('sm_token');
    
    if (savedUser && savedToken) {
      const parsedUser = JSON.parse(savedUser);
      setUser(parsedUser);
      setToken(savedToken);
      setActiveTenant(savedTenant || parsedUser.tenant_id);
      fetchTenants(savedToken);
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
        setToken(userData.token);
        setActiveTenant(formattedUser.tenant_id || 'delp');
        
        localStorage.setItem('sm_user', JSON.stringify(formattedUser));
        localStorage.setItem('sm_tenant', formattedUser.tenant_id || 'delp');
        localStorage.setItem('sm_token', userData.token);
        
        await fetchTenants(userData.token);
        toast.success(`Bem-vindo, ${formattedUser.name}!`);
        return true;
      }
      toast.error('Credenciais inválidas.');
      return false;
    } catch (error) {
      console.error('Erro na autenticação:', error);
      toast.error('Erro na comunicação com o servidor.');
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setActiveTenant(null);
    setTenants([]);
    localStorage.removeItem('sm_user');
    localStorage.removeItem('sm_tenant');
    localStorage.removeItem('sm_token');
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
      token,
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
