const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const db = require('./db');
const routes = require('./routes/index');
const webhookRoutes = require('./routes/webhookRoutes');

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

// Atrás de um proxy reverso (ex.: Nginx no docker-compose), usa o IP real do cliente no rate limit
if (process.env.TRUST_PROXY) {
  const hops = Number(process.env.TRUST_PROXY);
  app.set('trust proxy', Number.isNaN(hops) ? process.env.TRUST_PROXY : hops);
}

app.use(helmet({ crossOriginResourcePolicy: false })); // Permite carregar imagens no frontend

// CORS: só origens autorizadas (CORS_ORIGINS, separadas por vírgula, ou FRONTEND_URL).
// Requisições sem Origin (mesma origem via Nginx, curl, webhooks) passam normalmente.
// Em desenvolvimento, sem configuração, qualquer origem é aceita.
const allowedOrigins = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    if (!isProduction && allowedOrigins.length === 0) return cb(null, true);
    return cb(null, false);
  }
}));

// Webhook do Stripe: precisa do corpo cru (antes do express.json) e fica fora do rate limit geral
app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhookRoutes);

// A importação em lote envia até 1000 linhas: limite maior só nessa rota (antes do parser global)
app.use('/api/equipments/import', express.json({ limit: '1mb' }));
app.use(express.json());

// Limite de requisições gerais (100 por 15 min)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  skip: () => process.env.DISABLE_RATE_LIMIT === '1', // só para a suíte de testes
  message: 'Muitas requisições deste IP, tente novamente em 15 minutos'
});
app.use('/api', limiter);

// Limite específico de autenticação contra força bruta (tentativas bem-sucedidas não contam)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  // Só a suíte de testes liga/desliga isto (o teste de força bruta o reativa); em produção a variável não existe
  skip: () => process.env.DISABLE_RATE_LIMIT === '1',
  message: { error: 'Muitas tentativas. Tente novamente em 15 minutos.' }
});
app.use('/api/login', authLimiter);

// Cadastro autoatendido: poucos cadastros por IP para frear criação em massa de contas
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  skip: () => process.env.DISABLE_RATE_LIMIT === '1',
  message: { error: 'Muitos cadastros deste IP. Tente novamente mais tarde.' }
});
app.use('/api/signup', signupLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password', authLimiter);

// Servir arquivos de upload estaticamente
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rota de Teste de Conexão (antes do fallback da SPA, senão nunca seria alcançada)
app.get('/api/health', async (req, res) => {
  try {
    const [result] = await db.query('SELECT 1 + 1 AS solution');
    res.json({ status: 'OK', message: 'Backend conectado ao MySQL!', solution: result[0].solution });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: 'Falha na conexão com o banco', error: isProduction ? undefined : error.message });
  }
});

// Rotas da API
app.use('/api', routes);

// Servir frontend (arquivos de build do React)
app.use(express.static(path.join(__dirname, '../dist'), {
  // O service worker e o manifesto nunca podem ficar em cache do navegador: senão uma versão nova do app não chega.
  setHeaders: (res, filePath) => {
    if (/(^|[\\/])(sw\.js|workbox-[^\\/]+\.js|manifest\.webmanifest|registerSW\.js)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// Qualquer outra rota não tratada pelas rotas /api cai no React Router (SPA)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Só abre a porta quando executado diretamente (os testes importam o app)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor SmartMaint rodando na porta ${PORT}`);
  });
}

module.exports = app;
