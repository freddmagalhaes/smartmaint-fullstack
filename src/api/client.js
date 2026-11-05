// Cliente HTTP único da aplicação: injeta o token, trata erros e sessão expirada.

export const TOKEN_KEY = 'sm_token';
export const SESSION_EXPIRED_EVENT = 'sm:session-expired';

export class ApiError extends Error {
  constructor(status, message, code, body) {
    super(message);
    this.status = status;
    this.code = code;
    this.body = body;
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
    throw new ApiError(res.status, message, data?.code, data);
  }
  return data;
};

/** Baixa um arquivo da API (ex.: exportação em .xlsx) e abre o "Salvar como" do navegador. */
export const apiDownload = async (path, fallbackName = 'arquivo') => {
  const token = getToken();
  let res;
  try {
    res = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new ApiError(0, 'Falha de comunicação com o servidor. Verifique sua conexão.');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data?.error || `Erro ${res.status}`, data?.code, data);
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Acrescenta parâmetros de query ignorando valores vazios. */
export const withQuery = (path, params) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();
  return qs ? `${path}?${qs}` : path;
};
