const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error("FATAL ERROR: JWT_SECRET is not defined in .env");
  process.exit(1);
}

// Lê e valida o token. Retorna o payload ou null (e já responde 401).
const readToken = (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido ou inválido' });
  }

  const token = authHeader.split(' ')[1];

  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    res.status(401).json({ error: 'Token expirado ou inválido' });
    return null;
  }
};

// Uso geral: recusa o token de faturamento (emitido a quem está com teste vencido/pagamento em atraso)
const authMiddleware = (req, res, next) => {
  const decoded = readToken(req, res);
  if (!decoded) return;
  if (decoded.scope === 'billing') {
    return res.status(403).json({ error: 'Esta sessão só permite acessar o faturamento.' });
  }
  req.user = decoded; // Adiciona os dados do usuário no request
  next();
};

// Rotas de faturamento: aceita o token normal e o token restrito de faturamento
const authAllowBilling = (req, res, next) => {
  const decoded = readToken(req, res);
  if (!decoded) return;
  req.user = decoded;
  next();
};

module.exports = authMiddleware;
module.exports.authAllowBilling = authAllowBilling;
