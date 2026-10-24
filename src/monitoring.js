// Monitoramento de erros do frontend. O Sentry só é baixado quando VITE_SENTRY_DSN é definido no build.
let sentry = null;

export const initMonitoring = async () => {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  try {
    sentry = await import('@sentry/react');
    sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      release: import.meta.env.VITE_APP_VERSION,
      sendDefaultPii: false,
    });
  } catch {
    sentry = null;
  }
};

export const reportError = (error, context) => {
  if (sentry) sentry.captureException(error, context ? { extra: context } : undefined);
  else console.error(error);
};
