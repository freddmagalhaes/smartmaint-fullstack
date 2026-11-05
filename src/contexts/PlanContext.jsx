import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

const PlanContext = createContext({ plan: null, limits: null, usage: null, features: null, loaded: false, refresh: () => {} });

// Plano, limites e uso do tenant ativo. Enquanto não carregou (ou para o backoffice sem tenant),
// nada é bloqueado na interface; quem decide de verdade é o servidor.
export const PlanProvider = ({ children }) => {
  const { token, activeTenant, user } = useAuth();
  const [data, setData] = useState({ plan: null, limits: null, usage: null, features: null, loaded: false });

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const url = user?.isMaster || user?.role === 'Suporte' ? `/api/plan?tenant_id=${encodeURIComponent(activeTenant || '')}` : '/api/plan';
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setData({ ...(await res.json()), loaded: true });
      else setData({ plan: null, limits: null, usage: null, features: null, loaded: true });
    } catch {
      setData((d) => ({ ...d, loaded: true }));
    }
  }, [token, activeTenant, user]);

  useEffect(() => { refresh(); }, [refresh]);

  return <PlanContext.Provider value={{ ...data, refresh }}>{children}</PlanContext.Provider>;
};

export const usePlan = () => useContext(PlanContext);

// true se o recurso está liberado (ou se ainda não sabemos: o servidor valida de qualquer forma)
export const hasFeature = (plan, feature) => !plan.features || plan.features[feature] !== false;
