import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';

export async function authenticate(req, res, next) {
  const token = req.cookies?.session || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
  if (!token) return res.status(401).json({ error: 'Please sign in to continue.' });
  try {
    const claims = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await pool.query('SELECT user_id,name,email,role,is_active,session_version FROM users WHERE user_id=$1', [claims.sub]);
    const user = rows[0];
    if (!user?.is_active) return res.status(401).json({ error: 'This account is inactive.' });
    if ((claims.sv ?? 0) !== user.session_version) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    req.user = user;
    next();
  } catch { return res.status(401).json({ error: 'Your session has expired. Please sign in again.' }); }
}

export const allowRoles = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: 'You do not have permission to access this resource.' });
  next();
};

export const requireStudent = [authenticate, allowRoles('student')];
export const requireOfficer = [authenticate, allowRoles('placement_officer')];
export const requireRecruiter = [authenticate, allowRoles('recruiter')];
export const requireStaff = [authenticate, allowRoles('placement_officer','recruiter')];
