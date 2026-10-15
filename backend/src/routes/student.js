import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { pool } from '../config/db.js';
import { requireStudent, authenticate, allowRoles } from '../middleware/auth.js';
import { asyncRoute } from '../utils/async.js';

const router = Router();
const upload = multer({ storage:multer.memoryStorage(), limits:{fileSize:2*1024*1024,files:1}, fileFilter:(req,file,cb) => cb(null, /\.txt$/i.test(file.originalname) && file.mimetype === 'text/plain') });
const profileSchema = z.object({ phone:z.string().trim().max(30).nullable().optional(), resumeText:z.string().max(30000).optional() });

router.get('/me', ...requireStudent, asyncRoute(async (req,res) => {
  const { rows } = await pool.query(`SELECT s.student_id,s.registration_number,s.full_name,s.cgpa,s.active_backlogs,s.graduation_year,s.phone,s.resume_text,b.branch_id,b.branch_code,b.branch_name
    FROM students s JOIN branches b USING(branch_id) WHERE s.user_id=$1`, [req.user.user_id]);
  if (!rows[0]) return res.status(404).json({ error:'Your account is not linked to a student roster record.' });
  const { resume_text, ...student } = rows[0];
  return res.json({ student:{...student, resumeText:resume_text || ''} });
}));

router.put('/me', ...requireStudent, asyncRoute(async (req,res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error:parsed.error.issues[0].message });
  const { rows } = await pool.query('UPDATE students SET phone=COALESCE($1,phone),resume_text=COALESCE($2,resume_text),updated_at=now() WHERE user_id=$3 RETURNING student_id,phone,resume_text', [parsed.data.phone ?? null,parsed.data.resumeText ?? null,req.user.user_id]);
  if (!rows[0]) return res.status(404).json({ error:'Student profile not found.' });
  return res.json({ profile:{ phone:rows[0].phone,resumeText:rows[0].resume_text || '' } });
}));

router.post('/me/resume', ...requireStudent, upload.single('file'), asyncRoute(async (req,res) => {
  const text = req.file ? req.file.buffer.toString('utf8') : req.body.text;
  if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error:'Provide resume text or a plain text (.txt) file.' });
  if (text.length > 30000) return res.status(400).json({ error:'Resume text is limited to 30,000 characters.' });
  await pool.query('UPDATE students SET resume_text=$1,updated_at=now() WHERE user_id=$2', [text.trim(),req.user.user_id]);
  return res.json({ message:'Resume text saved.', characterCount:text.trim().length });
}));

router.get('/me/academics', ...requireStudent, asyncRoute(async (req,res) => {
  const { rows } = await pool.query('SELECT a.record_id,a.semester,a.sgpa,a.backlogs FROM academic_records a JOIN students s USING(student_id) WHERE s.user_id=$1 ORDER BY a.semester', [req.user.user_id]);
  return res.json({ records:rows });
}));

router.get('/me/applications', ...requireStudent, asyncRoute(async (req,res) => {
  const { rows } = await pool.query(`SELECT a.application_id,a.applied_at,a.status,a.eligibility_snapshot,d.drive_id,d.role,d.application_deadline,c.company_name,
    o.package_lpa,o.status AS offer_status,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('roundName',r.round_name,'date',r.interview_date,'result',r.result,'feedback',r.feedback) ORDER BY r.interview_date) FROM interview_rounds r WHERE r.application_id=a.application_id),'[]'::jsonb) AS rounds
    FROM applications a JOIN students s USING(student_id) JOIN job_drives d USING(drive_id) JOIN companies c USING(company_id) LEFT JOIN offers o USING(application_id)
    WHERE s.user_id=$1 ORDER BY a.applied_at DESC`, [req.user.user_id]);
  return res.json({ applications:rows });
}));

router.post('/claim-record', authenticate, allowRoles('student'), asyncRoute(async (req,res) => {
  const parsed = z.object({ registrationNumber:z.string().trim(), name:z.string().trim().min(2), email:z.string().trim().email() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error:'Provide your roster name, registration number, and imported contact email.' });
  const { rows } = await pool.query(`UPDATE students SET user_id=$1,updated_at=now() WHERE upper(registration_number)=upper($2) AND lower(full_name)=lower($3) AND lower(contact_email)=lower($4) AND user_id IS NULL RETURNING student_id`, [req.user.user_id,parsed.data.registrationNumber,parsed.data.name,parsed.data.email]);
  if (!rows[0]) return res.status(409).json({ error:'The record could not be claimed. It may be linked already or the supplied details do not match the imported roster.' });
  return res.json({ message:'Your roster record is linked.' });
}));

export default router;
