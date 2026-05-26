import nodemailer from 'nodemailer';
import { normalizeEmailValue } from '../utils/emailValidation.js';

function getEmailConfig() {
  const user = process.env.SMTP_USER?.trim() || process.env.EMAIL_USER?.trim() || '';
  const normalizedUser = normalizeEmailValue(user);
  const pass = process.env.SMTP_PASS?.trim() || process.env.EMAIL_PASS?.trim() || '';
  const host = process.env.SMTP_HOST?.trim() || (user && pass ? 'smtp.gmail.com' : '');
  const port = Number(process.env.SMTP_PORT) || (host === 'smtp.gmail.com' ? 465 : 587);

  return {
    host,
    port,
    secure: port === 465,
    user,
    pass,
    from: process.env.EMAIL_FROM?.trim() || `UrBridge.ai <${normalizedUser || 'noreply@urbridge.ai'}>`,
  };
}

function getMissingVars() {
  const config = getEmailConfig();
  const missing = [];

  if (!config.user) {
    missing.push('SMTP_USER or EMAIL_USER');
  }

  if (!config.pass) {
    missing.push('SMTP_PASS or EMAIL_PASS');
  }

  if (!config.host) {
    missing.push('SMTP_HOST');
  }

  return missing;
}

function createTransporter() {
  const config = getEmailConfig();

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function assertEmailConfig() {
  const missingVars = getMissingVars();
  if (missingVars.length > 0) {
    throw new Error(`Email service not configured. Missing: ${missingVars.join(', ')}`);
  }
}

export const sendResetPasswordEmail = async (to, resetLink) => {
  assertEmailConfig();
  const config = getEmailConfig();

  const mailOptions = {
    from: config.from,
    to,
    subject: 'Reset Your UrBridge.ai Password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0f52ba;">UrBridge.ai Password Reset</h2>
        <p>Hello,</p>
        <p>You requested a password reset for your UrBridge.ai account. Click the link below to reset your password:</p>
        <div style="margin: 24px 0;">
          <a href="${escapeHtml(resetLink)}"
             style="background: #0f52ba; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p>Or copy and paste this URL into your browser:</p>
        <p style="word-break: break-all; color: #555;">${escapeHtml(resetLink)}</p>
        <p style="color: #888; font-size: 12px;">This link will expire in 1 hour. If you didn't request this, please ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #888; font-size: 12px;">UrBridge.ai - Resume Analyzer</p>
      </div>
    `,
  };

  try {
    const info = await createTransporter().sendMail(mailOptions);
    console.log('Reset email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('Email send error:', error);
    throw error;
  }
};

export const verifyEmailConfig = async () => {
  const missingVars = getMissingVars();
  if (missingVars.length > 0) {
    console.warn('Email service not configured:', missingVars.join(', '));
    return false;
  }

  try {
    await createTransporter().verify();
    console.log('Email service ready');
    return true;
  } catch (error) {
    console.warn('Email service configuration error:', error.message);
    return false;
  }
};
