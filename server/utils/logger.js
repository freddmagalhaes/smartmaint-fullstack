const pino = require('pino');

const isTest = process.env.NODE_ENV === 'test';

/**
 * Logger estruturado (JSON em uma linha), pronto para CloudWatch Logs Insights.
 * Campos sensíveis são mascarados antes de qualquer gravação.
 */
const logger = pino({
  level: process.env.LOG_LEVEL || (isTest ? 'silent' : 'info'),
  base: { service: 'smartmaint-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["stripe-signature"]',
      '*.password',
      '*.newPassword',
      '*.currentPassword',
      '*.token',
    ],
    censor: '[oculto]',
  },
});

module.exports = logger;
