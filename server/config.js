require('dotenv').config({ quiet: true });

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

const list = (value) => (value || '').split(',').map((v) => v.trim()).filter(Boolean);

const config = {
  isProduction,
  isTest,
  port: Number(process.env.PORT) || 3001,
  // Número de proxies (ALB, CloudFront...) à frente da aplicação. Necessário para o rate limit enxergar o IP real.
  trustProxy: process.env.TRUST_PROXY !== undefined ? Number(process.env.TRUST_PROXY) : (isProduction ? 1 : 0),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  corsOrigins: list(process.env.CORS_ORIGIN),
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  db: {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'smartmaint_db',
    port: Number(process.env.DB_PORT) || 3306,
    // DB_SSL=rds usa os certificados da AWS embutidos no mysql2; DB_SSL=true usa os certificados do sistema
    ssl: process.env.DB_SSL === 'rds' ? 'Amazon RDS' : process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  },
  rateLimit: {
    apiMax: Number(process.env.RATE_LIMIT_API_MAX) || 1000,
    loginMax: Number(process.env.RATE_LIMIT_LOGIN_MAX) || 10,
  },
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    paymentMethods: list(process.env.STRIPE_PAYMENT_METHODS || 'card,boleto'),
  },
  billing: {
    autoBlock: process.env.BILLING_AUTO_BLOCK !== 'false',
    graceDays: Number(process.env.BILLING_GRACE_DAYS) || 10,
  },
  uploads: {
    dir: process.env.UPLOAD_DIR || require('path').join(__dirname, 'uploads'),
    s3Bucket: process.env.S3_BUCKET,
    s3Region: process.env.S3_REGION || process.env.AWS_REGION,
  },
};

const validateConfig = () => {
  const errors = [];
  if (!config.jwtSecret) errors.push('JWT_SECRET não definido');
  else if (isProduction && config.jwtSecret.length < 32) errors.push('JWT_SECRET deve ter ao menos 32 caracteres em produção');
  if (isProduction && !process.env.DB_PASSWORD) errors.push('DB_PASSWORD não definido');
  if (isProduction && !process.env.FRONTEND_URL) errors.push('FRONTEND_URL não definido');
  if (errors.length) {
    console.error(`FATAL: configuração inválida:\n - ${errors.join('\n - ')}`);
    process.exit(1);
  }
  if (isProduction && !config.smtp.host) console.warn('⚠️ SMTP não configurado: e-mails (convites, recuperação de senha) não serão enviados.');
  if (isProduction && !config.stripe.secretKey) console.warn('⚠️ STRIPE_SECRET_KEY não configurada: pagamentos online desativados.');
  if (config.stripe.secretKey && !config.stripe.webhookSecret) console.warn('⚠️ STRIPE_WEBHOOK_SECRET não configurado: faturas pagas não serão baixadas automaticamente.');
};

module.exports = { config, validateConfig };
