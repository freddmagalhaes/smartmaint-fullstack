// Cliente HTTP único da aplicação: injeta o token, trata erros e sessão expirada.

export const TOKEN_KEY = 'sm_token';
export const SESSION_EXPIRED_EVENT = 'sm:session-expired';

export class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

/**
 * Faz uma requisição à API. `body` objeto vira JSON; FormData é enviado como está.
 * Lança ApiError com a mensagem do servidor quando a resposta não é 2xx.
 */
export const apiFetch = async (path, { method = 'GET', body, auth = true } = {}) => {
  const headers = {};
  const token = auth ? getToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload = body;
  if (body !== undefined && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(path, { method, headers, body: payload });
  } catch {
    throw new ApiError(0, 'Falha de comunicação com o servidor. Verifique sua conexão.');
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = data?.error || data?.message || `Erro ${res.status}`;
    // Sessão inválida ou cliente bloqueado: o AuthContext encerra a sessão
    if (auth && token && (res.status === 401 || data?.code === 'TENANT_BLOCKED')) {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { message } }));
    }
    throw new ApiError(res.status, message, data?.code);
  }
  return data;
};

/** Acrescenta parâmetros de query ignorando valores vazios. */
export const withQuery = (path, params) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();
  return qs ? `${path}?${qs}` : path;
};
