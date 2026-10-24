import { toast } from 'sonner';

/**
 * Registra o service worker (app instalável e uso sem internet). Quando há versão nova, pergunta
 * antes de recarregar, para não perder um formulário em preenchimento.
 */
export const registerPwa = async () => {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  const { registerSW } = await import('virtual:pwa-register');
  const updateSW = registerSW({
    onNeedRefresh() {
      toast('Nova versão do SmartMaint disponível.', {
        duration: Infinity,
        action: { label: 'Atualizar', onClick: () => updateSW(true) },
      });
    },
    onOfflineReady() {
      toast.success('SmartMaint pronto para uso sem internet neste aparelho.');
    },
  });
};
