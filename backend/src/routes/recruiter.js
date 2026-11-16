import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../config/db.js';
import { requireRecruiter } from '../middleware/auth.js';
import { asyncRoute, requireUuid } from '../utils/async.js';
import { applicationTransitions } from '../services/eligibility.js';
import { saveInterviewRound } from '../services/interviewRounds.js';

const router=Router();router.use(...requireRecruiter);
async function companyId(userId){const result=await pool.query('SELECT company_id FROM recruiters WHERE user_id=$1',[userId]);return result.rows[0]?.company_id;}
router.get('/dashboard',asyncRoute(async(req,res)=>{
 const id=await companyId(req.user.user_id);if(!id)return res.status(403).json({error:'Recruiter company access is not configured.'});
 const [{rows:metrics},{rows:drives},{rows:statuses}]=await Promise.all([
  pool.query(`SELECT count(DISTINCT d.drive_id)::int drives,count(a.application_id)::int applicants,count(a.application_id) FILTER(WHERE a.status='shortlisted')::int shortlisted,count(o.offer_id)::int offers FROM job_drives d LEFT JOIN applications a USING(drive_id) LEFT JOIN offers o USING(application_id) WHERE d.company_id=$1`,[id]),
  pool.query(`SELECT d.drive_id,d.role,d.status,d.application_deadline,count(a.application_id)::int applicants FROM job_drives d LEFT JOIN applications a USING(drive_id) WHERE d.company_id=$1 GROUP BY d.drive_id ORDER BY d.created_at DESC`,[id]),
  pool.query(`SELECT a.status,count(*)::int count FROM applications a JOIN job_drives d USING(drive_id) WHERE d.company_id=$1 GROUP BY a.status ORDER BY a.status`,[id])
 ]);return res.json({metrics:metrics[0],drives,statuses});
}));
router.get('/drives',asyncRoute(async(req,res)=>{
 const id=await companyId(req.user.user_id);if(!id)return res.status(403).json({error:'Recruiter company access is not configured.'});
 const {rows}=await pool.query(`SELECT d.drive_id,d.role,d.status,d.application_deadline,d.package_lpa,c.company_name,count(a.application_id)::int applicants FROM job_drives d JOIN companies c USING(company_id) LEFT JOIN applications a USING(drive_id) WHERE d.company_id=$1 GROUP BY d.drive_id,c.company_name ORDER BY d.application_deadline`,[id]);return res.json({drives:rows});
}));
router.get('/drives/:id/applications',asyncRoute(async(req,res)=>{
 if(!requireUuid(req.params.id,res))return;const id=await companyId(req.user.user_id);if(!id)return res.status(403).json({error:'Recruiter company access is not configured.'});
 const {rows}=await pool.query(`SELECT a.application_id,a.status,a.applied_at,a.eligibility_snapshot,s.registration_number,s.full_name,s.cgpa,s.active_backlogs,b.branch_code,s.resume_text,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('roundId',r.round_id,'roundName',r.round_name,'date',r.interview_date,'result',r.result,'feedback',r.feedback,'createdAt',r.created_at) ORDER BY r.created_at,r.round_id) FROM interview_rounds r WHERE r.application_id=a.application_id),'[]'::jsonb) AS rounds
  FROM applications a JOIN job_drives d USING(drive_id) JOIN students s USING(student_id) JOIN branches b USING(branch_id) WHERE a.drive_id=$1 AND d.company_id=$2 ORDER BY a.applied_at DESC`,[req.params.id,id]);
 if(!rows.length){const exists=await pool.query('SELECT 1 FROM job_drives WHERE drive_id=$1 AND company_id=$2',[req.params.id,id]);if(!exists.rowCount)return res.status(404).json({error:'Drive not found.'});}
 return res.json({applications:rows});
}));
router.patch('/applications/:id/status',asyncRoute(async(req,res)=>{
 if(!requireUuid(req.params.id,res))return;const p=z.object({status:z.enum(['under_review','shortlisted','rejected','interview']),confirmed:z.boolean().optional()}).safeParse(req.body);if(!p.success)return res.status(400).json({error:'Recruiters may set review, shortlist, reject, or interview status.'});if(p.data.status==='rejected'&&p.data.confirmed!==true)return res.status(400).json({error:'Explicit confirmation is required before rejecting an applicant.'});
 const id=await companyId(req.user.user_id);if(!id)return res.status(403).json({error:'Recruiter company access is not configured.'});
 const client=await pool.connect();try{await client.query('BEGIN');const current=await client.query(`SELECT a.status FROM applications a JOIN job_drives d USING(drive_id) WHERE a.application_id=$1 AND d.company_id=$2 FOR UPDATE OF a`,[req.params.id,id]);if(!current.rows[0]){await client.query('ROLLBACK');return res.status(404).json({error:'Application not found for your company.'});}
  if(!applicationTransitions[current.rows[0].status]?.includes(p.data.status)){await client.query('ROLLBACK');return res.status(409).json({error:`The application cannot move from ${current.rows[0].status} to ${p.data.status}.`});}
  const {rows}=await client.query('UPDATE applications SET status=$1,updated_at=now() WHERE application_id=$2 RETURNING application_id,status',[p.data.status,req.params.id]);await client.query('INSERT INTO application_status_history(application_id,changed_by,previous_status,new_status) VALUES($1,$2,$3,$4)',[req.params.id,req.user.user_id,current.rows[0].status,rows[0].status]);await client.query('COMMIT');return res.json({application:rows[0]});
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));
router.post('/applications/:id/rounds',asyncRoute(async(req,res)=>{
 if(!requireUuid(req.params.id,res))return;const id=await companyId(req.user.user_id);if(!id)return res.status(403).json({error:'Recruiter company access is not configured.'});
 const p=z.object({roundName:z.string().trim().min(2).max(100),interviewDate:z.string().datetime({offset:true}).nullable().optional(),result:z.enum(['pending','passed','failed','no_show']).default('pending'),feedback:z.string().max(3000).nullable().optional(),requestId:z.string().uuid().optional()}).safeParse(req.body);if(!p.success)return res.status(400).json({error:p.error.issues[0].message});
 const saved=await saveInterviewRound({applicationId:req.params.id,roundName:p.data.roundName,interviewDate:p.data.interviewDate??null,result:p.data.result,feedback:p.data.feedback??null,requestId:p.data.requestId??randomUUID(),companyId:id});if(!saved)return res.status(404).json({error:'Application not found for your company.'});if(saved.rejected)return res.status(409).json({error:'This application is rejected. Reopen it before adding an interview round.'});if(saved.duplicate)return res.status(409).json({error:`A round named “${saved.existingRoundName}” is already saved for this application. Review it or use a distinct name for a separate round.`});if(saved.conflict)return res.status(409).json({error:'This save request was already used for a different interview round.'});return res.status(saved.created?201:200).json({round:saved.round,created:saved.created});
}));
export default router;
