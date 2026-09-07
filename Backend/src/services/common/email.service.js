const nodemailer = require('nodemailer');
const { env } = require('../../core/config/env');
const { logger } = require('./log.service');

let transporter;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: { user: env.smtp.user, pass: env.smtp.password },
      pool: true,
      maxConnections: 5,
    });
  }
  return transporter;
};

const sendEmail = async ({ to, subject, text, html, attachments = [] }) => {
  const info = await getTransporter().sendMail({
    from: { name: env.smtp.fromName, address: env.smtp.fromEmail },
    to,
    subject,
    text,
    html,
    attachments,
  });
  logger.info('Email accepted by SMTP server', { to, subject, messageId: info.messageId });
  return { messageId: info.messageId, accepted: info.accepted };
};

module.exports = { sendEmail, getTransporter };
