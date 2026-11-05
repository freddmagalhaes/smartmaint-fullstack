const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const pinoHttp = require('pino-http');
const logger = require('./utils/logger');
const { config } = require('./config');
const db = require('./db');
const routes = require('./routes/index');
const { webhookRouter } = require('./routes/billingRoutes');
const { fileRouter } = require('./routes/uploadRoutes');
const { errorHandler, notFound } = require('./utils/errorHandler');

const app = express();
const distDir = path.join(__dirname, '../dist');

app.set('trust proxy', config.trustProxy);
app.disable('x-powered-by');

// Log estruturado de cada requisição com id de correlação (devolvido em X-Request-Id)
app.use(pinoHttp({
  logger,
  genReqId: (req, res) => {
    const incoming = req.headers['x-request-id'];
    const id = typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
  autoLogging: { ignore: (req) => req.url === '/api/health' || !req.url.startsWith('/api') },
  customLogLevel: (req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
  customProps: (req) => (req.user ? { user_id: req.user.id, tenant_id: req.tenantId || req.user.tenant_id || null } : {}),
}));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      // Imagens de equipamentos podem vir de URLs https externas
      'img-src': ["'self'", 'data:', 'https:'],
      // Sentry do frontend (opcional) envia erros para o domínio de ingestão
      'connect-src': ["'self'", 'https://*.ingest.sentry.io', 'https://*.ingest.us.sentry.io', 'https://*.ingest.de.sentry.io'],
      // Só força HTTPS nos recursos quando o site já é servido por HTTPS (evita quebrar deploys em HTTP)
      'upgrade-insecure-requests': process.env.FORCE_HTTPS === 'true' ? [] : null,
    },
  },
}));

// Em produção o frontend é servido pelo próprio backend (mesma origem): CORS só se configurado
if (config.corsOrigins.length) app.use(cors({ origin: config.corsOrigins }));

// Health check para load balancer / orquestrador (sem autenticação e sem rate limit)
app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'OK' });
  } catch {
    res.status(503).json({ status: 'ERROR', message: 'Banco de dados indisponível' });
  }
});

// Webhook precisa do corpo bruto para validar a assinatura, por isso vem antes do express.json
app.use('/api', webhookRouter);

app.use(express.json({ limit: '1mb' }));

app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.rateLimit.apiMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' },
}));

app.use('/api', routes);
app.use('/uploads', fileRouter);
app.use('/uploads', notFound);

// Frontend (build do Vite). Arquivos com hash podem ficar em cache por muito tempo.
if (fs.existsSync(distDir)) {
  app.use('/assets', express.static(path.join(distDir, 'assets'), { immutable: true, maxAge: '1y' }));
  app.use(express.static(distDir, { index: false }));
  // Demais rotas GET caem no React Router (SPA)
  app.get('/{*splat}', (req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

app.use(notFound);
app.use(errorHandler);

module.exports = app;
