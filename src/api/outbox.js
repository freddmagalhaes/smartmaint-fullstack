// Fila de ações feitas sem internet (o técnico no chão de fábrica). Ficam guardadas no aparelho
// e são enviadas, na ordem, quando a conexão volta. Só ações seguras de repetir entram na fila:
// a abertura de O.S. leva um client_ref, então um reenvio não duplica a O.S.

import { apiFetch } from './client';

const KEY = 'sm_outbox';
export const OUTBOX_EVENT = 'sm:outbox';

const QUEUEABLE = [
  { method: 'POST', pattern: /^\/api\/work-orders(\?|$)/, label: 'Abertura de O.S.' },
  { method: 'POST', pattern: /^\/api\/work-orders\/\d+\/comments(\?|$)/, label: 'Comentário na O.S.' },
  { method: 'PUT', pattern: /^\/api\/work-orders\/\d+\/checklist\/\d+(\?|$)/, label: 'Item do checklist' },
  { method: 'PUT', pattern: /^\/api\/work-orders\/\d+(\?|$)/, label: 'Atualização de O.S.' },
];

const read = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
};

const write = (items) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch { /* armazenamento indisponível */ }
  window.dispatchEvent(new CustomEvent(OUTBOX_EVENT, { detail: { count: items.length } }));
};

const currentUserId = () => {
  try {
    return JSON.parse(localStorage.getItem('sm_user') || 'null')?.id ?? null;
  } catch {
    return null;
  }
};

/** Regra da fila para a requisição, ou undefined se ela não pode esperar a conexão voltar. */
export const queueRule = (method, path) => QUEUEABLE.find((q) => q.method === method && q.pattern.test(path));

export const enqueue = ({ method, path, body }) => {
  const rule = queueRule(method, path);
  if (!rule) return false;
  write([...read(), { id: crypto.randomUUID(), userId: currentUserId(), method, path, body, label: rule.label, at: Date.now() }]);
  return true;
};

/** Ações do usuário atual aguardando envio. */
export const pendingCount = () => read().filter((i) => i.userId === currentUserId()).length;

/** Descarta as ações do usuário atual (ao sair do sistema). */
export const clearOutbox = () => {
  const userId = currentUserId();
  write(read().filter((i) => i.userId !== userId));
};

let flushing = false;

/**
 * Envia a fila na ordem. Para na primeira falha de conexão (tenta de novo depois); ação recusada
 * pelo servidor (ex.: O.S. já concluída por outra pessoa) sai da fila e é informada em `failed`.
 */
export const flushOutbox = async () => {
  if (flushing || !navigator.onLine) return { sent: 0, failed: [] };
  flushing = true;
  const userId = currentUserId();
  let sent = 0;
  const failed = [];
  try {
    for (const item of read()) {
      // Ações de outro usuário deste aparelho não são enviadas com a sessão atual
      if (item.userId !== userId) continue;
      try {
        await apiFetch(item.path, { method: item.method, body: item.body });
        sent += 1;
      } catch (err) {
        if (err.status === 0 || err.status === 401 || err.status >= 500) break;
        failed.push({ label: item.label, message: err.message });
      }
      write(read().filter((i) => i.id !== item.id));
    }
  } finally {
    flushing = false;
  }
  return { sent, failed };
};
