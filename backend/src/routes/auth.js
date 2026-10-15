import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { pool } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { asyncRoute } from '../utils/async.js';

const router = Router();
const registerSchema = z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().email().max(254), password: z.string().min(10).max(128), registrationNumber: z.string().trim().min(3).max(60) });
const loginSchema = z.object({ email: z.string().trim().email(), password: z.string().min(1).max(128) });
const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 8 * 60 * 60 * 1000 });

function issueSession(res, user) {
  const token = jwt.sign({ sub: user.user_id }, process.env.JWT_SECRET, { expiresIn: '8h', issuer: 'scem-placement-api', audience: 'scem-placement-portal' });
  res.cookie('session', token, cookieOptions());
  return { user: { id: user.user_id, name: user.name, email: user.email, role: user.role } };
}

router.post('/register', asyncRoute(async (req,res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const input = parsed.data;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT student_id,full_name,contact_email,user_id FROM students WHERE upper(registration_number)=upper($1) FOR UPDATE', [input.registrationNumber]);
    const student = rows[0];
    if (!student || student.user_id || student.full_name.trim().toLowerCase() !== input.name.trim().toLowerCase() || student.contact_email?.toLowerCase() !== input.email.toLowerCase()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'We could not match that name, registration number, and imported email. Ask the Placement Cell to verify your roster record.' });
    }
    const passwordHash = await bcrypt.hash(input.password, 12);
    const result = await client.query("INSERT INTO users(name,email,password_hash,role) VALUES($1,lower($2),$3,'student') RETURNING user_id,name,email,role", [input.name.trim(),input.email,passwordHash]);
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
  const { rows } = await pool.query('SELECT user_id,name,email,password_hash,role,is_active FROM users WHERE email=lower($1)', [parsed.data.email]);
  const user = rows[0];
  if (!user?.is_active || !(await bcrypt.compare(parsed.data.password,user.password_hash))) return res.status(401).json({ error: 'Email or password is incorrect.' });
  return res.json(issueSession(res,user));
}));

router.post('/logout', (req,res) => { res.clearCookie('session', { httpOnly:true, secure:process.env.NODE_ENV==='production', sameSite:'lax', path:'/' }); res.status(204).end(); });
router.get('/me', authenticate, (req,res) => res.json({ user: { id:req.user.user_id, name:req.user.name, email:req.user.email, role:req.user.role } }));
export default router;
