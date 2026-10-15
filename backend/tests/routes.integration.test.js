import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,readdir } from 'node:fs/promises';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const testUrl=process.env.TEST_DATABASE_URL;
const skipReason=testUrl?false:'Set TEST_DATABASE_URL to a dedicated database whose name contains "test" to run API integration tests.';
const root=dirname(fileURLToPath(import.meta.url));

async function integrationContext(){
 const url=new URL(testUrl);
 if(!decodeURIComponent(url.pathname).toLowerCase().includes('test'))throw new Error('Refusing integration tests: TEST_DATABASE_URL database name must contain "test".');
 process.env.DATABASE_URL=testUrl;
 process.env.JWT_SECRET='integration-tests-only-secret-change-this-value-32chars';
 process.env.FRONTEND_ORIGIN='http://localhost:5173';
 process.env.NODE_ENV='test';
 process.env.AI_SERVICE_URL='http://127.0.0.1:1';
 const {pool}=await import('../src/config/db.js');
 const client=await pool.connect();
 try{
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const applied=new Set((await client.query('SELECT name FROM schema_migrations')).rows.map(r=>r.name));
  const dir=join(root,'..','database','migrations');
  for(const name of (await readdir(dir)).filter(x=>x.endsWith('.sql')).sort()){
   if(applied.has(name))continue;
   await client.query('BEGIN');try{await client.query(await readFile(join(dir,name),'utf8'));await client.query('INSERT INTO schema_migrations(name) VALUES($1)',[name]);await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');throw error;}
  }
 }finally{client.release();}
 const app=(await import('../src/app.js')).default;
 const server=app.listen(0,'127.0.0.1');
 await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
 const base=`http://127.0.0.1:${server.address().port}/api`;
 const suffix=randomUUID().replaceAll('-','');
 const emails=[];const registrationNumbers=[];const companyIds=[];const driveIds=[];const importIds=[];const ids={};
 const request=async(path,options={})=>{
  const headers={...(options.cookie?{Cookie:options.cookie}:{}),...(options.body instanceof FormData?{}:options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})};
  const response=await fetch(`${base}${path}`,{method:options.method||'GET',headers,body:options.body instanceof FormData?options.body:options.body?JSON.stringify(options.body):undefined});
  const data=response.status===204?null:await response.json().catch(()=>null);
  return {response,data};
 };
 const cookieFrom=(response)=>{const raw=response.headers.get('set-cookie');assert.ok(raw,'Expected session cookie');return raw.split(';',1)[0];};
 const officerEmail=`officer-${suffix}@test.example`;const officerPass='test-officer-password-123';
 const bcrypt=await import('bcryptjs');
 const officer=await pool.query("INSERT INTO users(name,email,password_hash,role) VALUES('Integration Officer',$1,$2,'placement_officer') RETURNING user_id",[officerEmail,await bcrypt.default.hash(officerPass,4)]);emails.push(officerEmail);ids.officerId=officer.rows[0].user_id;
 const company=await pool.query('INSERT INTO companies(company_name,industry) VALUES($1,$2) RETURNING company_id',[`Test Company ${suffix}`,'Testing']);companyIds.push(company.rows[0].company_id);ids.companyId=company.rows[0].company_id;
 const branches=await pool.query("SELECT branch_id,branch_code FROM branches WHERE branch_code IN ('CSE','ECE') ORDER BY branch_code");
 ids.branchId=branches.rows.find(x=>x.branch_code==='CSE').branch_id;ids.eceBranchId=branches.rows.find(x=>x.branch_code==='ECE').branch_id;
 async function roster({name='Test Student',email,registrationNumber,cgpa=8.2,backlogs=0,branchId=ids.branchId}={}){
  const reg=registrationNumber||`TST${suffix.slice(0,12)}${registrationNumbers.length}`;const mail=email||`student-${registrationNumbers.length}-${suffix}@test.example`;
  const result=await pool.query(`INSERT INTO students(registration_number,full_name,branch_id,cgpa,active_backlogs,graduation_year,contact_email)
   VALUES($1,$2,$3,$4,$5,2027,$6) RETURNING student_id`,[reg,name,branchId,cgpa,backlogs,mail]);registrationNumbers.push(reg);return {studentId:result.rows[0].student_id,name,email:mail,registrationNumber:reg,cgpa,backlogs};
 }
 async function signUp(student,password='student-password-123'){
  const {response,data}=await request('/auth/register',{method:'POST',body:{name:student.name,email:student.email,password,registrationNumber:student.registrationNumber,role:'placement_officer'}});
  if(response.ok)emails.push(student.email);
  return {response,data,cookie:response.ok?cookieFrom(response):null};
 }
 async function makeDrive({role='Test Engineer',minimumCgpa=7,maximumBacklogs=0,deadline=new Date(Date.now()+86400000*7),status='published',branchIds=[]}={}){
  const result=await pool.query(`INSERT INTO job_drives(company_id,role,job_description,minimum_cgpa,maximum_backlogs,application_deadline,status,created_by)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING drive_id`,[ids.companyId,`${role} role for integration testing with Python, SQL and REST APIs.`,minimumCgpa,maximumBacklogs,deadline,status,ids.officerId]);
  const driveId=result.rows[0].drive_id;driveIds.push(driveId);
  for(const branchId of branchIds)await pool.query('INSERT INTO drive_allowed_branches(drive_id,branch_id) VALUES($1,$2)',[driveId,branchId]);
  return driveId;
 }
 async function uploadCsv(cookie,filename,csv){const form=new FormData();form.append('file',new Blob([csv],{type:'text/csv'}),filename);return request('/officer/students/import/preview',{method:'POST',cookie,body:form});}

 return {pool,server,request,cookieFrom,roster,signUp,makeDrive,uploadCsv,emails,registrationNumbers,companyIds,driveIds,importIds,ids,officerEmail,officerPass};
}

test('PostgreSQL-backed API workflows', {skip:skipReason}, async(t)=>{
 const ctx=await integrationContext();
 try{
  await t.test('registration links roster data; browser cannot assign an officer role',async()=>{
   const record=await ctx.roster({name:'Aria Test'});
   const registered=await ctx.signUp(record);
   assert.equal(registered.response.status,201);
   assert.equal(registered.data.user.role,'student');
   const me=await ctx.request('/auth/me',{cookie:registered.cookie});assert.equal(me.data.user.role,'student');
   const forbidden=await ctx.request('/officer/dashboard',{cookie:registered.cookie});assert.equal(forbidden.response.status,403);
   const invalid=await ctx.request('/auth/login',{method:'POST',body:{email:record.email,password:'incorrect-password'}});assert.equal(invalid.response.status,401);
   const unauthenticated=await ctx.request('/students/me');assert.equal(unauthenticated.response.status,401);
   const tampered=await ctx.request('/auth/register',{method:'POST',body:{name:record.name,email:`wrong-${record.email}`,password:'student-password-123',registrationNumber:record.registrationNumber}});assert.equal(tampered.response.status,400);
   const before=await ctx.pool.query('SELECT cgpa FROM students WHERE student_id=$1',[record.studentId]);
   await ctx.request('/students/me',{method:'PUT',cookie:registered.cookie,body:{cgpa:10,active_backlogs:0,phone:'123'}});
   const after=await ctx.pool.query('SELECT cgpa FROM students WHERE student_id=$1',[record.studentId]);assert.equal(Number(after.rows[0].cgpa),Number(before.rows[0].cgpa));
  });

  await t.test('CSV preview validates rows, respects ownership, and confirms once',async()=>{
   const ownerLogin=await ctx.request('/auth/login',{method:'POST',body:{email:ctx.officerEmail,password:ctx.officerPass}});assert.equal(ownerLogin.response.status,200);const ownerCookie=ctx.cookieFrom(ownerLogin.response);
   const secondEmail=`second-${randomUUID()}@test.example`;const secondPass='second-officer-password-123';const bcrypt=await import('bcryptjs');await ctx.pool.query("INSERT INTO users(name,email,password_hash,role) VALUES('Second Officer',$1,$2,'placement_officer')",[secondEmail,await bcrypt.default.hash(secondPass,4)]);ctx.emails.push(secondEmail);
   const secondLogin=await ctx.request('/auth/login',{method:'POST',body:{email:secondEmail,password:secondPass}});const secondCookie=ctx.cookieFrom(secondLogin.response);
   const existing=await ctx.roster({name:'Existing Roster Student'});
   const denied=await ctx.request('/officer/students/import/preview',{method:'POST',body:new FormData()});assert.equal(denied.response.status,401);
   const insertedRegistration=`TSTNEW${randomUUID().slice(0,8)}`;ctx.registrationNumbers.push(insertedRegistration);
   const badBranchRegistration=`BADBR${randomUUID().slice(0,6)}`;ctx.registrationNumbers.push(badBranchRegistration);
   const csv=`registration_number,full_name,branch_code,cgpa,active_backlogs,graduation_year,phone,email\n${insertedRegistration},New Test Student,CSE,8.1,0,2027,,new-${randomUUID()}@test.example\n${existing.registrationNumber},Existing Roster Student,CSE,8.4,0,2027,,${existing.email}\nBADCGPA${randomUUID().slice(0,6)},Invalid Grade,CSE,12,0,2027,,invalid-${randomUUID()}@test.example\n${badBranchRegistration},Unknown Branch,DOES-NOT-EXIST,8.1,0,2027,,branch-${randomUUID()}@test.example\n`;
   const {response,data}=await ctx.uploadCsv(ownerCookie,'integration.csv',csv);assert.equal(response.status,201);assert.equal(data.summary.insertableRows,1);assert.equal(data.summary.skippedRows,1);assert.equal(data.summary.failedRows,2);ctx.importIds.push(data.importId);
   const crossOwner=await ctx.request('/officer/students/import/confirm',{method:'POST',cookie:secondCookie,body:{importId:data.importId}});assert.equal(crossOwner.response.status,404);
   const confirmed=await ctx.request('/officer/students/import/confirm',{method:'POST',cookie:ownerCookie,body:{importId:data.importId}});assert.equal(confirmed.response.status,200);assert.equal(confirmed.data.summary.insertedRows,1);assert.equal(confirmed.data.summary.skippedRows,1);assert.equal(confirmed.data.summary.failedRows,2);
   const repeated=await ctx.request('/officer/students/import/confirm',{method:'POST',cookie:ownerCookie,body:{importId:data.importId}});assert.equal(repeated.response.status,409);
   const errors=await ctx.request(`/officer/students/imports/${data.importId}/errors`,{cookie:ownerCookie});assert.equal(errors.data.errors.length,3);assert.equal(JSON.stringify(errors.data).includes(existing.email),false);
  });

  await t.test('XLSX imports accept valid records; malformed headers and expired previews fail safely',async()=>{
   const login=await ctx.request('/auth/login',{method:'POST',body:{email:ctx.officerEmail,password:ctx.officerPass}});const cookie=ctx.cookieFrom(login.response);
   const ExcelJS=(await import('exceljs')).default;const workbook=new ExcelJS.Workbook();const workbookRegistration=`XLS${randomUUID().slice(0,10)}`;ctx.registrationNumbers.push(workbookRegistration);const sheet=workbook.addWorksheet('Students');sheet.addRows([
    ['registration_number','full_name','branch_code','cgpa','active_backlogs','graduation_year','phone','email'],
    [workbookRegistration,'Workbook Student','ISE',8.7,0,2027,'','workbook.student@test.example']
   ]);const bytes=Buffer.from(await workbook.xlsx.writeBuffer());
   const form=new FormData();form.append('file',new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),'students.xlsx');const preview=await ctx.request('/officer/students/import/preview',{method:'POST',cookie,body:form});assert.equal(preview.response.status,201);ctx.importIds.push(preview.data.importId);
   const confirmed=await ctx.request('/officer/students/import/confirm',{method:'POST',cookie,body:{importId:preview.data.importId}});assert.equal(confirmed.response.status,200);assert.equal(confirmed.data.summary.insertedRows,1);
   const missing=await ctx.uploadCsv(cookie,'missing.csv','registration_number,full_name\nX,Student\n');assert.equal(missing.response.status,400);
   const expiring=await ctx.uploadCsv(cookie,'expiry.csv',`registration_number,full_name,branch_code,cgpa,active_backlogs,graduation_year,email\nEXP${randomUUID().slice(0,8)},Expiry Student,CSE,8,0,2027,expiry-${randomUUID()}@test.example\n`);assert.equal(expiring.response.status,201);ctx.importIds.push(expiring.data.importId);
   await ctx.pool.query("UPDATE student_imports SET preview_expires_at=now()-interval '1 minute' WHERE import_id=$1",[expiring.data.importId]);
   const expired=await ctx.request('/officer/students/import/confirm',{method:'POST',cookie,body:{importId:expiring.data.importId}});assert.equal(expired.response.status,410);
  });

  await t.test('eligibility, deadlines, branch allowlists, duplicate applications and status permissions are enforced',async()=>{
   const student=await ctx.roster({name:'Eligible Applicant',cgpa:8.3});const account=await ctx.signUp(student);assert.equal(account.response.status,201);
   const drive=await ctx.makeDrive({role:'Eligible Test Role'});
   const eligible=await ctx.request(`/drives/${drive}/eligibility`,{cookie:account.cookie});assert.equal(eligible.data.eligibility.eligible,true);
   const applied=await ctx.request(`/drives/${drive}/applications`,{method:'POST',cookie:account.cookie,body:{}});assert.equal(applied.response.status,201);assert.equal(applied.data.eligibility.criteriaAtApplication.maximumBacklogs,0);
   const duplicate=await ctx.request(`/drives/${drive}/applications`,{method:'POST',cookie:account.cookie,body:{}});assert.equal(duplicate.response.status,409);
   const forbidden=await ctx.request(`/officer/applications/${applied.data.applicationId}/status`,{method:'PATCH',cookie:account.cookie,body:{status:'shortlisted'}});assert.equal(forbidden.response.status,403);
   const low=await ctx.roster({name:'Ineligible Applicant',cgpa:6.2});const lowAccount=await ctx.signUp(low);const lowResult=await ctx.request(`/drives/${drive}/eligibility`,{cookie:lowAccount.cookie});assert.equal(lowResult.data.eligibility.eligible,false);assert.match(lowResult.data.eligibility.reasons.join(' '),/CGPA/);
   const branchDrive=await ctx.makeDrive({role:'EC Branch Only',branchIds:[ctx.ids.eceBranchId]});const branchResult=await ctx.request(`/drives/${branchDrive}/eligibility`,{cookie:account.cookie});assert.equal(branchResult.data.eligibility.eligible,false);assert.match(branchResult.data.eligibility.reasons.join(' '),/branch/);
   const closed=await ctx.makeDrive({role:'Closed Drive',status:'closed'});const closedResult=await ctx.request(`/drives/${closed}/applications`,{method:'POST',cookie:account.cookie,body:{}});assert.equal(closedResult.response.status,422);
   const expired=await ctx.makeDrive({role:'Expired Drive',deadline:new Date(Date.now()-86400000)});const expiredResult=await ctx.request(`/drives/${expired}/applications`,{method:'POST',cookie:account.cookie,body:{}});assert.equal(expiredResult.response.status,422);
   const login=await ctx.request('/auth/login',{method:'POST',body:{email:ctx.officerEmail,password:ctx.officerPass}});const officerCookie=ctx.cookieFrom(login.response);
   const shortlist=await ctx.request(`/officer/applications/${applied.data.applicationId}/status`,{method:'PATCH',cookie:officerCookie,body:{status:'shortlisted'}});assert.equal(shortlist.response.status,200);
   const offer=await ctx.request(`/officer/applications/${applied.data.applicationId}/offers`,{method:'POST',cookie:officerCookie,body:{packageLpa:8.2}});assert.equal(offer.response.status,201);
   const current=await ctx.pool.query('SELECT status FROM applications WHERE application_id=$1',[applied.data.applicationId]);assert.equal(current.rows[0].status,'offered');
  });

  await t.test('recruiter company boundaries and AI outage do not break placement workflows',async()=>{
   const student=await ctx.roster({name:'AI Applicant'});const account=await ctx.signUp(student);const drive=await ctx.makeDrive({role:'Local Matcher Role'});
   await ctx.request('/students/me',{method:'PUT',cookie:account.cookie,body:{resumeText:'Python SQL REST APIs and testing'}});
   const unavailable=await ctx.request(`/ai/match/${drive}`,{method:'POST',cookie:account.cookie,body:{}});assert.equal(unavailable.response.status,503);
   const otherCompany=await ctx.pool.query('INSERT INTO companies(company_name) VALUES($1) RETURNING company_id',[`Other Test Company ${randomUUID()}`]);ctx.companyIds.push(otherCompany.rows[0].company_id);
   const recruiterEmail=`recruiter-${randomUUID()}@test.example`;const pass='recruiter-password-123';const bcrypt=await import('bcryptjs');const user=await ctx.pool.query("INSERT INTO users(name,email,password_hash,role) VALUES('Scoped Recruiter',$1,$2,'recruiter') RETURNING user_id",[recruiterEmail,await bcrypt.default.hash(pass,4)]);ctx.emails.push(recruiterEmail);await ctx.pool.query('INSERT INTO recruiters(user_id,company_id) VALUES($1,$2)',[user.rows[0].user_id,otherCompany.rows[0].company_id]);
   const login=await ctx.request('/auth/login',{method:'POST',body:{email:recruiterEmail,password:pass}});const cookie=ctx.cookieFrom(login.response);
   const hidden=await ctx.request(`/recruiter/drives/${drive}/applications`,{cookie});assert.equal(hidden.response.status,404);
   const hiddenDrive=await ctx.request(`/drives/${drive}`,{cookie});assert.equal(hiddenDrive.response.status,404);
   const studentMatches=await ctx.request(`/ai/matches/${drive}`,{cookie:account.cookie});assert.equal(studentMatches.response.status,200);assert.equal(studentMatches.data.matches.length,0);
  });
 }finally{
  await ctx.pool.query('DELETE FROM student_imports WHERE import_id=ANY($1::uuid[])',[ctx.importIds]);
  await ctx.pool.query('DELETE FROM job_drives WHERE drive_id=ANY($1::uuid[])',[ctx.driveIds]);
  await ctx.pool.query('DELETE FROM students WHERE registration_number=ANY($1::text[])',[ctx.registrationNumbers]);
  await ctx.pool.query('DELETE FROM users WHERE email=ANY($1::text[])',[[...ctx.emails,ctx.officerEmail]]);
  await ctx.pool.query('DELETE FROM companies WHERE company_id=ANY($1::uuid[])',[ctx.companyIds]);
  await new Promise(resolve=>ctx.server.close(resolve));await ctx.pool.end();
 }
});
