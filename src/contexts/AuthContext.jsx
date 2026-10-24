import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { apiFetch, TOKEN_KEY, SESSION_EXPIRED_EVENT } from '../api/client';

const AuthContext = createContext();

export const ROLES = {
  ROOT: 'Dono',               // Root - dono do sistema, acessa tudo
  BACKOFFICE: 'Suporte',      // Backoffice - suporte ao cliente, acessa sistema + backoffice restrito
  ADMIN: 'Administrador',     // Admin - responsável da empresa contratante, sem backoffice
  MANAGER: 'Gerente',         // Gerente/Supervisor - visualiza parte do sistema
  USER: 'Usuário'             // Usuário - apenas abre e acompanha chamados
};

const USER_KEY = 'sm_user';
// Respostas da API guardadas para uso sem internet (ver vite.config.js): não podem passar de um usuário para outro
const clearOfflineCache = () => {
  if (typeof caches !== 'undefined') caches.delete('smartmaint-api').catch(() => {});
};
const TENANT_KEY = 'sm_tenant';

const storage = {
  get: (key) => { try { return localStorage.getItem(key); } catch { return null; } },
  set: (key, value) => { try { localStorage.setItem(key, value); } catch { /* armazenamento indisponível */ } },
  remove: (key) => { try { localStorage.removeItem(key); } catch { /* armazenamento indisponível */ } },
};

const formatUser = (data) => ({
  ...data,
  isMaster: Boolean(data.is_master),
  company: data.tenant_id ? data.tenant_id.toUpperCase() : 'SmartMaint',
});

const readSavedUser = () => {
  try {
    const saved = storage.get(USER_KEY);
    return saved && storage.get(TOKEN_KEY) ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
};

export const isBackofficeUser = (user) => Boolean(user?.isMaster) || user?.role === ROLES.BACKOFFICE;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(readSavedUser);
  const [token, setTokenState] = useState(() => (readSavedUser() ? storage.get(TOKEN_KEY) : null));
  const [activeTenant, setActiveTenant] = useState(() => {
    const saved = readSavedUser();
    if (!saved) return null;
    return isBackofficeUser(saved) ? storage.get(TENANT_KEY) : saved.tenant_id;
  });
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(() => Boolean(readSavedUser()));

  const persistUser = useCallback((data) => {
    setUser(data);
    storage.set(USER_KEY, JSON.stringify(data));
  }, []);

  const setToken = useCallback((value) => {
    setTokenState(value);
    storage.set(TOKEN_KEY, value);
  }, []);

  const logout = useCallback(() => {
    clearOfflineCache();
    setUser(null);
    setTokenState(null);
    setActiveTenant(null);
    setTenants([]);
    [USER_KEY, TENANT_KEY, TOKEN_KEY].forEach(storage.remove);
  }, []);

  const fetchTenants = useCallback(async () => {
    try {
      setTenants(await apiFetch('/api/tenants'));
    } catch (error) {
      console.error('Erro ao buscar unidades:', error);
    }
  }, []);

  // Revalida a sessão salva ao abrir o app (usuário excluído, senha trocada, cliente bloqueado...)
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    apiFetch('/api/me')
      .then((me) => {
        if (cancelled) return;
        persistUser(formatUser(me));
        fetchTenants();
      })
      .catch(() => { /* 401/403 já encerram a sessão via evento; falha de rede mantém a sessão local */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onExpired = (event) => {
      logout();
      toast.error(event.detail?.message || 'Sua sessão expirou. Faça login novamente.');
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [logout]);

  /** Inicia a sessão com a resposta do login (ou da confirmação de e-mail do cadastro). */
  const startSession = useCallback(async (data) => {
    clearOfflineCache();
    const formattedUser = formatUser(data);
    delete formattedUser.token;
    setToken(data.token);
    persistUser(formattedUser);

    const tenant = isBackofficeUser(formattedUser) ? null : formattedUser.tenant_id;
    setActiveTenant(tenant);
    if (tenant) storage.set(TENANT_KEY, tenant); else storage.remove(TENANT_KEY);

    await fetchTenants();
    return formattedUser;
  }, [setToken, persistUser, fetchTenants]);

  /** Retorna { ok: true } ou { ok: false, error, code } para a tela exibir a mensagem do servidor. */
  const login = async (email, password) => {
    try {
      const data = await apiFetch('/api/login', { method: 'POST', body: { email, password }, auth: false });
      const formattedUser = await startSession(data);
      toast.success(`Bem-vindo, ${formattedUser.name}!`);
      return { ok: true, user: formattedUser };
    } catch (error) {
      return { ok: false, error: error.message, code: error.code };
    }
  };

  /** Recarrega o perfil (status da assinatura, aceite dos termos) depois de mudanças no servidor. */
  const refreshMe = useCallback(async () => {
    try {
      const me = await apiFetch('/api/me');
      persistUser(formatUser(me));
      return me;
    } catch {
      return null;
    }
  }, [persistUser]);

  // Backoffice (Root e Suporte) pode acessar os dados de qualquer cliente
  const switchTenant = (tenantId) => {
    if (!isBackofficeUser(user)) return;
    setActiveTenant(tenantId);
    if (tenantId) storage.set(TENANT_KEY, tenantId); else storage.remove(TENANT_KEY);
  };

  const updateCurrentUser = (changes) => persistUser({ ...user, ...changes });

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
      startSession,
      refreshMe,
      logout,
      hasRole,
      isBackoffice: isBackofficeUser(user),
      switchTenant,
      setToken,
      updateCurrentUser,
      refreshTenants: fetchTenants,
      loading
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
