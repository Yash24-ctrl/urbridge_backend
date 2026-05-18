import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

// Import AFTER dotenv.config so process.env is populated
const { verifyEmailConfig, sendResetPasswordEmail } = await import('./utils/emailService.js');

const requiredVars = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];

console.log('=== Email Configuration Test ===\n');

console.log('Checking required environment variables...');
for (const v of requiredVars) {
  const val = process.env[v];
  console.log(`  ${v}: ${val ? 'SET (' + (v === 'SMTP_PASS' ? '***hidden***' : val) + ')' : 'MISSING'}`);
}

console.log('\nVerifying email transporter...');
const ready = await verifyEmailConfig();

if (!ready) {
  console.error('\n Email service is NOT ready. Check your .env configuration.');
  process.exit(1);
}

console.log('\n Email service is ready.');

// Attempt to send a test reset email
const testEmail = process.argv[2];
if (testEmail) {
  console.log(`\nSending test reset email to: ${testEmail}`);
  try {
    const info = await sendResetPasswordEmail(testEmail, 'https://example.com/reset-password?token=test123');
    console.log('\n Test email sent successfully!');
    console.log('  Message ID:', info.messageId);
    console.log('  Accepted:', info.accepted);
    console.log('  Rejected:', info.rejected);
  } catch (err) {
    console.error('\n Failed to send test email:', err.message);
    process.exit(1);
  }
} else {
  console.log('\nTo test actual sending, run: node test-email.js <your-email@example.com>');
}

console.log('\n=== Test Complete ===');

