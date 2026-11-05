import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { apiFetch, withQuery } from '../api/client';

const PlanFeaturesContext = createContext({ features: null, planName: null, loaded: false, refresh: () => {} });

/**
 * Recursos incluídos no plano do cliente (FMEA, simulador, importação). Serve só para a interface avisar o
 * usuário (cadeado e convite ao upgrade): quem bloqueia de verdade é o servidor (403 PLAN_FEATURE).
 * Enquanto não carrega, ou se a consulta falhar, nada é bloqueado na tela.
 */
export const PlanFeaturesProvider = ({ children }) => {
  const { user, activeTenant, isBackoffice } = useAuth();
  const [state, setState] = useState({ features: null, planName: null, loaded: false });

  const refresh = useCallback(async () => {
    if (!user || (isBackoffice && !activeTenant)) {
      setState({ features: null, planName: null, loaded: true });
      return;
    }
    try {
      const data = await apiFetch(isBackoffice ? withQuery('/api/plan/features', { tenant_id: activeTenant }) : '/api/plan/features');
      setState({ features: data.features, planName: data.plan_name, loaded: true });
    } catch {
      setState({ features: null, planName: null, loaded: true });
    }
  }, [user, activeTenant, isBackoffice]);

  useEffect(() => { refresh(); }, [refresh]);

  const value = useMemo(() => ({ ...state, refresh }), [state, refresh]);
  return <PlanFeaturesContext.Provider value={value}>{children}</PlanFeaturesContext.Provider>;
};

export const usePlanFeatures = () => useContext(PlanFeaturesContext);

/** true se o recurso está liberado (ou se ainda não sabemos: o servidor valida de qualquer forma). */
export const planHas = (ctx, feature) => !ctx.features || ctx.features[feature] !== false;
