import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { pool } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { asyncRoute } from '../utils/async.js';
import { validateRegistrationNumber } from '../config/registrationPolicy.js';
import { createPasswordResetToken, hashPasswordResetToken, isPasswordResetTokenFormat, PASSWORD_RESET_TTL_MINUTES } from '../security/passwordResetTokens.js';
import { isPasswordResetEmailConfigured, passwordResetEmailConfigStatus, queuePasswordResetEmail } from '../services/passwordResetEmail.js';

const router = Router();
const registerSchema = z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().email().max(254), password: z.string().min(10).max(128), registrationNumber: z.string().trim().min(3).max(60) });
const passwordResetRequestSchema = z.object({ email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()) }).strict();
const passwordResetSchema = z.object({ token: z.string().min(1).max(128), password: z.string().min(10).max(128) }).strict();
const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(128),
  expectedRole: z.enum(['student','placement_officer','recruiter']).optional(),
});
const passwordResetRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset requests. Please try again later.' },
});
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset attempts. Please try again later.' },
});
const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 8 * 60 * 60 * 1000 });

function issueSession(res, user) {
  const token = jwt.sign({ sub: user.user_id, sv: Number.isInteger(user.session_version) ? user.session_version : 0 }, process.env.JWT_SECRET, { expiresIn: '8h', issuer: 'scem-placement-api', audience: 'scem-placement-portal' });
  res.cookie('session', token, cookieOptions());
  return { user: { id: user.user_id, name: user.name, email: user.email, role: user.role } };
}

const passwordResetRequestMessage = 'If an account matches this email address, password reset instructions may arrive shortly if email delivery is available.';
const invalidPasswordResetMessage = 'This password reset link is invalid or has expired. Request a new link.';

router.post('/password-reset/request', passwordResetRequestLimiter, asyncRoute(async (req, res) => {
  const parsed = passwordResetRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid email address.' });

  if (!isPasswordResetEmailConfigured()) {
    const config = passwordResetEmailConfigStatus();
    console.warn('Password recovery email is not configured.', { missingFields: config.missingFields, invalidFields: config.invalidFields });
    return res.status(202).json({ message: passwordResetRequestMessage });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: accounts } = await client.query(
      `SELECT user_id, email FROM users
       WHERE lower(btrim(email))=$1 AND is_active=TRUE
       ORDER BY user_id LIMIT 2 FOR UPDATE`,
      [parsed.data.email],
    );

    // Email is the sole recovery identifier. If legacy data is ambiguous, do not guess.
    if (accounts.length !== 1) {
      await client.query('COMMIT');
      return res.status(202).json({ message: passwordResetRequestMessage });
    }

    const account = accounts[0];
    const { rows: counts } = await client.query(
      `SELECT count(*)::int AS request_count FROM password_reset_tokens
       WHERE user_id=$1 AND created_at > now() - interval '1 hour'`,
      [account.user_id],
    );
    if (counts[0].request_count >= 3) {
      await client.query('COMMIT');
      return res.status(202).json({ message: passwordResetRequestMessage });
    }

    await client.query(
      `UPDATE password_reset_tokens SET invalidated_at=now()
       WHERE user_id=$1 AND used_at IS NULL AND invalidated_at IS NULL`,
      [account.user_id],
    );
    const token = createPasswordResetToken();
    const tokenHash = hashPasswordResetToken(token);
    const { rows: inserted } = await client.query(
      `INSERT INTO password_reset_tokens(user_id, token_hash, expires_at)
       VALUES($1, $2, now() + ($3::int * interval '1 minute'))
       RETURNING reset_token_id`,
      [account.user_id, tokenHash, PASSWORD_RESET_TTL_MINUTES],
    );
    await client.query('COMMIT');

    const resetTokenId = inserted[0].reset_token_id;
    queuePasswordResetEmail({
      to: account.email,
      token,
      onFailure: () => pool.query(
        `UPDATE password_reset_tokens SET invalidated_at=now()
         WHERE reset_token_id=$1 AND used_at IS NULL AND invalidated_at IS NULL`,
        [resetTokenId],
      ),
    });
    // The generic response is returned before the asynchronous SMTP result is known.
    return res.status(202).json({ message: passwordResetRequestMessage });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* The connection may already have rolled back. */ }
    throw error;
  } finally {
    client.release();
  }
}));

router.post('/password-reset/confirm', passwordResetLimiter, asyncRoute(async (req, res) => {
  const parsed = passwordResetSchema.safeParse(req.body);
  if (!parsed.success) {
    const passwordIssue = parsed.error.issues.find((issue) => issue.path[0] === 'password');
    return res.status(400).json({ error: passwordIssue?.message || invalidPasswordResetMessage });
  }
  if (!isPasswordResetTokenFormat(parsed.data.token)) return res.status(400).json({ error: invalidPasswordResetMessage });

  const tokenHash = hashPasswordResetToken(parsed.data.token);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT reset_token_id,user_id FROM password_reset_tokens
       WHERE token_hash=$1 AND expires_at>now() AND used_at IS NULL AND invalidated_at IS NULL
       FOR UPDATE`,
      [tokenHash],
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: invalidPasswordResetMessage });
    }

    const resetToken = rows[0];
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const changed = await client.query(
      `UPDATE users SET password_hash=$1, session_version=session_version+1, updated_at=now()
       WHERE user_id=$2 AND is_active=TRUE`,
      [passwordHash, resetToken.user_id],
    );
    if (changed.rowCount !== 1) {
      await client.query(
        'UPDATE password_reset_tokens SET invalidated_at=now() WHERE reset_token_id=$1',
        [resetToken.reset_token_id],
      );
      await client.query('COMMIT');
      return res.status(400).json({ error: invalidPasswordResetMessage });
    }

    const consumed = await client.query(
      `UPDATE password_reset_tokens SET used_at=now()
       WHERE reset_token_id=$1 AND used_at IS NULL AND invalidated_at IS NULL`,
      [resetToken.reset_token_id],
    );
    if (consumed.rowCount !== 1) throw new Error('Password reset token could not be consumed atomically.');
    await client.query(
      `UPDATE password_reset_tokens SET invalidated_at=now()
       WHERE user_id=$1 AND reset_token_id<>$2 AND used_at IS NULL AND invalidated_at IS NULL`,
      [resetToken.user_id, resetToken.reset_token_id],
    );
    await client.query('COMMIT');
    return res.json({ message: 'Your password has been reset. You can now sign in with your new password.' });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* The connection may already have rolled back. */ }
    throw error;
  } finally {
    client.release();
  }
}));

router.post('/register', asyncRoute(async (req,res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const input = parsed.data;
  const registration = validateRegistrationNumber(input.registrationNumber);
  if (!registration.valid) return res.status(400).json({ error: registration.error });
  if (registration.mappingStatus === 'unresolved') return res.status(400).json({ error: registration.mappingError });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`SELECT s.student_id,s.full_name,s.contact_email,s.user_id,b.branch_code
      FROM students s JOIN branches b USING(branch_id)
      WHERE upper(btrim(s.registration_number))=$1 FOR UPDATE OF s`, [registration.normalized]);
    const student = rows[0];
    if (!student || student.user_id || student.full_name.trim().toLowerCase() !== input.name.trim().toLowerCase() || student.contact_email?.toLowerCase() !== input.email.toLowerCase()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'We could not match that name, registration number, and imported email. Ask the Placement Cell to verify your roster record.' });
    }
    if (registration.branchCode && student.branch_code !== registration.branchCode) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'The roster branch does not match this registration department code. Ask the Placement Cell to correct the roster mapping.' });
    }
    const passwordHash = await bcrypt.hash(input.password, 12);
    const result = await client.query("INSERT INTO users(name,email,password_hash,role) VALUES($1,lower($2),$3,'student') RETURNING user_id,name,email,role,session_version", [input.name.trim(),input.email,passwordHash]);
    await client.query('UPDATE students SET user_id=$1,updated_at=now() WHERE student_id=$2', [result.rows[0].user_id,student.student_id]);
    await client.query('COMMIT');
    return res.status(201).json(issueSession(res,result.rows[0]));
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') return res.status(409).json({ error: 'An account with that email is already registered.' });
    throw error;
  } finally { client.release(); }
}));

router.post('/login', asyncRoute(async (req,res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid email and password.' });
  const { rows } = await pool.query('SELECT user_id,name,email,password_hash,role,is_active,session_version FROM users WHERE email=lower($1)', [parsed.data.email]);
  const user = rows[0];
  if (!user?.is_active || !(await bcrypt.compare(parsed.data.password,user.password_hash))) return res.status(401).json({ error: 'Email or password is incorrect.' });
  if (parsed.data.expectedRole && user.role !== parsed.data.expectedRole) {
    const roleName = { student:'Student', placement_officer:'Placement Officer / TPO', recruiter:'Recruiter' }[user.role] || 'another';
    return res.status(403).json({ error: `This account is registered as ${roleName}. Choose that role to sign in.` });
  }
  return res.json(issueSession(res,user));
}));

router.post('/logout', (req,res) => { res.clearCookie('session', { httpOnly:true, secure:process.env.NODE_ENV==='production', sameSite:'lax', path:'/' }); res.status(204).end(); });
router.get('/me', authenticate, (req,res) => res.json({ user: { id:req.user.user_id, name:req.user.name, email:req.user.email, role:req.user.role } }));
export default router;
