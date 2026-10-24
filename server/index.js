const { config, validateConfig } = require('./config');

validateConfig();

const app = require('./app');
const db = require('./db');
const { runMigrations } = require('./migrations');
const { startBillingScheduler } = require('./utils/billing');

const start = async () => {
  if (process.env.RUN_MIGRATIONS !== 'false') await runMigrations();
  startBillingScheduler();

  const server = app.listen(config.port, () => {
    console.log(`🚀 Servidor SmartMaint rodando na porta ${config.port}`);
  });

  // Encerramento gracioso (deploys e escalonamento no ECS/Beanstalk enviam SIGTERM)
  const shutdown = (signal) => {
    console.log(`${signal} recebido, encerrando...`);
    server.close(() => db.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

start().catch((err) => {
  console.error('Falha ao iniciar o servidor:', err);
  process.exit(1);
});
