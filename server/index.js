const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require('./db');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Rotas da API
app.use('/api', routes);

// Rota inicial para evitar "Cannot GET /"
app.get('/', (req, res) => {
  res.send('🚀 Backend do SmartMaint está rodando! Acesse o frontend na porta 5173.');
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
