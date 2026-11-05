const { config, validateConfig } = require('./config');
const logger = require('./utils/logger');
const { initSentry } = require('./utils/sentry');

validateConfig();
initSentry();

const app = require('./app');
const db = require('./db');
const { runMigrations } = require('./migrations');
const { startBillingScheduler } = require('./utils/billing');
const { startPreventiveScheduler } = require('./utils/preventive');

const start = async () => {
  if (process.env.RUN_MIGRATIONS !== 'false') await runMigrations();
  startBillingScheduler();
  startPreventiveScheduler();

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, 'Servidor SmartMaint iniciado');
  });

  // Encerramento gracioso (deploys e escalonamento no ECS/Beanstalk enviam SIGTERM)
  const shutdown = (signal) => {
    logger.info({ signal }, 'encerrando');
    server.close(() => db.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

start().catch((err) => {
  logger.fatal({ err }, 'falha ao iniciar o servidor');
  process.exit(1);
});
