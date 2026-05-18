import nodemailer from 'nodemailer';

const requiredEnvVars = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];

function getMissingVars() {
  return requiredEnvVars.filter((v) => !process.env[v]);
}

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export const sendResetPasswordEmail = async (to, resetLink) => {
  const missingVars = getMissingVars();
  if (missingVars.length > 0) {
    throw new Error(
      `SMTP not configured. Missing: ${missingVars.join(', ')}`
    );
  }

  const mailOptions = {
    from: process.env.EMAIL_FROM || 'UrBridge.ai <noreply@urbridge.ai>',
    to,
    subject: 'Reset Your UrBridge.ai Password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0f52ba;">UrBridge.ai Password Reset</h2>
        <p>Hello,</p>
        <p>You requested a password reset for your UrBridge.ai account. Click the link below to reset your password:</p>
        <div style="margin: 24px 0;">
          <a href="${resetLink}" 
             style="background: #0f52ba; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p>Or copy and paste this URL into your browser:</p>
        <p style="word-break: break-all; color: #555;">${resetLink}</p>
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

