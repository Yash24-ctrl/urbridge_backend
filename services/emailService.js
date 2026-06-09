import nodemailer from 'nodemailer';
import { isValidEmail, normalizeEmailValue } from '../utils/emailValidation.js';

const COUNSELLOR_NAME = 'Ravi Shah';
const COUNSELLOR_TITLE = 'AI Expert Counsellor';

function getCounselorEmail() {
  return normalizeEmailValue(
    process.env.COUNSELOR_EMAIL?.trim()
    || process.env.COUNSELLOR_EMAIL?.trim()
    || process.env.COUNSELOR_MAIL?.trim()
    || process.env.COUNSELLOR_MAIL?.trim()
    || ''
  );
}

function getEmailConfig() {
  const user = process.env.SMTP_USER?.trim() || process.env.EMAIL_USER?.trim() || '';
  const normalizedUser = normalizeEmailValue(user);
  const port = Number(process.env.SMTP_PORT) || (user ? 465 : 587);

  return {
    host: process.env.SMTP_HOST?.trim() || 'smtp.gmail.com',
    port,
    secure: port === 465,
    user,
    pass: process.env.SMTP_PASS?.trim() || process.env.EMAIL_PASS?.trim() || '',
    from: process.env.EMAIL_FROM?.trim() || `UrBridge.ai <${normalizedUser || 'developer@neuronet.in'}>`,
    counselorEmail: getCounselorEmail(),
  };
}

function assertEmailConfig() {
  const config = getEmailConfig();
  const missing = [];

  if (!config.host) missing.push('SMTP_HOST');
  if (!config.port) missing.push('SMTP_PORT');
  if (!config.user) missing.push('SMTP_USER or EMAIL_USER');
  if (!config.pass) missing.push('SMTP_PASS or EMAIL_PASS');
  if (!config.from) missing.push('EMAIL_FROM');

  if (missing.length > 0) {
    throw new Error(`Counseling email service not configured. Missing: ${missing.join(', ')}`);
  }

  return config;
}

function createTransporter(config) {
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

function formatMailList(value) {
  return Array.isArray(value) && value.length > 0
    ? value.join(', ')
    : 'none';
}

function mailInfoIncludesRecipient(list, recipient) {
  const normalizedRecipient = normalizeEmailValue(recipient);

  return Array.isArray(list)
    && list.some((item) => normalizeEmailValue(item) === normalizedRecipient);
}

function assertMailAccepted(label, recipient, info) {
  if (
    !mailInfoIncludesRecipient(info?.accepted, recipient)
    || mailInfoIncludesRecipient(info?.rejected, recipient)
  ) {
    throw new Error(
      `${label} email was not accepted by SMTP. Accepted: ${formatMailList(info?.accepted)}. Rejected: ${formatMailList(info?.rejected)}.`
    );
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildUserEmailHtml(details) {
  const counsellorName = details.counsellorName || COUNSELLOR_NAME;
  const counsellorTitle = details.counsellorTitle || COUNSELLOR_TITLE;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #0f172a;">
      <h2 style="color: #0d1b3e;">Session Booked Successfully</h2>
      <p>Hello ${escapeHtml(details.userName)},</p>
      <p>Your counseling session is confirmed.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 18px 0;">
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Session date</td><td style="padding: 8px; border: 1px solid #e2e8f0;">${escapeHtml(details.readableDate || details.date)}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Time</td><td style="padding: 8px; border: 1px solid #e2e8f0;">${escapeHtml(details.timeSlot)} IST</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Counsellor</td><td style="padding: 8px; border: 1px solid #e2e8f0;">${escapeHtml(counsellorName)}, ${escapeHtml(counsellorTitle)}</td></tr>
      </table>
      <p>
        <a href="${escapeHtml(details.meetLink)}" style="background: #0d1b3e; color: white; padding: 12px 18px; text-decoration: none; border-radius: 8px; display: inline-block;">
          Join Google Meet
        </a>
      </p>
      <p><strong>Direct Google Meet join link:</strong> <a href="${escapeHtml(details.meetLink)}">${escapeHtml(details.meetLink)}</a></p>
      <p><strong>Meeting code:</strong> ${escapeHtml(details.meetingCode)}</p>
      <p><strong>No code needed — just click the link to join</strong></p>
      <p style="color: #64748b;">Please join 5 minutes before your session time.</p>
    </div>
  `;
}

function buildCounselorEmailHtml(details) {
  const counsellorName = details.counsellorName || COUNSELLOR_NAME;
  const counsellorTitle = details.counsellorTitle || COUNSELLOR_TITLE;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #0f172a;">
      <h2 style="color: #0d1b3e;">New Counseling Session Booking</h2>
      <p>This booking is assigned to ${escapeHtml(counsellorName)}, ${escapeHtml(counsellorTitle)}.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 18px 0;">
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">User name</td><td style="padding: 8px; border: 1px solid #e2e8f0;">${escapeHtml(details.userName)}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">User email</td><td style="padding: 8px; border: 1px solid #e2e8f0;">${escapeHtml(details.userEmail)}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">User phone</td><td style="padding: 8px; border: 1px solid #e2e8f0;">${escapeHtml(details.userPhone)}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Session date</td><td style="padding: 8px; border: 1px solid #e2e8f0;">${escapeHtml(details.readableDate || details.date)}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Time</td><td style="padding: 8px; border: 1px solid #e2e8f0;">${escapeHtml(details.timeSlot)} IST</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Help requested</td><td style="padding: 8px; border: 1px solid #e2e8f0;">${escapeHtml(details.helpWith || 'Not provided')}</td></tr>
      </table>
      <p><strong>Direct Google Meet join link:</strong> <a href="${escapeHtml(details.meetLink)}">${escapeHtml(details.meetLink)}</a></p>
      <p><strong>Meeting code:</strong> ${escapeHtml(details.meetingCode)}</p>
    </div>
  `;
}

export async function sendBookingConfirmationEmail(details) {
  const config = assertEmailConfig();
  const transporter = createTransporter(config);
  const selectedCounsellorEmail = normalizeEmailValue(details.counsellorEmail);
  const counsellorRecipient = isValidEmail(selectedCounsellorEmail)
    ? selectedCounsellorEmail
    : config.counselorEmail;
  const shouldNotifyCounsellor = isValidEmail(counsellorRecipient);

  const userMail = {
    from: config.from,
    to: details.userEmail,
    subject: 'Your UrBridge.ai Counseling Session is Confirmed',
    html: buildUserEmailHtml(details),
  };

  const mailTasks = [transporter.sendMail(userMail)];

  if (shouldNotifyCounsellor) {
    mailTasks.push(transporter.sendMail({
      from: config.from,
      to: counsellorRecipient,
      subject: 'New Counseling Session Booking',
      html: buildCounselorEmailHtml(details),
    }));
  }

  const [userResult, counselorResult] = await Promise.allSettled(mailTasks);

  const errors = [];
  let userInfo;
  let counselorInfo;

  if (userResult.status === 'fulfilled') {
    userInfo = userResult.value;

    try {
      assertMailAccepted('User confirmation', details.userEmail, userInfo);
    } catch (error) {
      errors.push(error.message);
    }
  } else {
    errors.push(`User confirmation email failed: ${userResult.reason?.message || userResult.reason}`);
  }

  if (!shouldNotifyCounsellor) {
    counselorInfo = null;
  } else if (counselorResult.status === 'fulfilled') {
    counselorInfo = counselorResult.value;

    try {
      assertMailAccepted('Counsellor notification', counsellorRecipient, counselorInfo);
    } catch (error) {
      errors.push(error.message);
    }
  } else {
    errors.push(`Counsellor notification email failed: ${counselorResult.reason?.message || counselorResult.reason}`);
  }

  if (errors.length > 0) {
    throw new Error(errors.join(' '));
  }

  return { userInfo, counselorInfo };
}

export async function verifyEmailConfig() {
  let config;

  try {
    config = assertEmailConfig();
  } catch (error) {
    console.warn(error.message);
    return false;
  }

  try {
    await createTransporter(config).verify();
    console.log('Email service ready');
    return true;
  } catch (error) {
    console.warn('Email service configuration error:', error.message);
    return false;
  }
}
