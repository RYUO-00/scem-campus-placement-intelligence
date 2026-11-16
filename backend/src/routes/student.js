import { Router } from 'express';
import multer from 'multer';
import { extname } from 'node:path';
import { z } from 'zod';
import { pool } from '../config/db.js';
import { requireStudent, authenticate, allowRoles } from '../middleware/auth.js';
import { asyncRoute } from '../utils/async.js';
import { extractResumeText, MAX_RESUME_FILE_BYTES, MAX_RESUME_TEXT_CHARACTERS, resumeUploadError, validateResumeUpload } from '../services/resume.js';
import { validateRegistrationNumber } from '../config/registrationPolicy.js';

const router = Router();
const upload = multer({
  storage:multer.memoryStorage(),
  limits:{fileSize:MAX_RESUME_FILE_BYTES,files:1},
  fileFilter:(req,file,cb) => {
    try { validateResumeUpload(file); cb(null,true); }
    catch (error) { cb(error); }
  },
});
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
  let text;
  if (req.file) {
    const extension = extname(req.file.originalname).toLowerCase();
    text = await extractResumeText(req.file.buffer,extension);
  } else if (typeof req.body.text === 'string') {
    text = req.body.text.trim();
  } else {
    throw resumeUploadError(400, 'Choose a TXT, PDF, or DOCX resume file, or provide resume text.');
  }
  if (!text) throw resumeUploadError(422, 'Resume text cannot be empty. Add text or choose a non-empty document.');
  if (text.length > MAX_RESUME_TEXT_CHARACTERS) {
    throw resumeUploadError(413, `Resume text is limited to ${MAX_RESUME_TEXT_CHARACTERS.toLocaleString()} characters.`);
  }
  const { rows } = await pool.query('UPDATE students SET resume_text=$1,updated_at=now() WHERE user_id=$2 RETURNING resume_text', [text,req.user.user_id]);
  if (!rows[0]) return res.status(404).json({ error:'Student profile not found.' });
  return res.json({ message:'Resume text saved.', characterCount:text.length, resumeText:rows[0].resume_text });
}));

router.get('/me/academics', ...requireStudent, asyncRoute(async (req,res) => {
  const { rows } = await pool.query('SELECT a.record_id,a.semester,a.sgpa,a.backlogs FROM academic_records a JOIN students s USING(student_id) WHERE s.user_id=$1 ORDER BY a.semester', [req.user.user_id]);
  return res.json({ records:rows });
}));

router.get('/me/applications', ...requireStudent, asyncRoute(async (req,res) => {
  const { rows } = await pool.query(`SELECT a.application_id,a.applied_at,a.status,a.eligibility_snapshot,d.drive_id,d.role,d.application_deadline,c.company_name,
    o.package_lpa,o.status AS offer_status,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('roundId',r.round_id,'roundName',r.round_name,'date',r.interview_date,'result',r.result,'feedback',r.feedback) ORDER BY r.created_at,r.round_id) FROM interview_rounds r WHERE r.application_id=a.application_id),'[]'::jsonb) AS rounds
    FROM applications a JOIN students s USING(student_id) JOIN job_drives d USING(drive_id) JOIN companies c USING(company_id) LEFT JOIN offers o USING(application_id)
    WHERE s.user_id=$1 ORDER BY a.applied_at DESC`, [req.user.user_id]);
  return res.json({ applications:rows });
}));

router.patch('/me/offers/:applicationId', ...requireStudent, asyncRoute(async (req,res) => {
  if (!z.string().uuid().safeParse(req.params.applicationId).success) return res.status(400).json({ error:'A valid application ID is required.' });
  const parsed = z.object({ status:z.enum(['accepted','declined']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error:'Choose accepted or declined for a pending offer.' });
  const { rows } = await pool.query(`UPDATE offers AS o SET status=$1,updated_at=now()
    FROM applications AS a,students AS s
    WHERE o.application_id=a.application_id AND a.student_id=s.student_id
      AND s.user_id=$2 AND a.application_id=$3 AND o.status='pending'
    RETURNING o.offer_id,o.application_id,o.status,o.offer_date,o.package_lpa`,
    [parsed.data.status,req.user.user_id,req.params.applicationId]);
  if (!rows[0]) return res.status(404).json({ error:'A pending offer was not found for your account.' });
  return res.json({ offer:rows[0] });
}));

router.post('/claim-record', authenticate, allowRoles('student'), asyncRoute(async (req,res) => {
  const parsed = z.object({ registrationNumber:z.string().trim(), name:z.string().trim().min(2), email:z.string().trim().email() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error:'Provide your roster name, registration number, and imported contact email.' });
  const registration = validateRegistrationNumber(parsed.data.registrationNumber);
  if (!registration.valid) return res.status(400).json({ error:registration.error });
  if (registration.mappingStatus === 'unresolved') return res.status(400).json({ error:registration.mappingError });
  const { rows } = await pool.query(`UPDATE students AS s SET user_id=$1,updated_at=now()
    WHERE upper(btrim(s.registration_number))=$2 AND lower(s.full_name)=lower($3)
      AND lower(s.contact_email)=lower($4) AND s.user_id IS NULL
      AND ($5::text IS NULL OR EXISTS (SELECT 1 FROM branches b WHERE b.branch_id=s.branch_id AND b.branch_code=$5))
    RETURNING s.student_id`, [req.user.user_id,registration.normalized,parsed.data.name,parsed.data.email,registration.branchCode]);
  if (!rows[0]) return res.status(409).json({ error:'The record could not be claimed. It may be linked already or the supplied details do not match the imported roster.' });
  return res.json({ message:'Your roster record is linked.' });
}));

export default router;
