import 'dotenv/config';
import { passwordResetEmailConfigStatus, verifyMailtrapConnection } from '../src/services/passwordResetEmail.js';

const status = passwordResetEmailConfigStatus();
if (!status.configured) {
  const fields = [...status.missingFields, ...status.invalidFields];
  console.error(`Mailtrap configuration is incomplete or invalid. Check these fields in backend/.env: ${fields.join(', ') || 'SMTP settings'}.`);
  process.exitCode = 1;
} else {
  try {
    await verifyMailtrapConnection();
    console.log('Mailtrap Email Sandbox SMTP connection verified. No email was sent.');
  } catch (error) {
    const code = typeof error?.code === 'string' && /^[A-Z0-9_-]{1,40}$/i.test(error.code) ? error.code : 'SMTP_ERROR';
    console.error(`Mailtrap SMTP connection failed (${code}). Check the sandbox host, port, username, password, and network access in backend/.env.`);
    process.exitCode = 1;
  }
}
