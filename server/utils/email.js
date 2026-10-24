const nodemailer = require('nodemailer');
const { config } = require('../config');
const logger = require('./logger');

const transporter = config.smtp.host
  ? nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  })
  : null;

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

/**
 * Envia um e-mail. Retorna false se o SMTP não estiver configurado ou o envio falhar.
 * Sem SMTP fora de produção, o conteúdo é impresso no console para facilitar o desenvolvimento.
 */
const sendEmail = async (to, subject, html) => {
  if (!transporter) {
    if (!config.isProduction && !config.isTest) {
      console.log(`[E-mail não enviado — SMTP não configurado]\nPara: ${to}\nAssunto: ${subject}\n${html}`);
    }
    return false;
  }
  try {
    await transporter.sendMail({ from: `"SmartMaint" <${config.smtp.from}>`, to, subject, html });
    return true;
  } catch (error) {
    logger.error({ err: error, to }, 'erro ao enviar e-mail');
    return false;
  }
};

const button = (url, label) => `<a href="${escapeHtml(url)}" style="padding: 10px 20px; background: #1e3a8a; color: white; text-decoration: none; border-radius: 5px;">${label}</a>`;

const sendPasswordResetEmail = (to, name, url) => sendEmail(to, 'Recuperação de Senha - SmartMaint', `
  <h2>Olá, ${escapeHtml(name)}</h2>
  <p>Você solicitou a redefinição de senha da sua conta SmartMaint.</p>
  <p>Clique no link abaixo para criar uma nova senha:</p>
  ${button(url, 'Redefinir Senha')}
  <p>Este link expira em 1 hora.</p>
  <p>Se não foi você, ignore este e-mail.</p>
`);

const sendInviteEmail = (to, name, company, url) => sendEmail(to, 'Seu acesso ao SmartMaint', `
  <h2>Olá, ${escapeHtml(name)}</h2>
  <p>Você foi convidado(a) para acessar o SmartMaint${company ? ` da empresa <strong>${escapeHtml(company)}</strong>` : ''}.</p>
  <p>Clique no link abaixo para definir sua senha e ativar o acesso:</p>
  ${button(url, 'Definir Senha')}
  <p>Este link expira em 72 horas.</p>
`);

module.exports = { sendEmail, sendPasswordResetEmail, sendInviteEmail, escapeHtml };
