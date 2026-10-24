import { useEffect, useState } from 'react';
import { apiFetch } from './client';

let infoRequest;
/** Dados públicos (empresa, versão dos documentos, cadastro aberto), buscados uma vez por sessão. */
export const fetchPublicInfo = () => {
  infoRequest ||= apiFetch('/api/public/info', { auth: false }).catch((err) => {
    infoRequest = null;
    throw err;
  });
  return infoRequest;
};

export const usePublicInfo = () => {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    fetchPublicInfo().then(setInfo).catch(() => setInfo({ legal: {}, signup_enabled: false }));
  }, []);
  return info;
};

/** Data da versão (AAAA-MM-DD) por extenso: 24/10/2026. */
export const versionDate = (version) => (version ? version.split('-').reverse().join('/') : '');
