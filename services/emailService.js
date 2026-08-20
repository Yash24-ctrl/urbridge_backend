import nodemailer from 'nodemailer';

const BOOKING_NOTIFICATION_EMAIL = 'neuronetsystems01@gmail.com';
const DEFAULT_REAL_INTERVIEWER_EMAIL = BOOKING_NOTIFICATION_EMAIL;
import { isValidEmail, normalizeEmailValue } from '../utils/emailValidation.js';

const COUNSELLOR_NAME = 'Ravi Shah';
const COUNSELLOR_TITLE = 'AI Expert Counsellor';

function getCounselorEmail() {
  return normalizeEmailValue(BOOKING_NOTIFICATION_EMAIL);
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

function uniqueValidEmails(values) {
  return [...new Set(
    values
      .map((value) => normalizeEmailValue(value))
      .filter((value) => isValidEmail(value))
  )];
}

function makeSafePdfFilename(value) {
  const cleaned = String(value || 'resume.pdf')
    .replace(/[\\/:*?"<>|]/g, '-')
    .trim() || 'resume.pdf';

  return /\.pdf$/i.test(cleaned) ? cleaned : `${cleaned}.pdf`;
}

function decodeResumePdf(base64Value, fileName) {
  const normalized = String(base64Value || '').replace(/^data:application\/pdf;base64,/i, '').trim();

  if (!normalized) {
    throw new Error('Resume PDF attachment is missing.');
  }

  const content = Buffer.from(normalized, 'base64');
  if (content.length === 0 || content.subarray(0, 4).toString() !== '%PDF') {
    throw new Error('Resume PDF attachment is invalid.');
  }

  return {
    filename: makeSafePdfFilename(fileName),
    content,
    contentType: 'application/pdf',
  };
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
      <p><strong>No code needed â€” just click the link to join</strong></p>
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
  const counsellorRecipient = BOOKING_NOTIFICATION_EMAIL;
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

export async function sendResetPasswordEmail(email, resetLink) {
  const config = assertEmailConfig();
  const transporter = createTransporter(config);
  const safeResetLink = escapeHtml(resetLink);

  const info = await transporter.sendMail({
    from: config.from,
    to: email,
    subject: 'Reset your UrBridgeAI password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #0f172a;">
        <h2 style="color: #0d1b3e;">Reset your password</h2>
        <p>Hello,</p>
        <p>We received a request to reset your UrBridgeAI password. Use the secure link below to set a new password.</p>
        <p>
          <a href="${safeResetLink}" style="background: #1455d9; color: white; padding: 12px 18px; text-decoration: none; border-radius: 8px; display: inline-block;">
            Set new password
          </a>
        </p>
        <p><strong>Direct reset link:</strong> <a href="${safeResetLink}">${safeResetLink}</a></p>
        <p style="color: #64748b;">This link expires in 1 hour. If you did not request this, you can safely ignore this email.</p>
      </div>
    `,
  });

  assertMailAccepted('Password reset', email, info);
  return info;
}

export async function sendRealInterviewBookingEmail(details) {
  const config = assertEmailConfig();
  const transporter = createTransporter(config);
  const interviewerRecipients = uniqueValidEmails([BOOKING_NOTIFICATION_EMAIL]);

  if (interviewerRecipients.length === 0) {
    throw new Error(`Interviewer email is not configured. Booking notifications must go to ${BOOKING_NOTIFICATION_EMAIL}.`);
  }

  const attachments = [decodeResumePdf(details.resumePdfBase64, details.resumeFileName)];

  const interviewerHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; color: #0f172a;">
      <h2 style="color: #0d1b3e;">New Real Interview Session Booking</h2>
      <p>A student has booked a live interview session through UrBridgeAI.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 18px 0;">
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Student</td><td style="padding: 8px; border: 1px solid #e2e8f0;">${escapeHtml(details.userName)}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Email</td><td style="padding: 8px; border: 1px solid #e2e8f0;">${escapeHtml(details.userEmail)}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Mobile</td><td style="padding: 8px; border: 1px solid #e2e8f0;">${escapeHtml(details.userPhone || 'Not provided')}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Interview type</td><td style="padding: 8px; border: 1px solid #e2e8f0;">${escapeHtml(details.interviewType)}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Experience level</td><td style="padding: 8px; border: 1px solid #e2e8f0;">${escapeHtml(details.experienceLevel)}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Date</td><td style="padding: 8px; border: 1px solid #e2e8f0;">${escapeHtml(details.readableDate || details.date)}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Time</td><td style="padding: 8px; border: 1px solid #e2e8f0;">${escapeHtml(details.timeSlot)} IST</td></tr>
      </table>
      <p><strong>Google Meet link:</strong> <a href="${escapeHtml(details.meetLink)}">${escapeHtml(details.meetLink)}</a></p>
      <p><strong>Meeting code:</strong> ${escapeHtml(details.meetingCode)}</p>
      <p style="color: #64748b;">The student's resume PDF is attached to this email.</p>
    </div>
  `;

  const studentHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; color: #0f172a;">
      <h2 style="color: #0d1b3e;">Your Real Interview Session is Confirmed</h2>
      <p>Hello ${escapeHtml(details.userName)},</p>
      <p>Your ${escapeHtml(details.interviewType)} interview session is booked.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 18px 0;">
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Mobile</td><td style="padding: 8px; border: 1px solid #e2e8f0;">${escapeHtml(details.userPhone || 'Not provided')}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Experience level</td><td style="padding: 8px; border: 1px solid #e2e8f0;">${escapeHtml(details.experienceLevel)}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Date</td><td style="padding: 8px; border: 1px solid #e2e8f0;">${escapeHtml(details.readableDate || details.date)}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Time</td><td style="padding: 8px; border: 1px solid #e2e8f0;">${escapeHtml(details.timeSlot)} IST</td></tr>
      </table>
      <p><a href="${escapeHtml(details.meetLink)}" style="background: #1455d9; color: white; padding: 12px 18px; text-decoration: none; border-radius: 8px; display: inline-block;">Join Google Meet</a></p>
      <p><strong>Direct Google Meet link:</strong> <a href="${escapeHtml(details.meetLink)}">${escapeHtml(details.meetLink)}</a></p>
      <p><strong>Meeting code:</strong> ${escapeHtml(details.meetingCode)}</p>
    </div>
  `;

  const [studentResult, interviewerResult] = await Promise.allSettled([
    transporter.sendMail({
      from: config.from,
      to: details.userEmail,
      subject: 'Your UrBridgeAI Real Interview Session is Confirmed',
      html: studentHtml,
    }),
    transporter.sendMail({
      from: config.from,
      to: interviewerRecipients.join(', '),
      subject: 'New UrBridgeAI Real Interview Booking',
      html: interviewerHtml,
      attachments,
    }),
  ]);

  const errors = [];
  if (studentResult.status === 'rejected') {
    errors.push(`Student email failed: ${studentResult.reason?.message || studentResult.reason}`);
  } else {
    try {
      assertMailAccepted('Student confirmation', details.userEmail, studentResult.value);
    } catch (error) {
      errors.push(error.message);
    }
  }
  if (interviewerResult.status === 'rejected') {
    errors.push(`Interviewer email failed: ${interviewerResult.reason?.message || interviewerResult.reason}`);
  } else {
    for (const recipient of interviewerRecipients) {
      try {
        assertMailAccepted('Interviewer notification', recipient, interviewerResult.value);
      } catch (error) {
        errors.push(error.message);
      }
    }
  }
  if (errors.length > 0) {
    throw new Error(errors.join(' '));
  }

  return { studentInfo: studentResult.value, interviewerInfo: interviewerResult.value };
}

export async function sendOtpEmail(toEmail, otp) {
  const config = assertEmailConfig();
  const transporter = createTransporter(config);

  const otpMail = {
    from: config.from,
    to: toEmail,
    subject: 'Verify your UrBridge account',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 32px; color: #1e293b; background-color: #f8fafc; border-radius: 16px; border: 1px solid #e2e8f0;">
        <h2 style="color: #0d1b3e; font-size: 24px; font-weight: 750; margin-bottom: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px;">Verify your email</h2>
        <p style="font-size: 16px; line-height: 1.5; color: #334155;">Use the following verification code to complete your UrBridge account setup:</p>
        <div style="margin: 28px 0; text-align: center;">
          <span style="font-family: monospace; font-size: 38px; font-weight: 750; letter-spacing: 6px; color: #0d1b3e; background: #e2e8f0; padding: 12px 28px; border-radius: 8px; display: inline-block; border: 1px solid #cbd5e1;">${otp}</span>
        </div>
        <p style="font-size: 15px; line-height: 1.5; color: #475569;">This code will expire in 5 minutes.</p>
        <p style="font-size: 13px; line-height: 1.5; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 24px;">If you didn't request this code, you can safely ignore this email.</p>
        <p style="font-size: 14px; font-weight: 700; color: #0d1b3e; margin-top: 8px;">UrBridge</p>
      </div>
    `,
  };

  const info = await transporter.sendMail(otpMail);
  assertMailAccepted('OTP verification', toEmail, info);
  return info;
}





