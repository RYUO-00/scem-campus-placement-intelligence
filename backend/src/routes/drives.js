import { Router } from 'express';
import { pool } from '../config/db.js';
import { requireStudent, authenticate, allowRoles } from '../middleware/auth.js';
import { asyncRoute, requireUuid } from '../utils/async.js';
import { evaluateEligibility } from '../services/eligibility.js';

const router = Router();
async function studentRecord(userId) {
  const result = await pool.query('SELECT s.student_id,s.branch_id,s.cgpa,s.active_backlogs,b.is_active AS branch_is_active FROM students s JOIN branches b USING(branch_id) WHERE s.user_id=$1',[userId]);
  return result.rows[0];
}
async function branchIds(driveId) { return (await pool.query('SELECT branch_id FROM drive_allowed_branches WHERE drive_id=$1',[driveId])).rows.map((r)=>r.branch_id); }

router.get('/', authenticate, asyncRoute(async (req,res) => {
  let sql = `SELECT d.drive_id,d.role,d.job_description,d.minimum_cgpa,d.maximum_backlogs,d.application_deadline,d.package_lpa,d.location,d.status,c.company_name,
    COALESCE(jsonb_agg(DISTINCT jsonb_build_object('code',b.branch_code,'name',b.branch_name)) FILTER(WHERE b.branch_id IS NOT NULL),'[]'::jsonb) AS branches
    FROM job_drives d JOIN companies c USING(company_id) LEFT JOIN drive_allowed_branches ab USING(drive_id) LEFT JOIN branches b USING(branch_id)`;
  const args=[];
  if (req.user.role === 'student') sql += " WHERE d.status='published'";
  else if (req.user.role === 'recruiter') {
    const { rows } = await pool.query('SELECT company_id FROM recruiters WHERE user_id=$1',[req.user.user_id]);
    if (!rows[0]) return res.status(403).json({error:'Recruiter company access is not configured.'});
    sql += ' WHERE d.company_id=$1'; args.push(rows[0].company_id);
  }
  sql += ' GROUP BY d.drive_id,c.company_id ORDER BY d.application_deadline ASC';
  const { rows } = await pool.query(sql,args);
  return res.json({ drives:rows });
}));

router.get('/:id', authenticate, asyncRoute(async (req,res) => {
  if (!requireUuid(req.params.id,res)) return;
  const { rows } = await pool.query(`SELECT d.*,c.company_name,c.industry FROM job_drives d JOIN companies c USING(company_id) WHERE d.drive_id=$1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({error:'Drive not found.'});
  const drive=rows[0];
  if (req.user.role==='student' && drive.status!=='published') return res.status(404).json({error:'Drive not found.'});
  if (req.user.role==='recruiter') {
    const own=await pool.query('SELECT 1 FROM recruiters WHERE user_id=$1 AND company_id=$2',[req.user.user_id,drive.company_id]);
    if (!own.rowCount) return res.status(404).json({error:'Drive not found.'});
  }
  drive.allowedBranches=await pool.query('SELECT b.branch_code,b.branch_name FROM drive_allowed_branches a JOIN branches b USING(branch_id) WHERE a.drive_id=$1',[drive.drive_id]).then(r=>r.rows);
  return res.json({drive});
}));

router.get('/:id/eligibility', ...requireStudent, asyncRoute(async (req,res) => {
  if (!requireUuid(req.params.id,res)) return;
  const student=await studentRecord(req.user.user_id);
  if (!student) return res.status(404).json({error:'Student roster record not found.'});
  const { rows }=await pool.query('SELECT drive_id,minimum_cgpa,maximum_backlogs,application_deadline,status FROM job_drives WHERE drive_id=$1',[req.params.id]);
  if (!rows[0]) return res.status(404).json({error:'Drive not found.'});
  return res.json({eligibility:evaluateEligibility(student,rows[0],await branchIds(req.params.id))});
}));

router.post('/:id/applications', ...requireStudent, asyncRoute(async (req,res) => {
  if (!requireUuid(req.params.id,res)) return;
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const sr=await client.query('SELECT student_id,branch_id,cgpa,active_backlogs FROM students WHERE user_id=$1 FOR UPDATE',[req.user.user_id]);
    const dr=await client.query('SELECT drive_id,minimum_cgpa,maximum_backlogs,application_deadline,status FROM job_drives WHERE drive_id=$1 FOR UPDATE',[req.params.id]);
    if (!sr.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({error:'Student roster record not found.'}); }
    if (!dr.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({error:'Drive not found.'}); }
    const allowed=(await client.query('SELECT branch_id FROM drive_allowed_branches WHERE drive_id=$1',[req.params.id])).rows.map(r=>r.branch_id);
    const evaluation=evaluateEligibility(sr.rows[0],dr.rows[0],allowed);
    if (!evaluation.eligible) { await client.query('ROLLBACK'); return res.status(422).json({error:'You are not eligible to apply for this drive.',eligibility:evaluation}); }
    const inserted=await client.query("INSERT INTO applications(student_id,drive_id,status,eligibility_snapshot) VALUES($1,$2,'applied',$3) ON CONFLICT(student_id,drive_id) DO NOTHING RETURNING application_id",[sr.rows[0].student_id,req.params.id,evaluation]);
    if (!inserted.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({error:'You have already applied to this drive.'}); }
    await client.query('COMMIT');
    return res.status(201).json({applicationId:inserted.rows[0].application_id,status:'applied',eligibility:evaluation});
  } catch(error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}));

export default router;
