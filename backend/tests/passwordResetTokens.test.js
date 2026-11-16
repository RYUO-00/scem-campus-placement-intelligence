import test from 'node:test';
import assert from 'node:assert/strict';
import { createPasswordResetToken, hashPasswordResetToken, isPasswordResetTokenFormat } from '../src/security/passwordResetTokens.js';

test('password reset tokens have 256 bits of URL-safe entropy and only their digest is persisted', () => {
  const token = createPasswordResetToken();
  const digest = hashPasswordResetToken(token);

  assert.equal(token.length, 43);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(digest.length, 64);
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.notEqual(digest, token);
  assert.equal(isPasswordResetTokenFormat(token), true);
  assert.equal(isPasswordResetTokenFormat('short-token'), false);
  assert.equal(isPasswordResetTokenFormat(`${token}x`), false);
});
