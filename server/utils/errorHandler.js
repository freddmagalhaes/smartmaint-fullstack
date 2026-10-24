const multer = require('multer');
const { config } = require('../config');

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const notFound = (req, res) => res.status(404).json({ error: 'Rota não encontrada' });

// Middleware central de erros: as rotas apenas lançam exceções (Express 5 captura erros assíncronos)
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...(err.code && { code: err.code }) });
  }
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo excede o tamanho máximo de 5MB' : err.message;
    return res.status(400).json({ error: message });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido' });
  }
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'Registro já existe (valor duplicado)' });
  }
  if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') {
    return res.status(400).json({ error: 'Registro relacionado não encontrado' });
  }

  console.error(`[Erro] ${req.method} ${req.originalUrl}:`, err);
  const body = { error: 'Erro interno no servidor' };
  if (!config.isProduction) body.details = err.message;
  return res.status(500).json(body);
};

module.exports = { HttpError, errorHandler, notFound };
