import nodemailer from 'nodemailer';

const REQUIRED_FIELDS = ['MAILTRAP_HOST', 'MAILTRAP_PORT', 'MAILTRAP_USER', 'MAILTRAP_PASS', 'MAIL_FROM', 'FRONTEND_URL'];
const pendingDeliveries = new Set();
let testSender = null;

function emailConfiguration(env) {
  const missingFields = REQUIRED_FIELDS.filter((key) => !String(env[key] || '').trim());
  if (missingFields.length) {
    const error = new Error('Password recovery email configuration is incomplete.');
    error.configFields = missingFields;
    throw error;
  }

  const port = Number(env.MAILTRAP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    const error = new Error('Password recovery email configuration is invalid.');
    error.configFields = ['MAILTRAP_PORT'];
    throw error;
  }

  let frontendUrl;
  try {
    frontendUrl = new URL(env.FRONTEND_URL);
  } catch {
    const error = new Error('Password recovery email configuration is invalid.');
    error.configFields = ['FRONTEND_URL'];
    throw error;
  }
  if (!['http:', 'https:'].includes(frontendUrl.protocol) || frontendUrl.username || frontendUrl.password) {
    const error = new Error('Password recovery email configuration is invalid.');
    error.configFields = ['FRONTEND_URL'];
    throw error;
  }

  return {
    host: String(env.MAILTRAP_HOST).trim(),
    port,
    user: String(env.MAILTRAP_USER),
    pass: String(env.MAILTRAP_PASS),
    from: String(env.MAIL_FROM).trim(),
    frontendUrl: frontendUrl.origin,
  };
}

export function passwordResetEmailConfigStatus(env = process.env) {
  try {
    emailConfiguration(env);
    return { configured: true, missingFields: [], invalidFields: [] };
  } catch (error) {
    const fields = Array.isArray(error.configFields) ? error.configFields : [];
    const missingFields = fields.filter((field) => !String(env[field] || '').trim());
    return { configured: false, missingFields, invalidFields: fields.filter((field) => !missingFields.includes(field)) };
  }
}

export function createPasswordResetEmailSender({ env = process.env, createTransport = nodemailer.createTransport } = {}) {
  return async ({ to, token }) => {
    const config = emailConfiguration(env);
    const resetUrl = new URL('/reset-password', config.frontendUrl);
    resetUrl.searchParams.set('token', token);
    const link = resetUrl.toString();
    const transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.user, pass: config.pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
    return transporter.sendMail({
      from: config.from,
      to,
      subject: 'Reset your campus placement account password',
      text: `We received a request to reset your campus placement account password.\n\nUse this link within ${30} minutes to choose a new password:\n${link}\n\nIf you did not request a reset, you can ignore this email.`,
      html: `<p>We received a request to reset your campus placement account password.</p><p><a href="${link}">Reset your password</a>. This link expires in 30 minutes.</p><p>If you did not request a reset, you can ignore this email.</p>`,
    });
  };
}

const sendWithSmtp = createPasswordResetEmailSender();

export function isPasswordResetEmailConfigured() {
  return Boolean(testSender) || passwordResetEmailConfigStatus().configured;
}

export function setPasswordResetEmailSenderForTests(sender) {
  if (process.env.NODE_ENV !== 'test' || typeof sender !== 'function') {
    throw new Error('A test email sender can only be installed by automated tests.');
  }
  const previous = testSender;
  testSender = sender;
  return () => { testSender = previous; };
}

export function queuePasswordResetEmail({ to, token, onFailure }) {
  const sender = testSender || sendWithSmtp;
  const delivery = Promise.resolve()
    .then(() => sender({ to, token }))
    .catch(async (error) => {
      try { await onFailure?.(); } catch { /* The token remains unusable if SMTP delivery failed. */ }
      const code = typeof error?.code === 'string' && /^[A-Z0-9_-]{1,40}$/i.test(error.code) ? error.code : 'SMTP_ERROR';
      console.error('Password reset email delivery failed.', { code });
    });
  pendingDeliveries.add(delivery);
  void delivery.finally(() => pendingDeliveries.delete(delivery));
  return delivery;
}

export async function waitForPasswordResetEmailJobsForTests() {
  if (process.env.NODE_ENV !== 'test') throw new Error('Email queue draining is test-only.');
  await Promise.all([...pendingDeliveries]);
}

export async function verifyMailtrapConnection() {
  const config = emailConfiguration(process.env);
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  return transporter.verify();
}
