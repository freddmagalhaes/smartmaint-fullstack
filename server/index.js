const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const db = require('./db');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet({ crossOriginResourcePolicy: false })); // Permite carregar imagens no frontend
app.use(cors());
app.use(express.json());

// Limite de requisições gerais (100 por 15 min)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Muitas requisições deste IP, tente novamente em 15 minutos'
});
app.use('/api', limiter);

// Servir arquivos de upload estaticamente
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rotas da API
app.use('/api', routes);

// Servir frontend (arquivos de build do React)
app.use(express.static(path.join(__dirname, '../dist')));

// Qualquer outra rota não tratada pelas rotas /api cai no React Router (SPA)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Rota de Teste de Conexão
app.get('/api/health', async (req, res) => {
  try {
    const [result] = await db.query('SELECT 1 + 1 AS solution');
    res.json({ status: 'OK', message: 'Backend conectado ao MySQL!', solution: result[0].solution });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: 'Falha na conexão com o banco', error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor SmartMaint rodando na porta ${PORT}`);
});
