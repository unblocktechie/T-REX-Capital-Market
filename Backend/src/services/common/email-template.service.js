const { env } = require('../../core/config/env');

const escapeHtml = (value) => String(value).replace(/[&<>\"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#039;',
}[character]));

const layout = ({ preheader, title, greeting, content, buttonText, buttonUrl, footer }) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#172033">
<span style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(18,39,75,.08)">
<tr><td style="background:#102a43;padding:28px 36px;color:#fff;font-size:22px;font-weight:700">${escapeHtml(env.appName)}</td></tr>
<tr><td style="padding:38px 36px"><h1 style="margin:0 0 18px;font-size:27px;color:#102a43">${escapeHtml(title)}</h1>
<p style="font-size:16px;line-height:1.6;margin:0 0 14px">${escapeHtml(greeting)}</p>
<p style="font-size:16px;line-height:1.6;margin:0 0 26px">${escapeHtml(content)}</p>
<p style="text-align:center;margin:30px 0"><a href="${escapeHtml(buttonUrl)}" style="display:inline-block;background:#16a085;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700">${escapeHtml(buttonText)}</a></p>
<p style="font-size:13px;line-height:1.6;color:#627d98;word-break:break-all">If the button does not work, paste this link into your browser:<br>${escapeHtml(buttonUrl)}</p>
</td></tr><tr><td style="padding:22px 36px;background:#eef2f7;color:#627d98;font-size:12px;line-height:1.5">${escapeHtml(footer)}</td></tr>
</table></td></tr></table></body></html>`;

const verificationEmail = ({ fullName, token }) => {
  const url = `${env.frontendUrl.replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(token)}`;
  return {
    subject: `Verify your ${env.appName} email`,
    text: `Hello ${fullName}, verify your email by opening this link: ${url}. This link expires in ${env.auth.verificationTtlMinutes} minutes.`,
    html: layout({
      preheader: 'Confirm your email address to activate your account.', title: 'Verify your email address',
      greeting: `Hello ${fullName},`, content: `Welcome to ${env.appName}. Confirm your email address to finish setting up your account. This link expires in ${env.auth.verificationTtlMinutes} minutes.`,
      buttonText: 'Verify email', buttonUrl: url, footer: 'If you did not create this account, you can safely ignore this message.',
    }),
  };
};

const passwordResetEmail = ({ fullName, token }) => {
  const url = `${env.frontendUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
  return {
    subject: `Reset your ${env.appName} password`,
    text: `Hello ${fullName}, reset your password here: ${url}. This link expires in ${env.auth.resetTtlMinutes} minutes.`,
    html: layout({
      preheader: 'Use this secure link to reset your password.', title: 'Reset your password', greeting: `Hello ${fullName},`,
      content: `We received a request to reset your password. Use the button below within ${env.auth.resetTtlMinutes} minutes.`,
      buttonText: 'Reset password', buttonUrl: url, footer: 'If you did not request a password reset, ignore this email and your password will remain unchanged.',
    }),
  };
};

module.exports = { verificationEmail, passwordResetEmail, escapeHtml };
