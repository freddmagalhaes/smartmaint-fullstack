import { useCallback, useEffect, useState } from 'react';

/**
 * Estado da assinatura e ações (assinar, abrir o portal) usando um token qualquer
 * (o normal da sessão ou o token restrito de faturamento da tela de login).
 */
export const useBilling = (token) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const headers = useCallback(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/billing/subscription', { headers: headers() });
      if (res.ok) setData(await res.json());
      else setError('Não foi possível carregar os dados da assinatura.');
    } catch {
      setError('Sem conexão com o servidor.');
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => { refresh(); }, [refresh]);

  // Faz o POST e, se vier uma URL do Stripe, leva o usuário até lá
  const go = async (path, body) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(path, { method: 'POST', headers: headers(), body: body ? JSON.stringify(body) : undefined });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.url) {
        window.location.assign(json.url);
        return;
      }
      setError(json.error || 'Não foi possível concluir. Tente novamente.');
    } catch {
      setError('Sem conexão com o servidor.');
    } finally {
      setBusy(false);
    }
  };

  return {
    data, loading, busy, error, refresh,
    subscribe: (plan, cycle) => go('/api/billing/subscribe', { plan, cycle }),
    openPortal: () => go('/api/billing/portal'),
  };
};

export const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');
export const brl = (n) => n.toLocaleString('pt-BR');
