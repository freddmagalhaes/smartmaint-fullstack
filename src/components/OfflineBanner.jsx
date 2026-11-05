import { useEffect, useState } from 'react';

/** Aviso quando o aparelho está sem internet. O aplicativo abre offline, mas os dados vêm do servidor. */
const OfflineBanner = () => {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  if (online) return null;
  return (
    <div role="status" style={{ background: '#fef3c7', color: '#92400e', padding: '10px 16px', fontSize: '13px', fontWeight: 600, textAlign: 'center' }}>
      Sem conexão. O que você vê pode estar desatualizado e alterações não serão salvas até a internet voltar.
    </div>
  );
};

export default OfflineBanner;
