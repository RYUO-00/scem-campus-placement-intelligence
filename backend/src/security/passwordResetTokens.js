import { createHash, randomBytes } from 'node:crypto';

export const PASSWORD_RESET_TTL_MINUTES = 30;

export function createPasswordResetToken() {
  return randomBytes(32).toString('base64url');
}

export function isPasswordResetTokenFormat(token) {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function hashPasswordResetToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
