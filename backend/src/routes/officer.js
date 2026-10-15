import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { pool } from '../config/db.js';
import { requireOfficer } from '../middleware/auth.js';
import { asyncRoute, requireUuid } from '../utils/async.js';
import { parseUpload } from '../services/imports.js';
import { applicationTransitions } from '../services/eligibility.js';

const router=Router();
router.use(...requireOfficer);
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1},fileFilter:(req,file,cb)=>cb(null,/\.(csv|xlsx)$/i.test(file.originalname))});
const companySchema=z.object({companyName:z.string().trim().min(2).max(160),industry:z.string().trim().max(100).optional().nullable(),website:z.string().url().max(300).optional().nullable(),description:z.string().max(3000).optional().nullable()});
const branchSchema=z.object({branchCode:z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,24}$/),branchName:z.string().trim().min(2).max(180),isActive:z.boolean().optional()});
const driveSchema=z.object({companyId:z.string().uuid(),role:z.string().trim().min(2).max(160),jobDescription:z.string().trim().min(20).max(20000),minimumCgpa:z.coerce.number().min(0).max(10),maximumBacklogs:z.coerce.number().int().min(0).max(50),applicationDeadline:z.string().datetime({offset:true}),packageLpa:z.coerce.number().min(0).max(99999).nullable().optional(),location:z.string().trim().max(160).nullable().optional(),status:z.enum(['draft','published','closed']).optional(),allowedBranches:z.array(z.string().trim().toUpperCase()).optional()});
const statuses=['applied','under_review','shortlisted','rejected','interview'];

router.get('/dashboard',asyncRoute(async(req,res)=>{
 const [{rows:counts},{rows:trend},{rows:latest}]=await Promise.all([
  pool.query(`SELECT (SELECT count(*) FROM students) students,(SELECT count(*) FROM job_drives WHERE status='published') published_drives,(SELECT count(*) FROM applications) applications,(SELECT count(*) FROM applications WHERE status='shortlisted') shortlisted,(SELECT count(*) FROM offers) offers`),
  pool.query(`SELECT status,count(*)::int count FROM applications GROUP BY status ORDER BY status`),
  pool.query(`SELECT d.drive_id,d.role,c.company_name,d.application_deadline,count(a.application_id)::int applicants FROM job_drives d JOIN companies c USING(company_id) LEFT JOIN applications a USING(drive_id) WHERE d.status='published' GROUP BY d.drive_id,c.company_name ORDER BY d.created_at DESC LIMIT 5`)
 ]);
 res.json({metrics:counts[0],applicationStatuses:trend,recentDrives:latest});
}));

router.get('/students/template',(req,res)=>{
 res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="scem-student-import-template.csv"');
 res.send('registration_number,full_name,branch_code,cgpa,active_backlogs,graduation_year,phone,email\nDEMO2026CSE900,Sample Student,CSE,8.25,0,2026,+91 90000 00000,sample.student@demo.example\n');
});
router.get('/students',asyncRoute(async(req,res)=>{
 const limit=Math.min(100,Math.max(1,Number(req.query.limit)||50)),offset=Math.max(0,Number(req.query.offset)||0),q=String(req.query.q||'').trim();
 const {rows}=await pool.query(`SELECT s.student_id,s.registration_number,s.full_name,b.branch_code,b.branch_name,s.cgpa,s.active_backlogs,s.graduation_year,s.contact_email,s.phone,(u.user_id IS NOT NULL) AS account_linked
 FROM students s JOIN branches b USING(branch_id) LEFT JOIN users u USING(user_id)
 WHERE ($1='' OR s.registration_number ILIKE '%'||$1||'%' OR s.full_name ILIKE '%'||$1||'%' OR b.branch_code ILIKE '%'||$1||'%')
 ORDER BY s.registration_number LIMIT $2 OFFSET $3`,[q,limit,offset]);
 const total=await pool.query(`SELECT count(*)::int count FROM students s JOIN branches b USING(branch_id) WHERE ($1='' OR s.registration_number ILIKE '%'||$1||'%' OR s.full_name ILIKE '%'||$1||'%' OR b.branch_code ILIKE '%'||$1||'%')`,[q]);
 res.json({students:rows,total:total.rows[0].count,limit,offset});
}));

router.post('/students/import/preview',upload.single('file'),asyncRoute(async(req,res)=>{
 if(!req.file)return res.status(400).json({error:'Select a CSV or XLSX file to preview.'});
 const parsed=await parseUpload(req.file);
 const minutes=Math.min(120,Math.max(5,Number(process.env.IMPORT_PREVIEW_MINUTES)||30));
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const created=await client.query(`INSERT INTO student_imports(uploaded_by,original_filename,total_rows,failed_rows,skipped_rows,status,preview_expires_at)
    VALUES($1,$2,$3,$4,$5,'preview',now()+($6::text||' minutes')::interval) RETURNING import_id,preview_expires_at`,[req.user.user_id,req.file.originalname.slice(0,255),parsed.length,parsed.filter(r=>r.action==='fail').length,parsed.filter(r=>r.action==='skip').length,String(minutes)]);
  const importId=created.rows[0].import_id;
  for(const row of parsed) await client.query('INSERT INTO student_import_rows(import_id,row_number,payload,errors,action) VALUES($1,$2,$3,$4,$5)',[importId,row.row_number,row.payload,row.errors,row.action]);
  await client.query('COMMIT');
  const summary={totalRows:parsed.length,insertableRows:parsed.filter(r=>r.action==='insert').length,skippedRows:parsed.filter(r=>r.action==='skip').length,failedRows:parsed.filter(r=>r.action==='fail').length};
  const rows=parsed.map(r=>({rowNumber:r.row_number,registrationNumber:r.payload.registration_number||null,fullName:r.payload.full_name||null,action:r.action,errors:r.errors}));
  return res.status(201).json({importId,expiresAt:created.rows[0].preview_expires_at,summary,rows});
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}));

router.post('/students/import/confirm',asyncRoute(async(req,res)=>{
 const parsed=z.object({importId:z.string().uuid()}).safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:'A valid import preview ID is required.'});
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const imp=await client.query('SELECT * FROM student_imports WHERE import_id=$1 AND uploaded_by=$2 FOR UPDATE',[parsed.data.importId,req.user.user_id]);
  if(!imp.rows[0]){await client.query('ROLLBACK');return res.status(404).json({error:'Import preview not found.'});}
  if(imp.rows[0].status!=='preview'){await client.query('ROLLBACK');return res.status(409).json({error:'This import preview has already been used.'});}
  if(new Date(imp.rows[0].preview_expires_at).getTime()<=Date.now()){
   await client.query("UPDATE student_imports SET status='expired' WHERE import_id=$1",[parsed.data.importId]);await client.query('COMMIT');return res.status(410).json({error:'This preview expired. Upload the file again to create a fresh preview.'});
  }
  const rowResult=await client.query('SELECT * FROM student_import_rows WHERE import_id=$1 ORDER BY row_number FOR UPDATE',[parsed.data.importId]);
  let inserted=0,skipped=0,failed=0;
  for(const row of rowResult.rows){
   if(row.action==='fail'){failed++;continue;}
   if(row.action==='skip'){skipped++;continue;}
   const p=row.payload;
   const branch=await client.query('SELECT 1 FROM branches WHERE branch_id=$1 AND is_active=true',[p.branch_id]);
   if(!branch.rowCount){failed++;await client.query("UPDATE student_import_rows SET action='fail',payload='{}'::jsonb,errors='[\"Configured branch became inactive before confirmation.\"]'::jsonb WHERE row_id=$1",[row.row_id]);continue;}
   const created=await client.query(`INSERT INTO students(registration_number,full_name,branch_id,cgpa,active_backlogs,graduation_year,phone,contact_email)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING student_id`,[p.registration_number,p.full_name,p.branch_id,p.cgpa,p.active_backlogs,p.graduation_year,p.phone,p.contact_email]);
   if(created.rowCount)inserted++;
   else {skipped++;await client.query("UPDATE student_import_rows SET action='skip',payload='{}'::jsonb,errors='[\"Registration number was added after the preview; no existing record was changed.\"]'::jsonb WHERE row_id=$1",[row.row_id]);}
  }
  await client.query(`UPDATE student_imports SET inserted_rows=$1,updated_rows=0,skipped_rows=$2,failed_rows=$3,status='completed',completed_at=now(),preview_expires_at=NULL WHERE import_id=$4`,[inserted,skipped,failed,parsed.data.importId]);
  await client.query('COMMIT');
  return res.json({importId:parsed.data.importId,summary:{totalRows:imp.rows[0].total_rows,insertedRows:inserted,updatedRows:0,skippedRows:skipped,failedRows:failed,status:'completed'}});
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}));

router.get('/students/imports',asyncRoute(async(req,res)=>{
 const {rows}=await pool.query('SELECT import_id,original_filename,total_rows,inserted_rows,updated_rows,skipped_rows,failed_rows,status,created_at,completed_at FROM student_imports ORDER BY created_at DESC LIMIT 100');res.json({imports:rows});
}));
router.get('/students/imports/:id',asyncRoute(async(req,res)=>{
 if(!requireUuid(req.params.id,res))return;
 const {rows}=await pool.query('SELECT import_id,original_filename,total_rows,inserted_rows,updated_rows,skipped_rows,failed_rows,status,created_at,completed_at FROM student_imports WHERE import_id=$1',[req.params.id]);
 if(!rows[0])return res.status(404).json({error:'Import report not found.'});
 return res.json({import:rows[0]});
}));
router.get('/students/imports/:id/errors',asyncRoute(async(req,res)=>{
 if(!requireUuid(req.params.id,res))return;
 const owns=await pool.query('SELECT 1 FROM student_imports WHERE import_id=$1',[req.params.id]);if(!owns.rowCount)return res.status(404).json({error:'Import report not found.'});
 const {rows}=await pool.query("SELECT row_number,action,errors FROM student_import_rows WHERE import_id=$1 AND action IN ('fail','skip') ORDER BY row_number",[req.params.id]);res.json({errors:rows});
}));

router.get('/companies',asyncRoute(async(req,res)=>{const {rows}=await pool.query('SELECT company_id,company_name,industry,website,description,created_at FROM companies ORDER BY company_name');res.json({companies:rows});}));
router.get('/branches',asyncRoute(async(req,res)=>{const {rows}=await pool.query('SELECT branch_id,branch_code,branch_name FROM branches WHERE is_active=true ORDER BY branch_code');res.json({branches:rows});}));
router.get('/branches/all',asyncRoute(async(req,res)=>{const {rows}=await pool.query('SELECT branch_id,branch_code,branch_name,is_active FROM branches ORDER BY branch_code');res.json({branches:rows});}));
router.post('/branches',asyncRoute(async(req,res)=>{
 const p=branchSchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:p.error.issues[0].message});
 try{const {rows}=await pool.query('INSERT INTO branches(branch_code,branch_name,is_active) VALUES($1,$2,COALESCE($3,true)) RETURNING branch_id,branch_code,branch_name,is_active',[p.data.branchCode,p.data.branchName,p.data.isActive]);return res.status(201).json({branch:rows[0]});}catch(e){if(e.code==='23505')return res.status(409).json({error:'That branch code already exists.'});throw e;}
}));
router.put('/branches/:id',asyncRoute(async(req,res)=>{
 if(!requireUuid(req.params.id,res))return;const p=branchSchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:p.error.issues[0].message});
 try{const {rows}=await pool.query('UPDATE branches SET branch_code=$1,branch_name=$2,is_active=COALESCE($3,is_active) WHERE branch_id=$4 RETURNING branch_id,branch_code,branch_name,is_active',[p.data.branchCode,p.data.branchName,p.data.isActive??null,req.params.id]);if(!rows[0])return res.status(404).json({error:'Branch not found.'});return res.json({branch:rows[0]});}catch(e){if(e.code==='23505')return res.status(409).json({error:'That branch code already exists.'});throw e;}
}));
router.post('/companies',asyncRoute(async(req,res)=>{
 const p=companySchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:p.error.issues[0].message});
 try{const {rows}=await pool.query('INSERT INTO companies(company_name,industry,website,description) VALUES($1,$2,$3,$4) RETURNING *',[p.data.companyName,p.data.industry||null,p.data.website||null,p.data.description||null]);return res.status(201).json({company:rows[0]});}
 catch(e){if(e.code==='23505')return res.status(409).json({error:'A company with this name already exists.'});throw e;}
}));
router.put('/companies/:id',asyncRoute(async(req,res)=>{
 if(!requireUuid(req.params.id,res))return;const p=companySchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:p.error.issues[0].message});
 const {rows}=await pool.query('UPDATE companies SET company_name=$1,industry=$2,website=$3,description=$4,updated_at=now() WHERE company_id=$5 RETURNING *',[p.data.companyName,p.data.industry||null,p.data.website||null,p.data.description||null,req.params.id]);if(!rows[0])return res.status(404).json({error:'Company not found.'});return res.json({company:rows[0]});
}));

router.get('/drives',asyncRoute(async(req,res)=>{const {rows}=await pool.query(`SELECT d.drive_id,d.role,d.status,d.minimum_cgpa,d.maximum_backlogs,d.application_deadline,d.package_lpa,d.location,c.company_name,count(a.application_id)::int applicants FROM job_drives d JOIN companies c USING(company_id) LEFT JOIN applications a USING(drive_id) GROUP BY d.drive_id,c.company_name ORDER BY d.created_at DESC`);res.json({drives:rows});}));
router.post('/drives',asyncRoute(async(req,res)=>{
 const p=driveSchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:p.error.issues[0].message});
 const client=await pool.connect();try{
  await client.query('BEGIN');const company=await client.query('SELECT 1 FROM companies WHERE company_id=$1',[p.data.companyId]);if(!company.rowCount){await client.query('ROLLBACK');return res.status(400).json({error:'Select an existing company.'});}
  const codes=p.data.allowedBranches||[];const branches=await client.query('SELECT branch_id,branch_code FROM branches WHERE is_active=true AND branch_code=ANY($1::text[])',[codes]);if(branches.rowCount!==new Set(codes).size){await client.query('ROLLBACK');return res.status(400).json({error:'One or more selected branches are unavailable.'});}
  const {rows}=await client.query(`INSERT INTO job_drives(company_id,role,job_description,minimum_cgpa,maximum_backlogs,application_deadline,package_lpa,location,status,created_by)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[p.data.companyId,p.data.role,p.data.jobDescription,p.data.minimumCgpa,p.data.maximumBacklogs,p.data.applicationDeadline,p.data.packageLpa??null,p.data.location??null,p.data.status||'draft',req.user.user_id]);
  for(const b of branches.rows)await client.query('INSERT INTO drive_allowed_branches(drive_id,branch_id) VALUES($1,$2)',[rows[0].drive_id,b.branch_id]);
  await client.query('COMMIT');return res.status(201).json({drive:rows[0],branchScope:branches.rowCount?'selected_branches':'all_active_branches'});
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));
router.put('/drives/:id',asyncRoute(async(req,res)=>{
 if(!requireUuid(req.params.id,res))return;const p=driveSchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:p.error.issues[0].message});
  const client=await pool.connect();try{
  await client.query('BEGIN');const company=await client.query('SELECT 1 FROM companies WHERE company_id=$1',[p.data.companyId]);if(!company.rowCount){await client.query('ROLLBACK');return res.status(400).json({error:'Select an existing company.'});}const codes=p.data.allowedBranches||[];const branches=await client.query('SELECT branch_id,branch_code FROM branches WHERE is_active=true AND branch_code=ANY($1::text[])',[codes]);if(branches.rowCount!==new Set(codes).size){await client.query('ROLLBACK');return res.status(400).json({error:'One or more selected branches are unavailable.'});}
  const {rows}=await client.query(`UPDATE job_drives SET company_id=$1,role=$2,job_description=$3,minimum_cgpa=$4,maximum_backlogs=$5,application_deadline=$6,package_lpa=$7,location=$8,status=COALESCE($9,status),updated_at=now() WHERE drive_id=$10 RETURNING *`,[p.data.companyId,p.data.role,p.data.jobDescription,p.data.minimumCgpa,p.data.maximumBacklogs,p.data.applicationDeadline,p.data.packageLpa??null,p.data.location??null,p.data.status??null,req.params.id]);if(!rows[0]){await client.query('ROLLBACK');return res.status(404).json({error:'Drive not found.'});}
  await client.query('DELETE FROM drive_allowed_branches WHERE drive_id=$1',[req.params.id]);for(const b of branches.rows)await client.query('INSERT INTO drive_allowed_branches(drive_id,branch_id) VALUES($1,$2)',[req.params.id,b.branch_id]);
  await client.query('COMMIT');return res.json({drive:rows[0],branchScope:branches.rowCount?'selected_branches':'all_active_branches'});
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));
router.patch('/drives/:id/status',asyncRoute(async(req,res)=>{
 if(!requireUuid(req.params.id,res))return;const p=z.object({status:z.enum(['draft','published','closed'])}).safeParse(req.body);if(!p.success)return res.status(400).json({error:'Status must be draft, published, or closed.'});
 const {rows}=await pool.query('UPDATE job_drives SET status=$1,updated_at=now() WHERE drive_id=$2 RETURNING drive_id,status',[p.data.status,req.params.id]);if(!rows[0])return res.status(404).json({error:'Drive not found.'});return res.json({drive:rows[0]});
}));

router.get('/drives/:id/applications',asyncRoute(async(req,res)=>{
 if(!requireUuid(req.params.id,res))return;
 const {rows}=await pool.query(`SELECT a.application_id,a.status,a.applied_at,a.eligibility_snapshot,s.student_id,s.registration_number,s.full_name,s.cgpa,s.active_backlogs,b.branch_code,b.branch_name,s.contact_email,s.resume_text
  FROM applications a JOIN students s USING(student_id) JOIN branches b USING(branch_id) WHERE a.drive_id=$1 ORDER BY a.applied_at DESC`,[req.params.id]);return res.json({applications:rows});
}));

router.patch('/applications/:id/status',asyncRoute(async(req,res)=>{
 if(!requireUuid(req.params.id,res))return;const p=z.object({status:z.enum(statuses)}).safeParse(req.body);if(!p.success)return res.status(400).json({error:'Choose a supported application review status. Create an offer through the offer endpoint.'});
 const client=await pool.connect();try{
  await client.query('BEGIN');const current=await client.query('SELECT status FROM applications WHERE application_id=$1 FOR UPDATE',[req.params.id]);if(!current.rows[0]){await client.query('ROLLBACK');return res.status(404).json({error:'Application not found.'});}
  if(!applicationTransitions[current.rows[0].status]?.includes(p.data.status)){await client.query('ROLLBACK');return res.status(409).json({error:`The application cannot move from ${current.rows[0].status} to ${p.data.status}.`});}
  const updated=await client.query('UPDATE applications SET status=$1,updated_at=now() WHERE application_id=$2 RETURNING application_id,status',[p.data.status,req.params.id]);await client.query('COMMIT');return res.json({application:updated.rows[0]});
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));
router.post('/applications/:id/rounds',asyncRoute(async(req,res)=>{
 if(!requireUuid(req.params.id,res))return;const p=z.object({roundName:z.string().trim().min(2).max(100),interviewDate:z.string().datetime({offset:true}).nullable().optional(),result:z.enum(['pending','passed','failed','no_show']).default('pending'),feedback:z.string().max(3000).nullable().optional()}).safeParse(req.body);if(!p.success)return res.status(400).json({error:p.error.issues[0].message});
 const {rows}=await pool.query(`INSERT INTO interview_rounds(application_id,round_name,interview_date,result,feedback) SELECT application_id,$2,$3,$4,$5 FROM applications WHERE application_id=$1 RETURNING *`,[req.params.id,p.data.roundName,p.data.interviewDate??null,p.data.result,p.data.feedback??null]);if(!rows[0])return res.status(404).json({error:'Application not found.'});return res.status(201).json({round:rows[0]});
}));
router.post('/applications/:id/offers',asyncRoute(async(req,res)=>{
 if(!requireUuid(req.params.id,res))return;const p=z.object({packageLpa:z.coerce.number().min(0).max(99999),offerDate:z.string().date().optional()}).safeParse(req.body);if(!p.success)return res.status(400).json({error:p.error.issues[0].message});
 const client=await pool.connect();try{await client.query('BEGIN');const app=await client.query('SELECT application_id,status FROM applications WHERE application_id=$1 FOR UPDATE',[req.params.id]);if(!app.rows[0]){await client.query('ROLLBACK');return res.status(404).json({error:'Application not found.'});}if(!['interview','shortlisted'].includes(app.rows[0].status)){await client.query('ROLLBACK');return res.status(409).json({error:'An offer can be added after shortlisting or interview.'});}
  const {rows}=await client.query('INSERT INTO offers(application_id,package_lpa,offer_date) VALUES($1,$2,COALESCE($3::date,CURRENT_DATE)) ON CONFLICT(application_id) DO NOTHING RETURNING *',[req.params.id,p.data.packageLpa,p.data.offerDate??null]);if(!rows[0]){await client.query('ROLLBACK');return res.status(409).json({error:'An offer is already recorded for this application.'});}
  await client.query("UPDATE applications SET status='offered',updated_at=now() WHERE application_id=$1",[req.params.id]);await client.query('COMMIT');return res.status(201).json({offer:rows[0]});
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));
router.get('/reports/summary',asyncRoute(async(req,res)=>{
 const [{rows:metrics},{rows:branches},{rows:companies},{rows:monthly}]=await Promise.all([
  pool.query(`SELECT count(DISTINCT s.student_id)::int total_students,count(DISTINCT s.student_id) FILTER(WHERE o.status='accepted')::int students_with_accepted_offers,round(avg(o.package_lpa) FILTER(WHERE o.status='accepted'),2) accepted_average_lpa,round(100.0*count(DISTINCT s.student_id) FILTER(WHERE o.status='accepted')/NULLIF(count(DISTINCT s.student_id),0),2) accepted_offer_rate_pct FROM students s LEFT JOIN applications a USING(student_id) LEFT JOIN offers o USING(application_id)`),
  pool.query(`SELECT b.branch_code,b.branch_name,count(DISTINCT s.student_id)::int students,count(DISTINCT a.application_id)::int applications,count(DISTINCT s.student_id) FILTER(WHERE o.status='accepted')::int placed FROM branches b LEFT JOIN students s USING(branch_id) LEFT JOIN applications a USING(student_id) LEFT JOIN offers o USING(application_id) GROUP BY b.branch_id ORDER BY b.branch_code`),
  pool.query(`SELECT c.company_name,count(DISTINCT a.application_id)::int applications,count(DISTINCT o.offer_id)::int offers FROM companies c LEFT JOIN job_drives d USING(company_id) LEFT JOIN applications a USING(drive_id) LEFT JOIN offers o USING(application_id) GROUP BY c.company_id ORDER BY applications DESC`),
  pool.query(`SELECT to_char(date_trunc('month',applied_at),'Mon YY') month,count(*)::int count FROM applications WHERE applied_at>=now()-interval '12 months' GROUP BY date_trunc('month',applied_at) ORDER BY date_trunc('month',applied_at)`)
 ]);res.json({definition:'Accepted offer rate = distinct students with accepted offers / all imported student records. Development seed offers are pending and are excluded.',metrics:metrics[0],byBranch:branches,byCompany:companies,applicationsByMonth:monthly});
}));
router.get('/reports/export',asyncRoute(async(req,res)=>{
 const kind=req.query.kind==='offers'?'offers':'applications';
 const sql=kind==='offers'?`SELECT s.registration_number,s.full_name,b.branch_code,c.company_name,d.role,o.package_lpa,o.status,o.offer_date FROM offers o JOIN applications a USING(application_id) JOIN students s USING(student_id) JOIN branches b USING(branch_id) JOIN job_drives d USING(drive_id) JOIN companies c USING(company_id) ORDER BY o.offer_date DESC`
  :`SELECT s.registration_number,s.full_name,b.branch_code,c.company_name,d.role,a.status,a.applied_at FROM applications a JOIN students s USING(student_id) JOIN branches b USING(branch_id) JOIN job_drives d USING(drive_id) JOIN companies c USING(company_id) ORDER BY a.applied_at DESC`;
 const {rows}=await pool.query(sql);const fields=kind==='offers'?['registration_number','full_name','branch_code','company_name','role','package_lpa','status','offer_date']:['registration_number','full_name','branch_code','company_name','role','status','applied_at'];
 const cell=(value)=>{let text=String(value??'');if([61,43,45,64,9,13].includes(text.charCodeAt(0)))text=`'${text}`;return `"${text.replaceAll('"','""')}"`;};
 const csv=[fields.map(cell).join(','),...rows.map(row=>fields.map(field=>cell(row[field])).join(','))].join(String.fromCharCode(13,10));
 res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition',`attachment; filename="scem-${kind}-${new Date().toISOString().slice(0,10)}.csv"`);return res.send(csv);
}));

export default router;
