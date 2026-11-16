import { Router } from 'express';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { z } from 'zod';
import { pool } from '../config/db.js';
import { requireOfficer } from '../middleware/auth.js';
import { asyncRoute, requireUuid } from '../utils/async.js';
import { parseUpload } from '../services/imports.js';
import { applicationTransitions } from '../services/eligibility.js';
import { saveInterviewRound } from '../services/interviewRounds.js';
import { normalizeRegistrationSearchTerm, getRegistrationPolicyReport, getOfficialRegistrationSqlPattern, getValidatedIntakeYear } from '../config/registrationPolicy.js';

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

router.get('/students/template',asyncRoute(async(req,res)=>{
 const templatePath=new URL('../../database/templates/SCEM_Student_Roster_Import_Template_4SF_Format.xlsx',import.meta.url);
 const bytes=await readFile(templatePath);
 res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 res.setHeader('Content-Disposition','attachment; filename="SCEM_Student_Roster_Import_Template_4SF_Format.xlsx"');
 return res.send(bytes);
}));
router.get('/students/demo-roster',asyncRoute(async(req,res)=>{
 const format=String(req.query.format||'xlsx').toLowerCase();
 if(!['csv','xlsx'].includes(format))return res.status(400).json({error:'Demo roster format must be csv or xlsx.'});
 const filename=`SCEM_Fictional_Demo_Student_Roster_4SF.${format}`;
 const rosterPath=new URL(`../../database/templates/${filename}`,import.meta.url);
 const bytes=await readFile(rosterPath);
 res.setHeader('Content-Type',format==='csv'?'text/csv; charset=utf-8':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 res.setHeader('Content-Disposition',`attachment; filename="${filename}"`);
 return res.send(bytes);
}));
router.get('/students',asyncRoute(async(req,res)=>{
 const q=normalizeRegistrationSearchTerm(String(req.query.q||'').slice(0,160));
 const branchCode=String(req.query.branchCode||'').trim().toUpperCase();
 const requestedYear=String(req.query.intakeYear||'').trim();
 const intakeYear=requestedYear==='24'?'2024':requestedYear==='25'?'2025':requestedYear;
 const accountStatus=String(req.query.accountStatus||'').trim();
 if(intakeYear&&!['2024','2025'].includes(intakeYear))return res.status(400).json({error:'Intake year must be 2024 or 2025.'});
 if(accountStatus&&!['registered','not_registered'].includes(accountStatus))return res.status(400).json({error:'Portal registration filter must be registered or not_registered.'});
 const limit=Math.min(10000,Math.max(1,Number(req.query.limit)||100)),offset=Math.max(0,Number(req.query.offset)||0);
 const [{rows},{rows:departmentOptions}]=await Promise.all([
  pool.query(`SELECT s.student_id,s.registration_number,s.full_name,b.branch_code,b.branch_name,s.cgpa,s.active_backlogs,s.graduation_year,s.contact_email,s.phone,(u.user_id IS NOT NULL) AS account_linked,
    COALESCE(activity.application_count,0)::int application_count,COALESCE(activity.accepted_offer_count,0)::int accepted_offer_count
    FROM students s JOIN branches b USING(branch_id) LEFT JOIN users u USING(user_id)
    LEFT JOIN LATERAL (
      SELECT count(DISTINCT a.application_id)::int application_count,count(DISTINCT o.offer_id) FILTER(WHERE o.status='accepted')::int accepted_offer_count
      FROM applications a LEFT JOIN offers o USING(application_id) WHERE a.student_id=s.student_id
    ) activity ON true
    WHERE ($1='' OR s.registration_number ILIKE '%'||$1||'%' OR s.full_name ILIKE '%'||$1||'%' OR COALESCE(s.contact_email,'') ILIKE '%'||$1||'%' OR b.branch_code ILIKE '%'||$1||'%')
      AND ($2='' OR b.branch_code=$2)
      AND ($3='' OR ($3='registered' AND u.user_id IS NOT NULL) OR ($3='not_registered' AND u.user_id IS NULL))
    ORDER BY b.branch_name,b.branch_code,s.registration_number,s.student_id`,[q,branchCode,accountStatus]),
  pool.query(`SELECT b.branch_code,b.branch_name FROM branches b WHERE b.is_active=true OR EXISTS(SELECT 1 FROM students s WHERE s.branch_id=b.branch_id) ORDER BY b.branch_name,b.branch_code`)
 ]);
 const students=rows.map(student=>({...student,intake_year:getValidatedIntakeYear(student.registration_number,student.branch_code)}))
   .filter(student=>!intakeYear||student.intake_year===intakeYear);
 const byDepartment=new Map();
 const emptyDepartment=()=>({students:0,active_students:0,intake_2024:0,intake_2025:0,registered_accounts:0,not_registered:0,students_with_active_backlogs:0,applications:0,accepted_offers:0});
 for(const student of students){
  const department=byDepartment.get(student.branch_code)||{branch_code:student.branch_code,branch_name:student.branch_name,...emptyDepartment()};
  department.students+=1;
  department.active_students+=1;
  if(student.intake_year==='2024')department.intake_2024+=1;
  if(student.intake_year==='2025')department.intake_2025+=1;
  if(student.account_linked)department.registered_accounts+=1;else department.not_registered+=1;
  if(Number(student.active_backlogs)>0)department.students_with_active_backlogs+=1;
  department.applications+=student.application_count;
  department.accepted_offers+=student.accepted_offer_count;
  byDepartment.set(student.branch_code,department);
 }
 if(branchCode&&!byDepartment.has(branchCode)){
  const selected=departmentOptions.find(department=>department.branch_code===branchCode);
  if(selected)byDepartment.set(branchCode,{branch_code:selected.branch_code,branch_name:selected.branch_name,...emptyDepartment()});
 }
 const departmentRows=[...byDepartment.values()].sort((a,b)=>a.branch_name.localeCompare(b.branch_name)||a.branch_code.localeCompare(b.branch_code));
 const totals=departmentRows.reduce((sum,department)=>{
  for(const key of Object.keys(emptyDepartment()))sum[key]+=department[key];
  return sum;
 },emptyDepartment());
 const pageStudents=students.slice(offset,offset+limit);
 res.json({students:pageStudents,total:students.length,limit,offset,filters:{q,branchCode,intakeYear,accountStatus},departmentOptions,byDepartment:departmentRows,overall:totals,studentDeactivationSupported:false});
}));
router.get('/registration-policy',(req,res)=>res.json(getRegistrationPolicyReport()));

router.post('/student-groups',asyncRoute(async(req,res)=>{
 const parsed=z.object({nClusters:z.number().int().min(2).max(8).optional()}).safeParse(req.body||{});
 if(!parsed.success)return res.status(400).json({error:'Cluster count must be an integer from 2 through 8.'});
 const {rows}=await pool.query(`SELECT s.student_id,s.registration_number,s.full_name,s.cgpa,s.active_backlogs,s.resume_text,b.branch_code,b.branch_name
  FROM students s JOIN branches b USING(branch_id)
  ORDER BY lower(s.registration_number),s.student_id`);
 if(rows.length>2000)return res.status(422).json({error:'K-Means grouping supports up to 2,000 roster records. Filter the roster or reduce the imported dataset.'});

 const serviceUrl=(process.env.AI_SERVICE_URL||'http://localhost:8000').replace(/\/$/,'');
 let result;
 try{
  const upstream=await fetch(`${serviceUrl}/cluster`,{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({profiles:rows.map(student=>({
    cgpa:student.cgpa===null?null:Number(student.cgpa),
    active_backlogs:student.active_backlogs===null?null:Number(student.active_backlogs),
    resume_text:student.resume_text||'',
   })),n_clusters:parsed.data.nClusters}),
   signal:AbortSignal.timeout(30000),
  });
  result=await upstream.json().catch(()=>null);
  if(!upstream.ok){
   const detail=typeof result?.detail==='string'?result.detail:null;
   return res.status(upstream.status===422?422:502).json({error:detail||'The student grouping service returned an invalid request response.'});
  }
 }catch{
  return res.status(503).json({error:'K-Means grouping is unavailable. Start the local FastAPI service and try again.'});
 }

 if(result?.status==='insufficient_data')return res.json({...result,assignments:undefined,clusters:[]});
 if(result?.status!=='ok'||!Array.isArray(result.assignments)||!Array.isArray(result.clusters)||!Number.isInteger(result.included_records)||
  result.total_records!==rows.length||result.excluded_records!==result.total_records-result.included_records||
  !Number.isInteger(result.selected_cluster_count)||result.clusters.length!==result.selected_cluster_count||
  !Number.isFinite(result.silhouette_score)||result.silhouette_score < -1||result.silhouette_score > 1)
  return res.status(502).json({error:'The student grouping service returned an incomplete result.'});

 const clusterIds=new Set(result.clusters.map(cluster=>cluster?.cluster_id));
 const assigned=new Map();
 for(const assignment of result.assignments){
  const index=assignment?.record_index;
  if(!Number.isInteger(index)||index<0||index>=rows.length||assigned.has(index)||!clusterIds.has(assignment.cluster_id))
   return res.status(502).json({error:'The student grouping service returned invalid membership data.'});
  assigned.set(index,assignment.cluster_id);
 }
 if(assigned.size!==result.included_records)return res.status(502).json({error:'The student grouping service returned inconsistent membership totals.'});

 const clusters=[];
 for(const cluster of result.clusters){
  const memberIndices=[...assigned.entries()].filter(([,clusterId])=>clusterId===cluster.cluster_id).map(([index])=>index);
  const declaredIndices=cluster.member_indices;
  if(!Array.isArray(declaredIndices)||declaredIndices.length!==memberIndices.length||
   declaredIndices.some(index=>!memberIndices.includes(index))||cluster.student_count!==memberIndices.length)
   return res.status(502).json({error:'The student grouping service returned inconsistent cluster summaries.'});
  clusters.push({
   cluster_id:cluster.cluster_id,student_count:memberIndices.length,
   average_cgpa:cluster.average_cgpa,average_active_backlogs:cluster.average_active_backlogs,
   common_skills:cluster.common_skills,profile_summary:cluster.profile_summary,
   students:memberIndices.map(index=>{
    const student=rows[index];
    return {student_id:student.student_id,full_name:student.full_name,registration_number:student.registration_number,
     branch_code:student.branch_code,branch_name:student.branch_name,cgpa:student.cgpa,active_backlogs:student.active_backlogs};
   }),
  });
 }
 return res.json({...result,assignments:undefined,clusters});
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
   for(const row of parsed) await client.query('INSERT INTO student_import_rows(import_id,row_number,payload,errors,action) VALUES($1,$2,$3,$4,$5)',[importId,row.row_number,row.payload,JSON.stringify(row.errors),row.action]);
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
 const {rows}=await pool.query('SELECT import_id,original_filename,total_rows,inserted_rows,updated_rows,skipped_rows,failed_rows,status,created_at,completed_at FROM student_imports WHERE uploaded_by=$1 ORDER BY created_at DESC LIMIT 100',[req.user.user_id]);res.json({imports:rows});
}));
router.get('/students/imports/:id',asyncRoute(async(req,res)=>{
 if(!requireUuid(req.params.id,res))return;
 const {rows}=await pool.query('SELECT import_id,original_filename,total_rows,inserted_rows,updated_rows,skipped_rows,failed_rows,status,created_at,completed_at FROM student_imports WHERE import_id=$1 AND uploaded_by=$2',[req.params.id,req.user.user_id]);
 if(!rows[0])return res.status(404).json({error:'Import report not found.'});
 return res.json({import:rows[0]});
}));
router.get('/students/imports/:id/errors',asyncRoute(async(req,res)=>{
 if(!requireUuid(req.params.id,res))return;
 const owns=await pool.query('SELECT 1 FROM student_imports WHERE import_id=$1 AND uploaded_by=$2',[req.params.id,req.user.user_id]);if(!owns.rowCount)return res.status(404).json({error:'Import report not found.'});
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
 const {rows}=await pool.query(`SELECT a.application_id,a.status,a.applied_at,a.eligibility_snapshot,s.student_id,s.registration_number,s.full_name,s.cgpa,s.active_backlogs,b.branch_code,b.branch_name,s.contact_email,s.resume_text,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('roundId',r.round_id,'roundName',r.round_name,'date',r.interview_date,'result',r.result,'feedback',r.feedback,'createdAt',r.created_at) ORDER BY r.created_at,r.round_id) FROM interview_rounds r WHERE r.application_id=a.application_id),'[]'::jsonb) AS rounds
  FROM applications a JOIN students s USING(student_id) JOIN branches b USING(branch_id) WHERE a.drive_id=$1 ORDER BY a.applied_at DESC`,[req.params.id]);return res.json({applications:rows});
}));

router.patch('/applications/:id/status',asyncRoute(async(req,res)=>{
 if(!requireUuid(req.params.id,res))return;const p=z.object({status:z.enum(statuses),confirmed:z.boolean().optional()}).safeParse(req.body);if(!p.success)return res.status(400).json({error:'Choose a supported application review status. Create an offer through the offer endpoint.'});if(p.data.status==='rejected'&&p.data.confirmed!==true)return res.status(400).json({error:'Explicit confirmation is required before rejecting an applicant.'});
 const client=await pool.connect();try{
  await client.query('BEGIN');const current=await client.query('SELECT status FROM applications WHERE application_id=$1 FOR UPDATE',[req.params.id]);if(!current.rows[0]){await client.query('ROLLBACK');return res.status(404).json({error:'Application not found.'});}
  if(!applicationTransitions[current.rows[0].status]?.includes(p.data.status)){await client.query('ROLLBACK');return res.status(409).json({error:`The application cannot move from ${current.rows[0].status} to ${p.data.status}.`});}
  const updated=await client.query('UPDATE applications SET status=$1,updated_at=now() WHERE application_id=$2 RETURNING application_id,status',[p.data.status,req.params.id]);await client.query('INSERT INTO application_status_history(application_id,changed_by,previous_status,new_status) VALUES($1,$2,$3,$4)',[req.params.id,req.user.user_id,current.rows[0].status,updated.rows[0].status]);await client.query('COMMIT');return res.json({application:updated.rows[0]});
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));
router.post('/applications/:id/rounds',asyncRoute(async(req,res)=>{
 if(!requireUuid(req.params.id,res))return;const p=z.object({roundName:z.string().trim().min(2).max(100),interviewDate:z.string().datetime({offset:true}).nullable().optional(),result:z.enum(['pending','passed','failed','no_show']).default('pending'),feedback:z.string().max(3000).nullable().optional(),requestId:z.string().uuid().optional()}).safeParse(req.body);if(!p.success)return res.status(400).json({error:p.error.issues[0].message});
 const saved=await saveInterviewRound({applicationId:req.params.id,roundName:p.data.roundName,interviewDate:p.data.interviewDate??null,result:p.data.result,feedback:p.data.feedback??null,requestId:p.data.requestId??randomUUID()});if(!saved)return res.status(404).json({error:'Application not found.'});if(saved.rejected)return res.status(409).json({error:'This application is rejected. Reopen it before adding an interview round.'});if(saved.duplicate)return res.status(409).json({error:`A round named “${saved.existingRoundName}” is already saved for this application. Review it or use a distinct name for a separate round.`});if(saved.conflict)return res.status(409).json({error:'This save request was already used for a different interview round.'});return res.status(saved.created?201:200).json({round:saved.round,created:saved.created});
}));
router.post('/applications/:id/offers',asyncRoute(async(req,res)=>{
 if(!requireUuid(req.params.id,res))return;const p=z.object({packageLpa:z.coerce.number().min(0).max(99999),offerDate:z.string().date().optional()}).safeParse(req.body);if(!p.success)return res.status(400).json({error:p.error.issues[0].message});
 const client=await pool.connect();try{await client.query('BEGIN');const app=await client.query('SELECT application_id,status FROM applications WHERE application_id=$1 FOR UPDATE',[req.params.id]);if(!app.rows[0]){await client.query('ROLLBACK');return res.status(404).json({error:'Application not found.'});}if(!['interview','shortlisted'].includes(app.rows[0].status)){await client.query('ROLLBACK');return res.status(409).json({error:'An offer can be added after shortlisting or interview.'});}
  const {rows}=await client.query('INSERT INTO offers(application_id,package_lpa,offer_date) VALUES($1,$2,COALESCE($3::date,CURRENT_DATE)) ON CONFLICT(application_id) DO NOTHING RETURNING *',[req.params.id,p.data.packageLpa,p.data.offerDate??null]);if(!rows[0]){await client.query('ROLLBACK');return res.status(409).json({error:'An offer is already recorded for this application.'});}
  await client.query("UPDATE applications SET status='offered',updated_at=now() WHERE application_id=$1",[req.params.id]);await client.query('INSERT INTO application_status_history(application_id,changed_by,previous_status,new_status) VALUES($1,$2,$3,$4)',[req.params.id,req.user.user_id,app.rows[0].status,'offered']);await client.query('COMMIT');return res.status(201).json({offer:rows[0]});
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));
router.get('/reports/summary',asyncRoute(async(req,res)=>{
 const [{rows:metrics},{rows:branches},{rows:companies},{rows:monthly}]=await Promise.all([
  pool.query(`SELECT count(DISTINCT s.student_id)::int total_students,count(DISTINCT s.student_id) FILTER(WHERE o.status='accepted')::int students_with_accepted_offers,round(avg(o.package_lpa) FILTER(WHERE o.status='accepted'),2) accepted_average_lpa,round(100.0*count(DISTINCT s.student_id) FILTER(WHERE o.status='accepted')/NULLIF(count(DISTINCT s.student_id),0),2) accepted_offer_rate_pct FROM students s LEFT JOIN applications a USING(student_id) LEFT JOIN offers o USING(application_id)`),
  pool.query(`SELECT b.branch_code,b.branch_name,
    count(DISTINCT s.student_id)::int students,
    count(DISTINCT s.student_id) FILTER(WHERE NULLIF(btrim(s.registration_number),'') IS NOT NULL)::int registration_records,
    count(DISTINCT s.student_id) FILTER(WHERE s.user_id IS NOT NULL)::int registered_accounts,
    count(DISTINCT s.student_id) FILTER(WHERE upper(btrim(s.registration_number)) ~* $1)::int intake_2024_registrations,
    count(DISTINCT s.student_id) FILTER(WHERE upper(btrim(s.registration_number)) ~* $2)::int intake_2025_registrations,
    count(DISTINCT a.application_id)::int applications,
    count(DISTINCT o.offer_id)::int offers,
    count(DISTINCT s.student_id) FILTER(WHERE o.status='accepted')::int placed,
    count(DISTINCT o.offer_id) FILTER(WHERE o.status='accepted')::int accepted_offers
    FROM branches b LEFT JOIN students s USING(branch_id) LEFT JOIN applications a USING(student_id) LEFT JOIN offers o USING(application_id)
    GROUP BY b.branch_id ORDER BY b.branch_code`,[getOfficialRegistrationSqlPattern('24'),getOfficialRegistrationSqlPattern('25')]),
  pool.query(`SELECT c.company_name,count(DISTINCT a.application_id)::int applications,count(DISTINCT o.offer_id)::int offers FROM companies c LEFT JOIN job_drives d USING(company_id) LEFT JOIN applications a USING(drive_id) LEFT JOIN offers o USING(application_id) GROUP BY c.company_id ORDER BY applications DESC`),
  pool.query(`WITH months AS (SELECT generate_series(date_trunc('month',now())-interval '11 months',date_trunc('month',now()),interval '1 month') AS month_start) SELECT to_char(m.month_start,'Mon YY') AS "month",count(a.application_id)::int count FROM months m LEFT JOIN applications a ON a.applied_at>=m.month_start AND a.applied_at<m.month_start+interval '1 month' GROUP BY m.month_start ORDER BY m.month_start`)
 ]);res.json({definition:'Roster records count student rows. Registration records count rows with a non-empty registration number, including existing DEMO IDs. Registered accounts count roster rows linked to a user. Applications and offers count distinct database records. Intake 2024/2025 counts include only official-format 4SF IDs. Every department total is grouped by students.branch_id; department membership is never inferred from registration-number text. Accepted offer rate = distinct students with accepted offers / all roster records.',metrics:metrics[0],byBranch:branches,byCompany:companies,applicationsByMonth:monthly,registrationPolicy:getRegistrationPolicyReport()});
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
