import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { WifiOff, UploadCloud } from 'lucide-react';
import { flushOutbox, pendingCount, OUTBOX_EVENT } from '../api/outbox';
import { useData } from '../contexts/DataContext';

/**
 * Faixa de aviso quando o aparelho está sem internet ou há ações aguardando envio. Ao voltar a
 * conexão (ou ao abrir o app), envia a fila e recarrega as telas.
 */
const OfflineStatus = () => {
  const { refreshData } = useData();
  const [online, setOnline] = useState(() => navigator.onLine);
  const [pending, setPending] = useState(pendingCount);

  const sync = useCallback(async () => {
    if (!pendingCount()) return;
    const { sent, failed } = await flushOutbox();
    if (sent) toast.success(`${sent} ação(ões) feita(s) sem internet foram enviadas.`);
    for (const f of failed) toast.error(`${f.label} não foi aceita: ${f.message}`, { duration: 10000 });
    if (sent || failed.length) refreshData?.();
  }, [refreshData]);

  useEffect(() => {
    const goOnline = () => { setOnline(true); sync(); };
    const goOffline = () => setOnline(false);
    const onQueue = () => setPending(pendingCount());
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    window.addEventListener(OUTBOX_EVENT, onQueue);
    sync();
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener(OUTBOX_EVENT, onQueue);
    };
  }, [sync]);

  if (online && !pending) return null;
  return (
    <div className="offline-bar no-print" role="status">
      {online ? <UploadCloud size={16} /> : <WifiOff size={16} />}
      <span>
        {online
          ? `Enviando ${pending} ação(ões) feita(s) sem internet...`
          : `Sem conexão. Você vê os últimos dados salvos neste aparelho.${pending ? ` ${pending} ação(ões) aguardando envio.` : ' O que você abrir ou comentar nas O.S. será enviado quando a internet voltar.'}`}
      </span>
      {online && pending > 0 && <button onClick={sync}>Tentar agora</button>}
    </div>
  );
};

export default OfflineStatus;
