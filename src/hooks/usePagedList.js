import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { apiFetch, withQuery } from '../api/client';
import { useData } from '../contexts/DataContext';

/** Atrasa a atualização de um valor (ex.: busca enquanto o usuário digita). */
export const useDebounced = (value, delay = 350) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
};

/**
 * Lista paginada no servidor. Aplica automaticamente o cliente e a unidade ativos e
 * recarrega quando filtros, página ou dados (após qualquer alteração) mudam.
 *
 * @returns {{ items, total, page, pageSize, setPage, loading, reload }}
 */
export const usePagedList = (path, filters = {}, { pageSize = 25, enabled = true } = {}) => {
  const { scope, dataVersion } = useData();
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const requestRef = useRef(0);

  const filterKey = JSON.stringify(filters);
  const scopeKey = JSON.stringify(scope);

  // Mudou filtro ou unidade: volta para a primeira página
  useEffect(() => { setPage(1); }, [filterKey, scopeKey]);

  useEffect(() => {
    if (!enabled || !scope.tenant_id) return;
    const current = ++requestRef.current;
    setLoading(true);
    apiFetch(withQuery(path, { ...scope, ...JSON.parse(filterKey), page, pageSize }))
      .then((data) => {
        if (current !== requestRef.current) return;
        // Página além do fim (ex.: após excluir o último item): volta uma página
        if (data.items.length === 0 && page > 1) setPage(page - 1);
        else setState({ items: data.items, total: data.total });
      })
      .catch((err) => { if (current === requestRef.current) toast.error(err.message); })
      .finally(() => { if (current === requestRef.current) setLoading(false); });
    // scopeKey/filterKey representam scope e filters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, filterKey, scopeKey, page, pageSize, enabled, dataVersion, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { ...state, page, pageSize, setPage, loading, reload };
};
