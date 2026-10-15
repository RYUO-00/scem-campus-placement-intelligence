import { Router } from 'express';
import { pool } from '../config/db.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { asyncRoute, requireUuid } from '../utils/async.js';

const router=Router();
router.get('/health',asyncRoute(async(req,res)=>{
 try{const upstream=await fetch(`${process.env.AI_SERVICE_URL||'http://localhost:8000'}/health`,{signal:AbortSignal.timeout(2500)});const body=await upstream.json();return res.status(upstream.ok?200:503).json({available:upstream.ok,service:body});}
 catch{return res.status(503).json({available:false,message:'Resume matching is currently unavailable. Placement and application workflows remain available.'});}
}));
router.post('/match/:driveId',authenticate,allowRoles('student'),asyncRoute(async(req,res)=>{
 if(!requireUuid(req.params.driveId,res))return;
 const studentResult=await pool.query('SELECT student_id,resume_text FROM students WHERE user_id=$1',[req.user.user_id]);if(!studentResult.rows[0])return res.status(404).json({error:'Student profile not found.'});
 const student=studentResult.rows[0];if(!student.resume_text?.trim())return res.status(422).json({error:'Add your resume text before requesting a match.'});
 const driveResult=await pool.query(`SELECT d.drive_id,d.role,d.job_description,d.status FROM job_drives d WHERE d.drive_id=$1 AND d.status='published'`,[req.params.driveId]);if(!driveResult.rows[0])return res.status(404).json({error:'Published drive not found.'});
 let body;
 try{const response=await fetch(`${process.env.AI_SERVICE_URL||'http://localhost:8000'}/match`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({resume_text:student.resume_text,job_description:driveResult.rows[0].job_description}),signal:AbortSignal.timeout(10000)});if(!response.ok){const details=await response.json().catch(()=>({}));return res.status(502).json({error:details.detail||'Resume matching service returned an error.'});}body=await response.json();}
 catch{return res.status(503).json({error:'Resume matching is temporarily unavailable. You can still browse drives and apply using rule-based eligibility.'});}
 if(typeof body.similarity_score!=='number'||body.similarity_score<0||body.similarity_score>100||!Array.isArray(body.matched_skills)||!Array.isArray(body.missing_skills)||!Array.isArray(body.recommendations))return res.status(502).json({error:'Resume matching service returned an invalid result.'});
 const {rows}=await pool.query(`INSERT INTO ai_match_results(student_id,drive_id,similarity_score,matched_skills,missing_skills,recommendations) VALUES($1,$2,$3,$4,$5,$6) RETURNING match_id,similarity_score,matched_skills,missing_skills,recommendations,created_at`,[student.student_id,req.params.driveId,body.similarity_score,JSON.stringify(body.matched_skills),JSON.stringify(body.missing_skills),JSON.stringify(body.recommendations)]);
 return res.status(201).json({match:rows[0],disclaimer:'Text similarity is not a hiring probability and does not affect mandatory eligibility.'});
}));
router.get('/matches/:driveId',authenticate,asyncRoute(async(req,res)=>{
 if(!requireUuid(req.params.driveId,res))return;
 let sql=`SELECT m.match_id,m.similarity_score,m.matched_skills,m.missing_skills,m.recommendations,m.created_at,s.student_id,s.full_name,s.registration_number FROM ai_match_results m JOIN students s USING(student_id) WHERE m.drive_id=$1`;
 const args=[req.params.driveId];
 if(req.user.role==='student'){sql+=' AND s.user_id=$2';args.push(req.user.user_id);}
 else if(req.user.role==='recruiter') {sql+=' AND EXISTS(SELECT 1 FROM recruiters r JOIN job_drives d USING(company_id) WHERE r.user_id=$2 AND d.drive_id=m.drive_id)';args.push(req.user.user_id);}
 else if(req.user.role!=='placement_officer')return res.status(403).json({error:'You do not have permission to access match results.'});
 sql+=' ORDER BY m.created_at DESC';const {rows}=await pool.query(sql,args);return res.json({matches:rows,disclaimer:'Similarity is textual overlap, not hiring probability.'});
}));
export default router;
