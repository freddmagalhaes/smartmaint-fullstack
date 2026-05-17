const nodemailer = require('nodemailer');

// O Nodemailer requer configurações reais de SMTP no ambiente de produção.
// Abaixo, um exemplo de configuração que pode ser preenchida via .env.
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: process.env.SMTP_SECURE === 'true', // true para 465, false para outras
  auth: {
    user: process.env.SMTP_USER || 'seu_email@gmail.com',
    pass: process.env.SMTP_PASS || 'sua_senha',
  },
});

/**
 * Envia um e-mail.
 * @param {string} to Destinatário
 * @param {string} subject Assunto
 * @param {string} html Conteúdo HTML
 */
const sendEmail = async (to, subject, html) => {
  try {
    const info = await transporter.sendMail({
      from: `"SmartMaint Suporte" <${process.env.SMTP_USER || 'suporte@smartmaint.com'}>`,
      to,
      subject,
      html,
    });
    console.log(`E-mail enviado: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error('Erro ao enviar e-mail:', error);
    // Em modo de desenvolvimento/sandbox sem as chaves reais, apenas fingimos sucesso
    console.log('[MOCK] E-mail simulado com sucesso (configure as chaves SMTP no .env).');
    return false;
  }
};

module.exports = { sendEmail };
