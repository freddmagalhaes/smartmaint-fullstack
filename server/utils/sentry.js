const logger = require('./logger');

// Sentry é opcional: só é carregado quando SENTRY_DSN está definido
let Sentry = null;

const initSentry = () => {
  if (!process.env.SENTRY_DSN || Sentry) return;
  Sentry = require('@sentry/node');
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    release: process.env.APP_VERSION,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0,
    sendDefaultPii: false,
  });
  logger.info('Sentry ativado');
};

/** Envia o erro ao Sentry com o contexto da requisição (sem dados pessoais além do id). */
const captureException = (err, req) => {
  if (!Sentry) return;
  Sentry.withScope((scope) => {
    if (req) {
      scope.setTag('route', `${req.method} ${req.route?.path || req.path}`);
      scope.setTag('request_id', req.id);
      if (req.user) {
        scope.setUser({ id: String(req.user.id) });
        scope.setTag('tenant_id', req.tenantId || req.user.tenant_id || 'backoffice');
      }
    }
    Sentry.captureException(err);
  });
};

module.exports = { initSentry, captureException };
