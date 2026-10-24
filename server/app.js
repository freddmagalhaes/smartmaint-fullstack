const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
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

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      // Imagens de equipamentos podem vir de URLs https externas
      'img-src': ["'self'", 'data:', 'https:'],
      'connect-src': ["'self'"],
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
