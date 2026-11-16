import test from 'node:test';
import assert from 'node:assert/strict';
import { createPasswordResetEmailSender, passwordResetEmailConfigStatus } from '../src/services/passwordResetEmail.js';

const env = {
  MAILTRAP_HOST: 'sandbox.smtp.mailtrap.io',
  MAILTRAP_PORT: '2525',
  MAILTRAP_USER: 'sandbox-user-placeholder',
  MAILTRAP_PASS: 'sandbox-pass-placeholder',
  MAIL_FROM: 'Campus Placement <no-reply@example.test>',
  FRONTEND_URL: 'http://localhost:5173',
};

test('Mailtrap sender creates the real reset URL and a clear, time-limited sandbox message', async () => {
  let transportOptions;
  let message;
  const sender = createPasswordResetEmailSender({
    env,
    createTransport(options) {
      transportOptions = options;
      return { sendMail: async (mail) => { message = mail; return { messageId: 'test-message' }; } };
    },
  });

  await sender({ to: 'student@example.test', token: 'a'.repeat(43) });

  assert.equal(transportOptions.host, env.MAILTRAP_HOST);
  assert.equal(transportOptions.port, 2525);
  assert.equal(transportOptions.secure, false);
  assert.equal(transportOptions.auth.user, env.MAILTRAP_USER);
  assert.equal(transportOptions.auth.pass, env.MAILTRAP_PASS);
  assert.equal(message.from, env.MAIL_FROM);
  assert.equal(message.to, 'student@example.test');
  assert.match(message.subject, /reset.*password/i);
  assert.match(message.text, /http:\/\/localhost:5173\/reset-password\?token=a{43}/);
  assert.match(message.html, /expires in 30 minutes/i);
  assert.match(message.text, /ignore this email/i);
});

test('configuration diagnostics list only absent or invalid field names', () => {
  const status = passwordResetEmailConfigStatus({ MAILTRAP_PASS: 'do-not-return-this-value' });
  assert.equal(status.configured, false);
  assert.ok(status.missingFields.includes('MAILTRAP_HOST'));
  assert.ok(status.missingFields.includes('FRONTEND_URL'));
  assert.equal(JSON.stringify(status).includes('do-not-return-this-value'), false);
});
