import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,readdir } from 'node:fs/promises';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

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
 process.env.AI_SERVICE_URL=process.env.TEST_AI_SERVICE_URL||'http://127.0.0.1:1';
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
 // The integration server is reached only through loopback. Trust that local
 // proxy so tests can use isolated source IPs instead of sharing one limiter bucket.
 app.set('trust proxy','loopback');
 const server=app.listen(0,'127.0.0.1');
 await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
 const base=`http://127.0.0.1:${server.address().port}/api`;
 const suffix=randomUUID().replaceAll('-','');
 const emails=[];const registrationNumbers=[];const companyIds=[];const driveIds=[];const importIds=[];const ids={};let requestIndex=0;
 const request=async(path,options={})=>{
  const clientIp=options.clientIp||`198.18.${Math.floor(requestIndex/254)%256}.${requestIndex++%254+1}`;
  const headers={'X-Forwarded-For':clientIp,...(options.cookie?{Cookie:options.cookie}:{}),...(options.body instanceof FormData?{}:options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})};
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
  const reg=registrationNumber||`DEMO2026CSE${suffix.slice(0,8).toUpperCase()}${registrationNumbers.length}`;const mail=email||`student-${registrationNumbers.length}-${suffix}@test.example`;
  const result=await pool.query(`INSERT INTO students(registration_number,full_name,branch_id,cgpa,active_backlogs,graduation_year,contact_email)
   VALUES($1,$2,$3,$4,$5,2027,$6) RETURNING student_id`,[reg,name,branchId,cgpa,backlogs,mail]);registrationNumbers.push(reg);return {studentId:result.rows[0].student_id,name,email:mail,registrationNumber:reg,cgpa,backlogs};
 }
 async function uniqueOfficialRegistration(departmentCode='CS',intakeYear='24'){
  for(let attempt=0;attempt<1000;attempt++){
   const sequence=String(Math.floor(Math.random()*1000)).padStart(3,'0');const candidate=`4SF${intakeYear}${departmentCode}${sequence}`;
   const exists=await pool.query('SELECT 1 FROM students WHERE upper(btrim(registration_number))=$1',[candidate]);if(!exists.rowCount)return candidate;
  }
  throw new Error(`Could not reserve a free 4SF${intakeYear}${departmentCode} sequence for the integration test.`);
 }
 async function signUp(student,password='student-password-123'){
  const {response,data}=await request('/auth/register',{method:'POST',body:{name:student.name,email:student.email,password,registrationNumber:student.registrationNumber,role:'placement_officer'}});
  if(response.ok)emails.push(student.email);
  return {response,data,cookie:response.ok?cookieFrom(response):null};
 }
 async function makeDrive({companyId=ids.companyId,role='Test Engineer',minimumCgpa=7,maximumBacklogs=0,deadline=new Date(Date.now()+86400000*7),status='published',branchIds=[]}={}){
  const result=await pool.query(`INSERT INTO job_drives(company_id,role,job_description,minimum_cgpa,maximum_backlogs,application_deadline,status,created_by)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING drive_id`,[companyId,role,`${role} role for integration testing with Python, SQL and REST APIs.`,minimumCgpa,maximumBacklogs,deadline,status,ids.officerId]);
  const driveId=result.rows[0].drive_id;driveIds.push(driveId);
  for(const branchId of branchIds)await pool.query('INSERT INTO drive_allowed_branches(drive_id,branch_id) VALUES($1,$2)',[driveId,branchId]);
  return driveId;
 }
 async function uploadCsv(cookie,filename,csv){const form=new FormData();form.append('file',new Blob([csv],{type:'text/csv'}),filename);return request('/officer/students/import/preview',{method:'POST',cookie,body:form});}
 async function downloadTemplate(cookie){return fetch(`${base}/officer/students/template`,{headers:{Cookie:cookie}});}
 async function downloadDemoRoster(cookie,format){return fetch(`${base}/officer/students/demo-roster?format=${encodeURIComponent(format)}`,{headers:{Cookie:cookie}});}
 async function uploadResume(cookie,filename,mimeType,bytes){const form=new FormData();form.append('file',new Blob([bytes],{type:mimeType}),filename);return request('/students/me/resume',{method:'POST',cookie,body:form});}

 return {pool,server,base,request,cookieFrom,roster,uniqueOfficialRegistration,signUp,makeDrive,uploadCsv,uploadResume,downloadTemplate,downloadDemoRoster,emails,registrationNumbers,companyIds,driveIds,importIds,ids,officerEmail,officerPass};
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
   const studentLogin=await ctx.request('/auth/login',{method:'POST',body:{email:record.email,password:'student-password-123',expectedRole:'student'}});
   assert.equal(studentLogin.response.status,200);assert.equal(studentLogin.data.user.role,'student');assert.ok(studentLogin.response.headers.get('set-cookie'));
   const wrongStudentRole=await ctx.request('/auth/login',{method:'POST',body:{email:record.email,password:'student-password-123',expectedRole:'placement_officer'}});
   assert.equal(wrongStudentRole.response.status,403);assert.equal(wrongStudentRole.response.headers.get('set-cookie'),null);assert.match(wrongStudentRole.data.error,/registered as Student/i);
   const forbidden=await ctx.request('/officer/dashboard',{cookie:registered.cookie});assert.equal(forbidden.response.status,403);
   const invalid=await ctx.request('/auth/login',{method:'POST',body:{email:record.email,password:'incorrect-password'}});assert.equal(invalid.response.status,401);
   const unauthenticated=await ctx.request('/students/me');assert.equal(unauthenticated.response.status,401);
   const tampered=await ctx.request('/auth/register',{method:'POST',body:{name:record.name,email:`wrong-${record.email}`,password:'student-password-123',registrationNumber:record.registrationNumber}});assert.equal(tampered.response.status,400);
   const before=await ctx.pool.query('SELECT cgpa FROM students WHERE student_id=$1',[record.studentId]);
   await ctx.request('/students/me',{method:'PUT',cookie:registered.cookie,body:{cgpa:10,active_backlogs:0,phone:'123'}});
   const after=await ctx.pool.query('SELECT cgpa FROM students WHERE student_id=$1',[record.studentId]);assert.equal(Number(after.rows[0].cgpa),Number(before.rows[0].cgpa));
   const logout=await ctx.request('/auth/logout',{method:'POST',cookie:registered.cookie});assert.equal(logout.response.status,204);assert.match(logout.response.headers.get('set-cookie')||'',/Expires=Thu, 01 Jan 1970|Max-Age=0/i);
  });

  await t.test('TXT, PDF, and DOCX resumes are parsed, validated, saved, and returned on refresh',async()=>{
   const record=await ctx.roster({name:'Resume Parser Student'});const account=await ctx.signUp(record);assert.equal(account.response.status,201);
   const fixtures=join(root,'fixtures');
   const uploads=[
    ['resume.txt','text/plain',Buffer.from('Resume parsing test\nSkills: Python, SQL')],
    ['resume.pdf','application/pdf',await readFile(join(fixtures,'sample.pdf'))],
    ['resume.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document',await readFile(join(fixtures,'sample.docx'))],
   ];
   for(const [filename,mimeType,bytes] of uploads){
    const uploaded=await ctx.uploadResume(account.cookie,filename,mimeType,bytes);
    assert.equal(uploaded.response.status,200,JSON.stringify(uploaded.data));
    assert.ok(uploaded.data.characterCount>0);
    assert.equal(typeof uploaded.data.resumeText,'string');
   }
   assert.match((await ctx.request('/students/me',{cookie:account.cookie})).data.student.resumeText,/Python, SQL, REST APIs/);
   const edit=await ctx.request('/students/me',{method:'PUT',cookie:account.cookie,body:{resumeText:'Student-edited resume content for matching.'}});
   assert.equal(edit.response.status,200);
   assert.equal((await ctx.request('/students/me',{cookie:account.cookie})).data.student.resumeText,'Student-edited resume content for matching.');

   const invalidExtension=await ctx.uploadResume(account.cookie,'resume.exe','application/octet-stream',Buffer.from('ignored'));
   assert.equal(invalidExtension.response.status,415);
   const invalidMime=await ctx.uploadResume(account.cookie,'resume.pdf','text/plain',Buffer.from('%PDF-1.4'));
   assert.equal(invalidMime.response.status,415);
   const malformed=await ctx.uploadResume(account.cookie,'resume.pdf','application/pdf',Buffer.from('%PDF-1.4\nbroken'));
   assert.equal(malformed.response.status,422);
   const encrypted=await ctx.uploadResume(account.cookie,'resume.pdf','application/pdf',await readFile(join(fixtures,'encrypted.pdf')));
   assert.equal(encrypted.response.status,422);assert.match(encrypted.data.error,/Password-protected PDFs are not supported/);
   const empty=await ctx.uploadResume(account.cookie,'resume.txt','text/plain',Buffer.alloc(0));
   assert.equal(empty.response.status,422);
   const oversized=await ctx.uploadResume(account.cookie,'resume.txt','text/plain',Buffer.alloc(2*1024*1024+1,0x61));
   assert.equal(oversized.response.status,413);
  });

  await t.test('CSV preview validates rows, respects ownership, and confirms once',async()=>{
   const ownerLogin=await ctx.request('/auth/login',{method:'POST',body:{email:ctx.officerEmail,password:ctx.officerPass,expectedRole:'placement_officer'}});assert.equal(ownerLogin.response.status,200);const ownerCookie=ctx.cookieFrom(ownerLogin.response);
   const secondEmail=`second-${randomUUID()}@test.example`;const secondPass='second-officer-password-123';const bcrypt=await import('bcryptjs');await ctx.pool.query("INSERT INTO users(name,email,password_hash,role) VALUES('Second Officer',$1,$2,'placement_officer')",[secondEmail,await bcrypt.default.hash(secondPass,4)]);ctx.emails.push(secondEmail);
   const secondLogin=await ctx.request('/auth/login',{method:'POST',body:{email:secondEmail,password:secondPass}});const secondCookie=ctx.cookieFrom(secondLogin.response);
   const existing=await ctx.roster({name:'Existing Roster Student'});
   const denied=await ctx.request('/officer/students/import/preview',{method:'POST',body:new FormData()});assert.equal(denied.response.status,401);
   const insertedRegistration=await ctx.uniqueOfficialRegistration('CS','24');ctx.registrationNumbers.push(insertedRegistration);
   const badBranchRegistration=`BADBR${randomUUID().slice(0,6)}`;ctx.registrationNumbers.push(badBranchRegistration);
   const csv=`registration_number,full_name,branch_code,cgpa,active_backlogs,graduation_year,email,phone\n  ${insertedRegistration.toLowerCase()}  ,New Test Student,CSE,8.1,0,2027,new-${randomUUID()}@test.example,\n${existing.registrationNumber},Existing Roster Student,CSE,8.4,0,2027,${existing.email},\nBADCGPA${randomUUID().slice(0,6)},Invalid Grade,CSE,12,0,2027,invalid-${randomUUID()}@test.example,\n${badBranchRegistration},Unknown Branch,DOES-NOT-EXIST,8.1,0,2027,branch-${randomUUID()}@test.example,\n`;
   const {response,data}=await ctx.uploadCsv(ownerCookie,'integration.csv',csv);assert.equal(response.status,201);assert.equal(data.summary.insertableRows,1);assert.equal(data.summary.skippedRows,1);assert.equal(data.summary.failedRows,2);ctx.importIds.push(data.importId);
   const crossOwner=await ctx.request('/officer/students/import/confirm',{method:'POST',cookie:secondCookie,body:{importId:data.importId}});assert.equal(crossOwner.response.status,404);
   const ownerHistory=await ctx.request('/officer/students/imports',{cookie:ownerCookie});assert.ok(ownerHistory.data.imports.some(x=>x.import_id===data.importId));
   const secondHistory=await ctx.request('/officer/students/imports',{cookie:secondCookie});assert.equal(secondHistory.data.imports.some(x=>x.import_id===data.importId),false);
   const otherSummary=await ctx.request(`/officer/students/imports/${data.importId}`,{cookie:secondCookie});assert.equal(otherSummary.response.status,404);
   const otherErrors=await ctx.request(`/officer/students/imports/${data.importId}/errors`,{cookie:secondCookie});assert.equal(otherErrors.response.status,404);
   const confirmed=await ctx.request('/officer/students/import/confirm',{method:'POST',cookie:ownerCookie,body:{importId:data.importId}});assert.equal(confirmed.response.status,200);assert.equal(confirmed.data.summary.insertedRows,1);assert.equal(confirmed.data.summary.skippedRows,1);assert.equal(confirmed.data.summary.failedRows,2);
   const repeated=await ctx.request('/officer/students/import/confirm',{method:'POST',cookie:ownerCookie,body:{importId:data.importId}});assert.equal(repeated.response.status,409);
   const errors=await ctx.request(`/officer/students/imports/${data.importId}/errors`,{cookie:ownerCookie});assert.equal(errors.data.errors.length,3);assert.equal(JSON.stringify(errors.data).includes(existing.email),false);
  });

  await t.test('registration API, roster import, and directory share normalized 4SF validation',async()=>{
   const officialNumber=await ctx.uniqueOfficialRegistration('CS','24');
   const official=await ctx.roster({name:'Official Format Student',registrationNumber:officialNumber,email:`official-${randomUUID()}@test.example`});
   const normalizedAccount=await ctx.signUp({...official,registrationNumber:`  ${officialNumber.toLowerCase()}  `});
   assert.equal(normalizedAccount.response.status,201,JSON.stringify(normalizedAccount.data));
   const profile=await ctx.request('/students/me',{cookie:normalizedAccount.cookie});assert.equal(profile.data.student.registration_number,officialNumber);

   const badPrefix=await ctx.request('/auth/register',{method:'POST',body:{name:'Invalid Prefix',email:`prefix-${randomUUID()}@test.example`,password:'student-password-123',registrationNumber:'24AI001'}});
   assert.equal(badPrefix.response.status,400);assert.match(badPrefix.data.error,/complete 4SF prefix/);
   const unsupportedYear=await ctx.request('/auth/register',{method:'POST',body:{name:'Unsupported Year',email:`year-${randomUUID()}@test.example`,password:'student-password-123',registrationNumber:'4SF23CS001'}});
   assert.equal(unsupportedYear.response.status,400);assert.match(unsupportedYear.data.error,/Intake year/);
   const unresolved=await ctx.request('/auth/register',{method:'POST',body:{name:'Unresolved Department',email:`unresolved-${randomUUID()}@test.example`,password:'student-password-123',registrationNumber:'4SF24RE001'}});
   assert.equal(unresolved.response.status,400);assert.match(unresolved.data.error,/no confirmed canonical branch mapping/);

   const mismatchedNumber=await ctx.uniqueOfficialRegistration('CS','25');
   const mismatched=await ctx.roster({name:'Wrong Mapped Branch',registrationNumber:mismatchedNumber,email:`mismatch-${randomUUID()}@test.example`,branchId:ctx.ids.eceBranchId});
   const mismatchAccount=await ctx.signUp(mismatched);assert.equal(mismatchAccount.response.status,409);assert.match(mismatchAccount.data.error,/branch does not match/);

   const officerLogin=await ctx.request('/auth/login',{method:'POST',body:{email:ctx.officerEmail,password:ctx.officerPass,expectedRole:'placement_officer'}});const officerCookie=ctx.cookieFrom(officerLogin.response);
   const directory=await ctx.request(`/officer/students?q=${encodeURIComponent(` ${officialNumber.toLowerCase()} `)}`,{cookie:officerCookie});
   assert.equal(directory.response.status,200);assert.ok(directory.data.students.some(student=>student.registration_number===officialNumber));
   const repeatedCsv=await ctx.uploadCsv(officerCookie,'normalized-duplicate.csv',`registration_number,full_name,branch_code,cgpa,active_backlogs,graduation_year,email,phone\n  ${officialNumber.toLowerCase()}  ,Duplicate Normalized ID,CSE,8,0,2027,duplicate-${randomUUID()}@test.example,\n`);
   assert.equal(repeatedCsv.response.status,201);assert.equal(repeatedCsv.data.summary.skippedRows,1);ctx.importIds.push(repeatedCsv.data.importId);

   const unresolvedCsv=await ctx.uploadCsv(officerCookie,'unresolved-mapping.csv',`registration_number,full_name,branch_code,cgpa,active_backlogs,graduation_year,email,phone\n4SF24RE001,Unresolved Registration,CSE,8,0,2027,re-${randomUUID()}@test.example,\n${mismatchedNumber},Mapped to Wrong Branch,ECE,8,0,2027,wrong-${randomUUID()}@test.example,\n`);
   assert.equal(unresolvedCsv.response.status,201);assert.equal(unresolvedCsv.data.summary.failedRows,2);ctx.importIds.push(unresolvedCsv.data.importId);
   const rowErrors=await ctx.request(`/officer/students/imports/${unresolvedCsv.data.importId}/errors`,{cookie:officerCookie});
   assert.ok(rowErrors.data.errors.some(row=>JSON.stringify(row.errors).includes('no confirmed canonical branch mapping')));
   assert.ok(rowErrors.data.errors.some(row=>JSON.stringify(row.errors).includes('maps to CSE')));

   const registrationPolicy=await ctx.request('/officer/registration-policy',{cookie:officerCookie});assert.equal(registrationPolicy.response.status,200);
   assert.ok(registrationPolicy.data.departments.some(department=>department.registrationCode==='RE'&&department.mappingStatus==='unresolved'));
  });

  await t.test('student directory returns combined filters and reconciled department/cohort statistics',async()=>{
   const suffix=randomUUID().slice(0,8),searchToken=`directory-${suffix}`;
   const cse2024=await ctx.roster({name:`Directory ${suffix} CSE 24 A`,email:`${searchToken}-cse24a@test.example`,registrationNumber:await ctx.uniqueOfficialRegistration('CS','24'),branchId:ctx.ids.branchId});
   const cse2024Backlog=await ctx.roster({name:`Directory ${suffix} CSE 24 B`,email:`${searchToken}-cse24b@test.example`,registrationNumber:await ctx.uniqueOfficialRegistration('CS','24'),branchId:ctx.ids.branchId,backlogs:1});
   const cse2025=await ctx.roster({name:`Directory ${suffix} CSE 25`,email:`${searchToken}-cse25@test.example`,registrationNumber:await ctx.uniqueOfficialRegistration('CS','25'),branchId:ctx.ids.branchId});
   const cseLegacy=await ctx.roster({name:`Directory ${suffix} CSE legacy`,email:`${searchToken}-legacy@test.example`,branchId:ctx.ids.branchId});
   const wrongBranchCode=await ctx.roster({name:`Directory ${suffix} wrong mapping`,email:`${searchToken}-wrong@test.example`,registrationNumber:await ctx.uniqueOfficialRegistration('AI','24'),branchId:ctx.ids.branchId});
   const ece2024=await ctx.roster({name:`Directory ${suffix} ECE 24`,email:`${searchToken}-ece24@test.example`,registrationNumber:await ctx.uniqueOfficialRegistration('EC','24'),branchId:ctx.ids.eceBranchId});
   const account=await ctx.signUp(cse2024);assert.equal(account.response.status,201,JSON.stringify(account.data));

   const firstDrive=await ctx.makeDrive({role:`Directory role one ${suffix}`,branchIds:[ctx.ids.branchId]});
   const secondDrive=await ctx.makeDrive({role:`Directory role two ${suffix}`,branchIds:[ctx.ids.branchId]});
   const appOne=await ctx.pool.query(`INSERT INTO applications(student_id,drive_id,status,eligibility_snapshot) VALUES($1,$2,'offered','{}'::jsonb) RETURNING application_id`,[cse2024.studentId,firstDrive]);
   await ctx.pool.query(`INSERT INTO applications(student_id,drive_id,status,eligibility_snapshot) VALUES($1,$2,'applied','{}'::jsonb)`,[cse2024.studentId,secondDrive]);
   await ctx.pool.query(`INSERT INTO offers(application_id,package_lpa,status) VALUES($1,8.50,'accepted')`,[appOne.rows[0].application_id]);

   const login=await ctx.request('/auth/login',{method:'POST',body:{email:ctx.officerEmail,password:ctx.officerPass,expectedRole:'placement_officer'}});const cookie=ctx.cookieFrom(login.response);
   const all=await ctx.request(`/officer/students?q=${encodeURIComponent(searchToken)}`,{cookie});
   assert.equal(all.response.status,200,JSON.stringify(all.data));assert.equal(all.data.total,6);assert.equal(all.data.students.length,6);
   const cse=all.data.byDepartment.find(department=>department.branch_code==='CSE');
   const ece=all.data.byDepartment.find(department=>department.branch_code==='ECE');
   assert.deepEqual([cse.students,cse.active_students,cse.intake_2024,cse.intake_2025,cse.registered_accounts,cse.not_registered,cse.students_with_active_backlogs,cse.applications,cse.accepted_offers],[5,5,2,1,1,4,1,2,1]);
   assert.deepEqual([ece.students,ece.intake_2024,ece.intake_2025],[1,1,0]);
   assert.deepEqual([all.data.overall.students,all.data.overall.active_students,all.data.overall.intake_2024,all.data.overall.intake_2025,all.data.overall.registered_accounts,all.data.overall.not_registered,all.data.overall.students_with_active_backlogs,all.data.overall.applications,all.data.overall.accepted_offers],[6,6,3,1,1,5,1,2,1]);
   const misplaced=all.data.students.find(student=>student.registration_number===wrongBranchCode.registrationNumber);
   assert.ok(misplaced);assert.equal(misplaced.branch_code,'CSE');assert.equal(misplaced.intake_year,null,'A valid registration code cannot override the canonical database branch.');
   assert.equal(all.data.students.find(student=>student.registration_number===cseLegacy.registrationNumber).intake_year,null,'Legacy DEMO IDs have no inferred intake cohort.');

   const combined=await ctx.request(`/officer/students?q=${encodeURIComponent(searchToken)}&branchCode=CSE&intakeYear=2024&accountStatus=not_registered`,{cookie});
   assert.equal(combined.response.status,200);assert.equal(combined.data.total,1);assert.equal(combined.data.students[0].student_id,cse2024Backlog.studentId);
   assert.deepEqual([combined.data.byDepartment[0].intake_2024,combined.data.byDepartment[0].intake_2025,combined.data.overall.students],[1,0,1]);
   const emailSearch=await ctx.request(`/officer/students?q=${encodeURIComponent(cse2025.email.toUpperCase())}`,{cookie});
   assert.equal(emailSearch.data.total,1);assert.equal(emailSearch.data.students[0].student_id,cse2025.studentId);
   const emptyDepartment=await ctx.request(`/officer/students?q=${encodeURIComponent(searchToken)}&branchCode=CSE-AIML`,{cookie});
   assert.equal(emptyDepartment.data.total,0);assert.equal(emptyDepartment.data.students.length,0);
   assert.equal(emptyDepartment.data.byDepartment.length,1);assert.equal(emptyDepartment.data.byDepartment[0].branch_name,'Computer Science and Engineering (Artificial Intelligence and Machine Learning)');
   assert.equal(emptyDepartment.data.byDepartment[0].students,0);
   const paged=await ctx.request(`/officer/students?q=${encodeURIComponent(searchToken)}&limit=1&offset=0`,{cookie});
   assert.equal(paged.data.students.length,1);assert.equal(paged.data.total,6);assert.equal(paged.data.overall.students,6,'Department totals cover all filtered records, not only the current page.');
  });

  await t.test('K-Means officer API enforces role access, sends only feature fields, maps authorized roster members, and handles outage',async(t)=>{
   const first=await ctx.roster({name:'Grouping Contract Student A',cgpa:9.1,backlogs:0});
   const second=await ctx.roster({name:'Grouping Contract Student B',cgpa:6.4,backlogs:2});
   await ctx.roster({name:'Grouping Contract Student C',cgpa:8.2,backlogs:0});
   await ctx.pool.query('UPDATE students SET resume_text=$1 WHERE student_id=$2',["Python SQL private-resume-text",first.studentId]);
   await ctx.pool.query('UPDATE students SET resume_text=$1 WHERE student_id=$2',["React JavaScript private-resume-text",second.studentId]);
   const jwt=await import('jsonwebtoken');
   const signedCookie=(userId)=>`session=${jwt.default.sign({sub:userId},process.env.JWT_SECRET,{expiresIn:'8h',issuer:'scem-placement-api',audience:'scem-placement-portal'})}`;
   const officerCookie=signedCookie(ctx.ids.officerId);
   const studentEmail=`grouping-student-${randomUUID()}@test.example`;ctx.emails.push(studentEmail);
   const unauthorizedUser=await ctx.pool.query("INSERT INTO users(name,email,password_hash,role) VALUES('Grouping Unauthorized Student',$1,'test-only-hash','student') RETURNING user_id",[studentEmail]);
   const studentCookie=signedCookie(unauthorizedUser.rows[0].user_id);
   assert.equal((await ctx.request('/officer/student-groups')).response.status,401);
   assert.equal((await ctx.request('/officer/student-groups',{cookie:studentCookie})).response.status,403);

   let receivedProfiles=null;
   const service=createServer((request,response)=>{
    let body='';request.setEncoding('utf8');request.on('data',chunk=>body+=chunk);request.on('end',()=>{
     const payload=JSON.parse(body);receivedProfiles=payload.profiles;
     const memberIndices=[[],[]];
     payload.profiles.forEach((_,index)=>memberIndices[index%2].push(index));
     const clusters=memberIndices.map((indices,index)=>({cluster_id:`C${index}`,student_count:indices.length,member_indices:indices,
      average_cgpa:index===0?8.1:6.4,average_active_backlogs:index===0?0:2,common_skills:[{skill:index===0?'Python':'React',student_count:indices.length,proportion:1}],profile_summary:'Contract-test group summary'}));
     response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify({algorithm:'k-means',model_version:'contract-test',status:'ok',generated_at:new Date().toISOString(),feature_configuration:'contract',total_records:payload.profiles.length,included_records:payload.profiles.length,excluded_records:0,exclusion_summary:[],selected_cluster_count:2,selection_metric:'silhouette',silhouette_score:0.42,assignments:payload.profiles.map((_,index)=>({record_index:index,cluster_id:`C${index%2}`})),clusters}));
    });
   });
   await new Promise((resolve,reject)=>{service.once('listening',resolve);service.once('error',reject);service.listen(0,'127.0.0.1');});
   const previousService=process.env.AI_SERVICE_URL;
   try{
    process.env.AI_SERVICE_URL=`http://127.0.0.1:${service.address().port}`;
    const grouped=await ctx.request('/officer/student-groups',{method:'POST',cookie:officerCookie,body:{}});
    assert.equal(grouped.response.status,200,JSON.stringify(grouped.data));
    assert.ok(Array.isArray(receivedProfiles)&&receivedProfiles.length>2);
    assert.deepEqual(Object.keys(receivedProfiles[0]).sort(),['active_backlogs','cgpa','resume_text']);
    assert.equal(JSON.stringify(receivedProfiles).includes(first.registrationNumber),false);
    assert.equal(JSON.stringify(receivedProfiles).includes(first.email),false);
    assert.equal(JSON.stringify(receivedProfiles).includes(first.name),false);
    const mapped=grouped.data.clusters.flatMap(cluster=>cluster.students);
    assert.ok(mapped.some(profile=>profile.student_id===first.studentId));
    assert.ok(mapped.some(profile=>profile.student_id===second.studentId));
    assert.ok(mapped.every(profile=>!Object.hasOwn(profile,'resume_text')&&!Object.hasOwn(profile,'contact_email')));
    assert.equal(grouped.data.assignments,undefined);
   }finally{
    process.env.AI_SERVICE_URL=previousService;
    await new Promise(resolve=>service.close(resolve));
   }
   process.env.AI_SERVICE_URL='http://127.0.0.1:1';
   const unavailable=await ctx.request('/officer/student-groups',{method:'POST',cookie:officerCookie,body:{}});
   assert.equal(unavailable.response.status,503);assert.match(unavailable.data.error,/unavailable/i);
   process.env.AI_SERVICE_URL=previousService;
   if(process.env.TEST_AI_SERVICE_URL){
    const inferred=await ctx.request('/officer/student-groups',{method:'POST',cookie:officerCookie,body:{}});
    assert.equal(inferred.response.status,200,JSON.stringify(inferred.data));
    assert.equal(inferred.data.algorithm,'k-means');
    assert.ok(['ok','insufficient_data'].includes(inferred.data.status));
    assert.equal(inferred.data.total_records,inferred.data.included_records+inferred.data.excluded_records);
    t.diagnostic(inferred.data.status==='ok'
     ? `Actual FastAPI K-Means run on ${inferred.data.total_records} test-roster rows: ${inferred.data.included_records} included, ${inferred.data.excluded_records} excluded, k=${inferred.data.selected_cluster_count}, silhouette=${inferred.data.silhouette_score}.`
     : `Actual FastAPI K-Means run on ${inferred.data.total_records} test-roster rows returned insufficient_data: ${inferred.data.reason}`);
    if(inferred.data.status==='ok'){
     const members=inferred.data.clusters.flatMap(cluster=>cluster.students);
     assert.equal(members.length,inferred.data.included_records);
     assert.ok(members.some(profile=>profile.student_id===first.studentId));
     assert.ok(members.some(profile=>profile.student_id===second.studentId));
     assert.ok(members.every(profile=>!Object.hasOwn(profile,'resume_text')&&!Object.hasOwn(profile,'contact_email')));
     assert.ok(inferred.data.silhouette_score>=-1&&inferred.data.silhouette_score<=1);
    }
   }
  });

  await t.test('canonical XLSX template is empty, correctly headed, and matches the in-app download',async()=>{
   const login=await ctx.request('/auth/login',{method:'POST',body:{email:ctx.officerEmail,password:ctx.officerPass}});const cookie=ctx.cookieFrom(login.response);
   const response=await ctx.downloadTemplate(cookie);assert.equal(response.status,200);
   assert.match(response.headers.get('content-type'),/application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
   assert.match(response.headers.get('content-disposition'),/SCEM_Student_Roster_Import_Template_4SF_Format\.xlsx/);
   const bytes=Buffer.from(await response.arrayBuffer());
   const canonical=await readFile(join(root,'..','database','templates','SCEM_Student_Roster_Import_Template_4SF_Format.xlsx'));
   assert.deepEqual(bytes,canonical);
   const workbook=new (await import('exceljs')).default.Workbook();await workbook.xlsx.load(bytes);
   assert.deepEqual(workbook.worksheets.map(sheet=>sheet.name),['Roster Import','Department Summary','Instructions','Registration Format Guide']);
   const rosterSheet=workbook.getWorksheet('Roster Import');
   assert.deepEqual(rosterSheet.getRow(1).values.slice(1),['registration_number','full_name','branch_code','cgpa','active_backlogs','graduation_year','email','phone']);
   assert.equal(rosterSheet.actualRowCount,1,'The import sheet must contain only the required headers.');
   const summarySheet=workbook.getWorksheet('Department Summary');
   assert.equal(summarySheet.getCell('D9').value.formula,'SUM(D3:D8)');
   assert.equal(summarySheet.getCell('D9').value.result??0,0,'Blank template summary must reconcile with its empty import sheet.');
   assert.deepEqual([summarySheet.getCell('E9').value.result??0,summarySheet.getCell('F9').value.result??0,summarySheet.getCell('G9').value.result??0],[0,0,0]);
   const guideValues=workbook.getWorksheet('Registration Format Guide').getSheetValues().flat().filter(value=>value!=null);
   assert.ok(guideValues.includes(4)&&guideValues.includes(2),'Illustrative cohort counts belong on the guide sheet.');
   assert.ok(guideValues.includes('RE')&&guideValues.includes('unresolved'));
  });

  await t.test('fictional demo roster downloads match the generated CSV and XLSX datasets',async()=>{
   const login=await ctx.request('/auth/login',{method:'POST',body:{email:ctx.officerEmail,password:ctx.officerPass}});const cookie=ctx.cookieFrom(login.response);
   const xlsxResponse=await ctx.downloadDemoRoster(cookie,'xlsx');assert.equal(xlsxResponse.status,200);
   assert.match(xlsxResponse.headers.get('content-disposition'),/SCEM_Fictional_Demo_Student_Roster_4SF\.xlsx/);
   const xlsxBytes=Buffer.from(await xlsxResponse.arrayBuffer());
   const localXlsx=await readFile(join(root,'..','database','templates','SCEM_Fictional_Demo_Student_Roster_4SF.xlsx'));
   assert.deepEqual(xlsxBytes,localXlsx);
   const workbook=new (await import('exceljs')).default.Workbook();await workbook.xlsx.load(xlsxBytes);
   const roster=workbook.getWorksheet('Roster Import');const summary=workbook.getWorksheet('Department Summary');
   assert.equal(roster.actualRowCount,31,'The fictional dataset contains 30 importable demo rows plus the header.');
   assert.equal(roster.getCell('A2').value,'4SF24IS001');assert.equal(roster.getCell('A2').numFmt,'@');
   assert.equal(summary.getCell('D9').value.result,30);assert.equal(summary.getCell('E9').value.result,20);assert.equal(summary.getCell('F9').value.result,10);assert.equal(summary.getCell('G9').value.result??0,0);
   const csvResponse=await ctx.downloadDemoRoster(cookie,'csv');assert.equal(csvResponse.status,200);
   const csv=await csvResponse.text();const localCsv=await readFile(join(root,'..','database','templates','SCEM_Fictional_Demo_Student_Roster_4SF.csv'),'utf8');
   assert.equal(csv,localCsv);assert.equal(csv.trim().split(/\r?\n/).length,31);
   const invalidFormat=await ctx.downloadDemoRoster(cookie,'pdf');assert.equal(invalidFormat.status,400);
  });

  await t.test('XLSX imports accept valid records; malformed headers and expired previews fail safely',async()=>{
   const login=await ctx.request('/auth/login',{method:'POST',body:{email:ctx.officerEmail,password:ctx.officerPass}});const cookie=ctx.cookieFrom(login.response);
   const ExcelJS=(await import('exceljs')).default;const workbook=new ExcelJS.Workbook();const workbookRegistration=await ctx.uniqueOfficialRegistration('IS','25');ctx.registrationNumbers.push(workbookRegistration);const sheet=workbook.addWorksheet('Students');sheet.addRows([
    ['registration_number','full_name','branch_code','cgpa','active_backlogs','graduation_year','email','phone'],
    [workbookRegistration.toLowerCase(),'Workbook Student','ISE',8.7,0,2027,'workbook.student@test.example','']
   ]);const bytes=Buffer.from(await workbook.xlsx.writeBuffer());
   const form=new FormData();form.append('file',new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),'students.xlsx');const preview=await ctx.request('/officer/students/import/preview',{method:'POST',cookie,body:form});assert.equal(preview.response.status,201);ctx.importIds.push(preview.data.importId);
   const confirmed=await ctx.request('/officer/students/import/confirm',{method:'POST',cookie,body:{importId:preview.data.importId}});assert.equal(confirmed.response.status,200);assert.equal(confirmed.data.summary.insertedRows,1);
   const missing=await ctx.uploadCsv(cookie,'missing.csv','registration_number,full_name\nX,Student\n');assert.equal(missing.response.status,400);
   const expiringRegistration=await ctx.uniqueOfficialRegistration('CS','25');const expiring=await ctx.uploadCsv(cookie,'expiry.csv',`registration_number,full_name,branch_code,cgpa,active_backlogs,graduation_year,email,phone\n${expiringRegistration},Expiry Student,CSE,8,0,2027,expiry-${randomUUID()}@test.example,\n`);assert.equal(expiring.response.status,201);ctx.importIds.push(expiring.data.importId);
   await ctx.pool.query("UPDATE student_imports SET preview_expires_at=now()-interval '1 minute' WHERE import_id=$1",[expiring.data.importId]);
   const expired=await ctx.request('/officer/students/import/confirm',{method:'POST',cookie,body:{importId:expiring.data.importId}});assert.equal(expired.response.status,410);
  });

  await t.test('PostgreSQL constraints reject invalid and duplicate records while accepting GPA 10.00',async()=>{
   const perfect=await ctx.roster({name:'Perfect GPA Applicant',cgpa:10});
   const insertStudent=`INSERT INTO students(registration_number,full_name,branch_id,cgpa,active_backlogs,graduation_year,contact_email) VALUES($1,'Constraint Applicant',$2,$3,$4,2027,$5)`;
   await assert.rejects(ctx.pool.query(insertStudent,[perfect.registrationNumber,ctx.ids.branchId,8,0,`dup-${randomUUID()}@test.example`]),{code:'23505'});
   await assert.rejects(ctx.pool.query(insertStudent,[perfect.registrationNumber.toLowerCase(),ctx.ids.branchId,8,0,`case-${randomUUID()}@test.example`]),{code:'23505'});
   await assert.rejects(ctx.pool.query(insertStudent,[`  ${perfect.registrationNumber.toLowerCase()}  `,ctx.ids.branchId,8,0,`trim-${randomUUID()}@test.example`]),{code:'23505'});
   await assert.rejects(ctx.pool.query(insertStudent,[`LOW${randomUUID()}`,ctx.ids.branchId,-0.01,0,`low-${randomUUID()}@test.example`]),{code:'23514'});
   await assert.rejects(ctx.pool.query(insertStudent,[`HIGH${randomUUID()}`,ctx.ids.branchId,10.01,0,`high-${randomUUID()}@test.example`]),{code:'23514'});
   await assert.rejects(ctx.pool.query(insertStudent,[`BACK${randomUUID()}`,ctx.ids.branchId,8,-1,`back-${randomUUID()}@test.example`]),{code:'23514'});
   await assert.rejects(ctx.pool.query(insertStudent,[`FK${randomUUID()}`,randomUUID(),8,0,`fk-${randomUUID()}@test.example`]),{code:'23503'});
   await assert.rejects(ctx.pool.query("INSERT INTO users(name,email,password_hash,role) VALUES('Invalid Role',$1,'test-only-hash','admin')",[`role-${randomUUID()}@test.example`]),{code:'23514'});
   await assert.rejects(ctx.pool.query('INSERT INTO companies(company_name) VALUES($1)',[null]),{code:'23502'});
   await assert.rejects(ctx.pool.query('INSERT INTO companies(company_name) SELECT company_name FROM companies WHERE company_id=$1',[ctx.ids.companyId]),{code:'23505'});
   const perfectDrive=await ctx.makeDrive({role:'Perfect GPA Role',minimumCgpa:10});
   const application=await ctx.pool.query("INSERT INTO applications(student_id,drive_id,status,eligibility_snapshot) VALUES($1,$2,'applied',$3) RETURNING application_id",[perfect.studentId,perfectDrive,JSON.stringify({eligible:true})]);
   await assert.rejects(ctx.pool.query("INSERT INTO applications(student_id,drive_id,status,eligibility_snapshot) VALUES($1,$2,'applied',$3)",[perfect.studentId,perfectDrive,JSON.stringify({eligible:true})]),{code:'23505'});
   await assert.rejects(ctx.pool.query("UPDATE applications SET status='not-a-status' WHERE application_id=$1",[application.rows[0].application_id]),{code:'23514'});
   await assert.rejects(ctx.pool.query("INSERT INTO job_drives(company_id,role,job_description,application_deadline,status) VALUES($1,'Invalid Status','Valid description long enough for a record',now()+interval '1 day','not-a-status')",[ctx.ids.companyId]),{code:'23514'});
   await assert.rejects(ctx.pool.query("INSERT INTO job_drives(company_id,role,job_description,application_deadline,status) VALUES($1,'Invalid Foreign Key','Valid description long enough for a record',now()+interval '1 day','draft')",[randomUUID()]),{code:'23503'});
   const check=await ctx.pool.query('SELECT cgpa FROM students WHERE student_id=$1',[perfect.studentId]);assert.equal(Number(check.rows[0].cgpa),10);
  });

  await t.test('multi-step transactions commit atomically and rollback leaves the original value',async()=>{
   const student=await ctx.roster({name:'Transaction Student',cgpa:8.25});
   const transactionSuffix=randomUUID().replaceAll('-','');
   const client=await ctx.pool.connect();
   try{
    const committedCompanyName=`Committed Transaction Company ${transactionSuffix}`;
    await client.query('BEGIN');
    const company=await client.query('INSERT INTO companies(company_name) VALUES($1) RETURNING company_id',[committedCompanyName]);
    const drive=await client.query(`INSERT INTO job_drives(company_id,role,job_description,application_deadline,status,created_by)
      VALUES($1,'Committed Transaction Role','A transactionally created demonstration role',now()+interval '7 days','draft',$2) RETURNING drive_id`,[company.rows[0].company_id,ctx.ids.officerId]);
    await client.query('COMMIT');ctx.companyIds.push(company.rows[0].company_id);ctx.driveIds.push(drive.rows[0].drive_id);
    const committed=await client.query('SELECT c.company_id,d.drive_id FROM companies c JOIN job_drives d USING(company_id) WHERE c.company_name=$1',[committedCompanyName]);assert.equal(committed.rowCount,1);

    const failedCompanyName=`Rolled Back Transaction Company ${transactionSuffix}`;
    await client.query('BEGIN');
    await client.query('INSERT INTO companies(company_name) VALUES($1)',[failedCompanyName]);
    await client.query("INSERT INTO job_drives(company_id,role,job_description,application_deadline,status) SELECT company_id,'Broken Role','This row must roll back with its parent',now()+interval '7 days','invalid' FROM companies WHERE company_name=$1",[failedCompanyName]).then(()=>assert.fail('Invalid status should fail')).catch(error=>assert.equal(error.code,'23514'));
    await client.query('ROLLBACK');
    const rolledBack=await client.query('SELECT 1 FROM companies WHERE company_name=$1',[failedCompanyName]);assert.equal(rolledBack.rowCount,0);

    await client.query('BEGIN');await client.query('UPDATE students SET cgpa=9.99 WHERE student_id=$1',[student.studentId]);await client.query('ROLLBACK');
    const unchanged=await client.query('SELECT cgpa FROM students WHERE student_id=$1',[student.studentId]);assert.equal(Number(unchanged.rows[0].cgpa),8.25);
   }finally{client.release();}
  });

  await t.test('database timestamp trigger updates direct SQL writes',async()=>{
   const student=await ctx.roster({name:'Trigger Student'});
   const {rows:before}=await ctx.pool.query('SELECT updated_at FROM students WHERE student_id=$1',[student.studentId]);
   const {rows:after}=await ctx.pool.query("UPDATE students SET updated_at='2000-01-01T00:00:00Z' WHERE student_id=$1 RETURNING updated_at",[student.studentId]);
   assert.ok(new Date(after[0].updated_at)>new Date(before[0].updated_at));
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
   const noOfficerRejectConfirmation=await ctx.request(`/officer/applications/${applied.data.applicationId}/status`,{method:'PATCH',cookie:officerCookie,body:{status:'rejected'}});assert.equal(noOfficerRejectConfirmation.response.status,400);
   const officerReject=await ctx.request(`/officer/applications/${applied.data.applicationId}/status`,{method:'PATCH',cookie:officerCookie,body:{status:'rejected',confirmed:true}});assert.equal(officerReject.response.status,200);
   const officerRoundWhileRejected=await ctx.request(`/officer/applications/${applied.data.applicationId}/rounds`,{method:'POST',cookie:officerCookie,body:{roundName:'Interview',requestId:randomUUID()}});assert.equal(officerRoundWhileRejected.response.status,409);assert.match(officerRoundWhileRejected.data.error,/reopen/i);assert.equal((await ctx.pool.query('SELECT status FROM applications WHERE application_id=$1',[applied.data.applicationId])).rows[0].status,'rejected');
   const officerReopen=await ctx.request(`/officer/applications/${applied.data.applicationId}/status`,{method:'PATCH',cookie:officerCookie,body:{status:'under_review'}});assert.equal(officerReopen.response.status,200);
   const officerRoundAfterReopen=await ctx.request(`/officer/applications/${applied.data.applicationId}/rounds`,{method:'POST',cookie:officerCookie,body:{roundName:'Officer Interview',requestId:randomUUID()}});assert.equal(officerRoundAfterReopen.response.status,201);
   const shortlist=await ctx.request(`/officer/applications/${applied.data.applicationId}/status`,{method:'PATCH',cookie:officerCookie,body:{status:'shortlisted'}});assert.equal(shortlist.response.status,200);
   const offer=await ctx.request(`/officer/applications/${applied.data.applicationId}/offers`,{method:'POST',cookie:officerCookie,body:{packageLpa:8.2}});assert.equal(offer.response.status,201);
   const current=await ctx.pool.query('SELECT status FROM applications WHERE application_id=$1',[applied.data.applicationId]);assert.equal(current.rows[0].status,'offered');
   const history=await ctx.request('/students/me/applications',{cookie:account.cookie});assert.equal(history.response.status,200);assert.equal(history.data.applications.find(x=>x.application_id===applied.data.applicationId).offer_status,'pending');
   const otherStudent=await ctx.roster({name:'Different Student'});const otherAccount=await ctx.signUp(otherStudent);
   const ownerGuard=await ctx.request(`/students/me/offers/${applied.data.applicationId}`,{method:'PATCH',cookie:otherAccount.cookie,body:{status:'accepted'}});assert.equal(ownerGuard.response.status,404);
   const badStatus=await ctx.request(`/students/me/offers/${applied.data.applicationId}`,{method:'PATCH',cookie:account.cookie,body:{status:'withdrawn'}});assert.equal(badStatus.response.status,400);
   const accepted=await ctx.request(`/students/me/offers/${applied.data.applicationId}`,{method:'PATCH',cookie:account.cookie,body:{status:'accepted'}});assert.equal(accepted.response.status,200);assert.equal(accepted.data.offer.status,'accepted');
   const repeated=await ctx.request(`/students/me/offers/${applied.data.applicationId}`,{method:'PATCH',cookie:account.cookie,body:{status:'declined'}});assert.equal(repeated.response.status,404);
   const persisted=await ctx.pool.query('SELECT status FROM offers WHERE application_id=$1',[applied.data.applicationId]);assert.equal(persisted.rows[0].status,'accepted');
   const declineDrive=await ctx.makeDrive({role:'Decline Offer Role'});
   const declineApplication=await ctx.request(`/drives/${declineDrive}/applications`,{method:'POST',cookie:account.cookie,body:{}});assert.equal(declineApplication.response.status,201);
   const declineShortlist=await ctx.request(`/officer/applications/${declineApplication.data.applicationId}/status`,{method:'PATCH',cookie:officerCookie,body:{status:'shortlisted'}});assert.equal(declineShortlist.response.status,200);
   const declineOffer=await ctx.request(`/officer/applications/${declineApplication.data.applicationId}/offers`,{method:'POST',cookie:officerCookie,body:{packageLpa:9.1}});assert.equal(declineOffer.response.status,201);
   const declined=await ctx.request(`/students/me/offers/${declineApplication.data.applicationId}`,{method:'PATCH',cookie:account.cookie,body:{status:'declined'}});assert.equal(declined.response.status,200);assert.equal(declined.data.offer.status,'declined');
  });

  await t.test('recruiter company boundaries, real resume matching, and AI outage handling',async(t)=>{
   const student=await ctx.roster({name:'AI Applicant'});const account=await ctx.signUp(student);const drive=await ctx.makeDrive({role:'Local Matcher Role'});
   await ctx.request('/students/me',{method:'PUT',cookie:account.cookie,body:{resumeText:'Python SQL REST APIs and testing'}});
   const application=await ctx.request(`/drives/${drive}/applications`,{method:'POST',cookie:account.cookie,body:{}});assert.equal(application.response.status,201);
   let matcherAvailable=false;try{matcherAvailable=(await fetch('http://127.0.0.1:8000/health',{signal:AbortSignal.timeout(1000)})).ok;}catch{}
   if(matcherAvailable){
    process.env.AI_SERVICE_URL='http://127.0.0.1:8000';
    const match=await ctx.request(`/ai/match/${drive}`,{method:'POST',cookie:account.cookie,body:{}});
    assert.equal(match.response.status,201,JSON.stringify(match.data));
    assert.ok(match.data.match.similarity_score>0);assert.ok(Array.isArray(match.data.match.matched_skills));
    const savedMatches=await ctx.request(`/ai/matches/${drive}`,{cookie:account.cookie});assert.equal(savedMatches.response.status,200);assert.equal(savedMatches.data.matches.length,1);
   }else t.diagnostic('Actual AI match portion skipped because the local FastAPI service did not answer its health check.');
   process.env.AI_SERVICE_URL='http://127.0.0.1:1';
   const unavailable=await ctx.request(`/ai/match/${drive}`,{method:'POST',cookie:account.cookie,body:{}});assert.equal(unavailable.response.status,503);
   const otherCompany=await ctx.pool.query('INSERT INTO companies(company_name) VALUES($1) RETURNING company_id',[`Other Test Company ${randomUUID()}`]);ctx.companyIds.push(otherCompany.rows[0].company_id);
   const recruiterEmail=`recruiter-${randomUUID()}@test.example`;const pass='recruiter-password-123';const bcrypt=await import('bcryptjs');const user=await ctx.pool.query("INSERT INTO users(name,email,password_hash,role) VALUES('Scoped Recruiter',$1,$2,'recruiter') RETURNING user_id",[recruiterEmail,await bcrypt.default.hash(pass,4)]);ctx.emails.push(recruiterEmail);await ctx.pool.query('INSERT INTO recruiters(user_id,company_id) VALUES($1,$2)',[user.rows[0].user_id,otherCompany.rows[0].company_id]);
   const wrongRoleLogin=await ctx.request('/auth/login',{method:'POST',body:{email:recruiterEmail,password:pass,expectedRole:'student'}});assert.equal(wrongRoleLogin.response.status,403);assert.equal(wrongRoleLogin.response.headers.get('set-cookie'),null);
   const login=await ctx.request('/auth/login',{method:'POST',body:{email:recruiterEmail,password:pass,expectedRole:'recruiter'}});assert.equal(login.response.status,200);assert.equal(login.data.user.role,'recruiter');const cookie=ctx.cookieFrom(login.response);
   const hidden=await ctx.request(`/recruiter/drives/${drive}/applications`,{cookie});assert.equal(hidden.response.status,404);
   const hiddenDrive=await ctx.request(`/drives/${drive}`,{cookie});assert.equal(hiddenDrive.response.status,404);
   const hiddenStatus=await ctx.request(`/recruiter/applications/${application.data.applicationId}/status`,{method:'PATCH',cookie,body:{status:'shortlisted'}});assert.equal(hiddenStatus.response.status,404);
   const hiddenRound=await ctx.request(`/recruiter/applications/${application.data.applicationId}/rounds`,{method:'POST',cookie,body:{roundName:'Screen'}});assert.equal(hiddenRound.response.status,404);
   const ownedDrive=await ctx.makeDrive({companyId:otherCompany.rows[0].company_id,role:'Recruiter Owned Role'});
   const ownedApplication=await ctx.request(`/drives/${ownedDrive}/applications`,{method:'POST',cookie:account.cookie,body:{}});assert.equal(ownedApplication.response.status,201);
   const noRejectConfirmation=await ctx.request(`/recruiter/applications/${ownedApplication.data.applicationId}/status`,{method:'PATCH',cookie,body:{status:'rejected'}});assert.equal(noRejectConfirmation.response.status,400);
   assert.equal((await ctx.pool.query('SELECT status FROM applications WHERE application_id=$1',[ownedApplication.data.applicationId])).rows[0].status,'applied');
   const badRecruiterStatus=await ctx.request(`/recruiter/applications/${ownedApplication.data.applicationId}/status`,{method:'PATCH',cookie,body:{status:'not-a-status'}});assert.equal(badRecruiterStatus.response.status,400);
   const rejected=await ctx.request(`/recruiter/applications/${ownedApplication.data.applicationId}/status`,{method:'PATCH',cookie,body:{status:'rejected',confirmed:true}});assert.equal(rejected.response.status,200);assert.equal(rejected.data.application.status,'rejected');
   const rejectedRound=await ctx.request(`/recruiter/applications/${ownedApplication.data.applicationId}/rounds`,{method:'POST',cookie,body:{roundName:'Attempt while rejected',requestId:randomUUID()}});assert.equal(rejectedRound.response.status,409);assert.match(rejectedRound.data.error,/reopen/i);assert.equal((await ctx.pool.query('SELECT status FROM applications WHERE application_id=$1',[ownedApplication.data.applicationId])).rows[0].status,'rejected');assert.equal((await ctx.pool.query('SELECT count(*)::int count FROM interview_rounds WHERE application_id=$1',[ownedApplication.data.applicationId])).rows[0].count,0);
   const reopened=await ctx.request(`/recruiter/applications/${ownedApplication.data.applicationId}/status`,{method:'PATCH',cookie,body:{status:'under_review'}});assert.equal(reopened.response.status,200);assert.equal(reopened.data.application.status,'under_review');
   const statusHistory=await ctx.pool.query('SELECT previous_status,new_status,changed_by FROM application_status_history WHERE application_id=$1 ORDER BY changed_at',[ownedApplication.data.applicationId]);assert.deepEqual(statusHistory.rows.map(row=>[row.previous_status,row.new_status]),[['applied','rejected'],['rejected','under_review']]);assert.ok(statusHistory.rows.every(row=>row.changed_by===user.rows[0].user_id));
   const blankRound=await ctx.request(`/recruiter/applications/${ownedApplication.data.applicationId}/rounds`,{method:'POST',cookie,body:{roundName:'  ',requestId:randomUUID()}});assert.equal(blankRound.response.status,400);
   const requestId=randomUUID();const repeatedPayload={roundName:'  Technical Interview  ',requestId};const [round,repeatedRound]=await Promise.all([ctx.request(`/recruiter/applications/${ownedApplication.data.applicationId}/rounds`,{method:'POST',cookie,body:repeatedPayload}),ctx.request(`/recruiter/applications/${ownedApplication.data.applicationId}/rounds`,{method:'POST',cookie,body:repeatedPayload})]);assert.deepEqual([round.response.status,repeatedRound.response.status].sort(),[200,201]);const createdRound=round.response.status===201?round:repeatedRound;const replayedRound=round.response.status===200?round:repeatedRound;assert.equal(createdRound.data.created,true);assert.equal(createdRound.data.round.round_name,'Technical Interview');assert.equal(createdRound.data.round.result,'pending');assert.equal(replayedRound.data.created,false);assert.equal(replayedRound.data.round.round_id,createdRound.data.round.round_id);
   const roundRows=await ctx.pool.query('SELECT count(*)::int count FROM interview_rounds WHERE application_id=$1 AND request_id=$2',[ownedApplication.data.applicationId,requestId]);assert.equal(roundRows.rows[0].count,1);
   const duplicateName=await ctx.request(`/recruiter/applications/${ownedApplication.data.applicationId}/rounds`,{method:'POST',cookie,body:{roundName:'  technical   interview ',requestId:randomUUID()}});assert.equal(duplicateName.response.status,409);assert.match(duplicateName.data.error,/already saved/i);
   const numberedRound=await ctx.request(`/recruiter/applications/${ownedApplication.data.applicationId}/rounds`,{method:'POST',cookie,body:{roundName:'Round 1',requestId:randomUUID()}});assert.equal(numberedRound.response.status,201);
   const numberedAlias=await ctx.request(`/recruiter/applications/${ownedApplication.data.applicationId}/rounds`,{method:'POST',cookie,body:{roundName:'r1',requestId:randomUUID()}});assert.equal(numberedAlias.response.status,409);assert.match(numberedAlias.data.error,/Round 1/);
   const distinctRound=await ctx.request(`/recruiter/applications/${ownedApplication.data.applicationId}/rounds`,{method:'POST',cookie,body:{roundName:'Final Interview',requestId:randomUUID()}});assert.equal(distinctRound.response.status,201);
   const refreshed=await ctx.request(`/recruiter/drives/${ownedDrive}/applications`,{cookie});assert.equal(refreshed.response.status,200);const refreshedApp=refreshed.data.applications.find(row=>row.application_id===ownedApplication.data.applicationId);assert.equal(refreshedApp.rounds.length,3);assert.deepEqual(new Set(refreshedApp.rounds.map(item=>item.roundId)).size,3);assert.ok(refreshedApp.rounds.every(item=>item.createdAt));assert.deepEqual(new Set(refreshedApp.rounds.map(item=>item.roundName)),new Set(['Technical Interview','Round 1','Final Interview']));
   const studentMatches=await ctx.request(`/ai/matches/${drive}`,{cookie:account.cookie});assert.equal(studentMatches.response.status,200);assert.equal(studentMatches.data.matches.length,matcherAvailable?1:0);
   if(matcherAvailable){const another=await ctx.roster({name:'Other Match Owner'});const otherAccount=await ctx.signUp(another);const hiddenMatches=await ctx.request(`/ai/matches/${drive}`,{cookie:otherAccount.cookie});assert.equal(hiddenMatches.response.status,200);assert.equal(hiddenMatches.data.matches.length,0);}
  });

  await t.test('officer report summary returns all chart series',async()=>{
   const login=await ctx.request('/auth/login',{method:'POST',body:{email:ctx.officerEmail,password:ctx.officerPass}});const cookie=ctx.cookieFrom(login.response);
   const summary=await ctx.request('/officer/reports/summary',{cookie});assert.equal(summary.response.status,200,JSON.stringify(summary.data));
   assert.ok(Array.isArray(summary.data.byBranch));assert.ok(Array.isArray(summary.data.byCompany));assert.ok(Array.isArray(summary.data.applicationsByMonth));
   assert.equal(summary.data.applicationsByMonth.length,12,'The monthly series should cover the current and prior eleven calendar months.');
   assert.equal(new Set(summary.data.applicationsByMonth.map(row=>row.month)).size,12,'Each calendar month should appear once.');
   for(const row of summary.data.applicationsByMonth){assert.equal(typeof row.month,'string');assert.ok(Number.isInteger(row.count)&&row.count>=0);}
   for(const row of summary.data.byBranch){assert.ok(Number.isInteger(row.accepted_offers)&&row.accepted_offers>=0);for(const key of ['students','registration_records','registered_accounts','applications','offers','intake_2024_registrations','intake_2025_registrations'])assert.ok(Number.isInteger(row[key])&&row[key]>=0,`${row.branch_code}.${key}`);}
   assert.deepEqual(summary.data.registrationPolicy.departments.filter(row=>row.mappingStatus==='unresolved').map(row=>row.registrationCode),['RE']);
   const actual=await ctx.pool.query(`SELECT b.branch_code,
    count(DISTINCT s.student_id)::int students,
    count(DISTINCT s.student_id) FILTER(WHERE NULLIF(btrim(s.registration_number),'') IS NOT NULL)::int registration_records,
    count(DISTINCT s.student_id) FILTER(WHERE s.user_id IS NOT NULL)::int registered_accounts,
    count(DISTINCT a.application_id)::int applications,
    count(DISTINCT o.offer_id)::int offers
    FROM branches b LEFT JOIN students s USING(branch_id) LEFT JOIN applications a USING(student_id) LEFT JOIN offers o USING(application_id)
    GROUP BY b.branch_id ORDER BY b.branch_code`);
   for(const expected of actual.rows){const reported=summary.data.byBranch.find(row=>row.branch_code===expected.branch_code);assert.ok(reported,`Missing branch ${expected.branch_code}`);for(const key of ['students','registration_records','registered_accounts','applications','offers'])assert.equal(reported[key],expected[key],`${expected.branch_code}.${key} must reconcile with PostgreSQL rows.`);}
  });

  await t.test('password recovery is generic, role-preserving, one-time, and session-revoking',async()=>{
   const emailService=await import('../src/services/passwordResetEmail.js');
   const tokens=await import('../src/security/passwordResetTokens.js');
   const bcrypt=await import('bcryptjs');
   const genericMessage='If an account matches this email address, password reset instructions may arrive shortly if email delivery is available.';
   const missingConfigKnown=await ctx.request('/auth/password-reset/request',{method:'POST',body:{email:ctx.officerEmail}});
   const missingConfigUnknown=await ctx.request('/auth/password-reset/request',{method:'POST',body:{email:`unknown-${randomUUID()}@test.example`}});
   assert.equal(missingConfigKnown.response.status,202);assert.deepEqual(missingConfigKnown.data,{message:genericMessage});
   assert.deepEqual(missingConfigUnknown.data,missingConfigKnown.data);
   assert.equal((await ctx.pool.query('SELECT count(*)::int count FROM password_reset_tokens')).rows[0].count,0,'Missing SMTP configuration must not create a reset token.');

   const student=await ctx.roster({name:'Password Reset Student'});const studentAccount=await ctx.signUp(student);
   const recruiterEmail=`reset-recruiter-${randomUUID()}@test.example`;const recruiterOldPassword='recruiter-old-password-123';
   const recruiterUser=await ctx.pool.query("INSERT INTO users(name,email,password_hash,role) VALUES('Password Reset Recruiter',$1,$2,'recruiter') RETURNING user_id",[recruiterEmail,await bcrypt.default.hash(recruiterOldPassword,4)]);
   ctx.emails.push(recruiterEmail);
    const expiredTokenEmail=`expired-reset-${randomUUID()}@test.example`;
    const expiredTokenUser=await ctx.pool.query("INSERT INTO users(name,email,password_hash,role) VALUES('Expired Token Fixture',$1,$2,'student') RETURNING user_id",[expiredTokenEmail,await bcrypt.default.hash('unused-fixture-password',4)]);
    ctx.emails.push(expiredTokenEmail);
   const studentOldSession=studentAccount.cookie;
   const officerLogin=await ctx.request('/auth/login',{method:'POST',body:{email:ctx.officerEmail,password:ctx.officerPass,expectedRole:'placement_officer'}});
   assert.equal(officerLogin.response.status,200);const officerOldSession=ctx.cookieFrom(officerLogin.response);
   const recruiterLogin=await ctx.request('/auth/login',{method:'POST',body:{email:recruiterEmail,password:recruiterOldPassword,expectedRole:'recruiter'}});
   assert.equal(recruiterLogin.response.status,200);const recruiterOldSession=ctx.cookieFrom(recruiterLogin.response);

   const deliveries=[];let failAddress=null;
   const restoreSender=emailService.setPasswordResetEmailSenderForTests(async({to,token})=>{
    if(to===failAddress){failAddress=null;const error=new Error(`private smtp details token=${token} recipient=${to}`);error.code='EAUTH';throw error;}
    deliveries.push({to,token});
   });
   try{
    const badEmail=await ctx.request('/auth/password-reset/request',{method:'POST',body:{email:'not an email'}});
    assert.equal(badEmail.response.status,400);assert.deepEqual(badEmail.data,{error:'Enter a valid email address.'});
    const roleInjection=await ctx.request('/auth/password-reset/request',{method:'POST',body:{email:student.email,role:'placement_officer'}});
    assert.equal(roleInjection.response.status,400);

    const roleRequests=[];
    for(const email of [`  ${student.email.toUpperCase()}  `,ctx.officerEmail,recruiterEmail]){
     const result=await ctx.request('/auth/password-reset/request',{method:'POST',body:{email}});
     assert.equal(result.response.status,202);assert.deepEqual(result.data,{message:genericMessage});roleRequests.push(result.data);
     assert.equal(JSON.stringify(result.data).includes(email.trim()),false);
    }
    await emailService.waitForPasswordResetEmailJobsForTests();
    assert.deepEqual(deliveries.map(item=>item.to).sort(),[student.email,ctx.officerEmail,recruiterEmail].sort());
    assert.deepEqual(roleRequests[0],roleRequests[1]);assert.deepEqual(roleRequests[1],roleRequests[2]);

    const noAccount=await ctx.request('/auth/password-reset/request',{method:'POST',body:{email:`not-present-${randomUUID()}@test.example`}});
    assert.equal(noAccount.response.status,202);assert.deepEqual(noAccount.data,roleRequests[0]);
    assert.equal(deliveries.length,3,'Unknown addresses must not receive messages.');

    const studentToken=deliveries.find(item=>item.to===student.email).token;
    const storedStudentToken=await ctx.pool.query('SELECT token_hash,expires_at>now() AS unexpired FROM password_reset_tokens WHERE user_id=(SELECT user_id FROM users WHERE email=$1) ORDER BY created_at DESC LIMIT 1',[student.email]);
    assert.equal(storedStudentToken.rows[0].token_hash,tokens.hashPasswordResetToken(studentToken));
    assert.equal(storedStudentToken.rows[0].unexpired,true);
    assert.equal(JSON.stringify(roleRequests[0]).includes(studentToken),false);

    const expiredToken=tokens.createPasswordResetToken();
    await ctx.pool.query(`INSERT INTO password_reset_tokens(user_id,token_hash,created_at,expires_at)
     VALUES($1,$2,now()-interval '2 hours',now()-interval '1 hour')`,[expiredTokenUser.rows[0].user_id,tokens.hashPasswordResetToken(expiredToken)]);
    const malformed=await ctx.request('/auth/password-reset/confirm',{method:'POST',body:{token:'bad',password:'new-password-456'}});
    assert.equal(malformed.response.status,400);assert.equal(malformed.data.error,'This password reset link is invalid or has expired. Request a new link.');
    const unknownToken=tokens.createPasswordResetToken();
    const unknown=await ctx.request('/auth/password-reset/confirm',{method:'POST',body:{token:unknownToken,password:'new-password-456'}});
    assert.equal(unknown.response.status,400);assert.equal(unknown.data.error,malformed.data.error);
    const expired=await ctx.request('/auth/password-reset/confirm',{method:'POST',body:{token:expiredToken,password:'new-password-456'}});
    assert.equal(expired.response.status,400);assert.equal(expired.data.error,malformed.data.error);

    const studentNewPassword='student-new-password-456';
    const studentChanged=await ctx.request('/auth/password-reset/confirm',{method:'POST',body:{token:studentToken,password:studentNewPassword}});
    assert.equal(studentChanged.response.status,200);assert.equal(studentChanged.data.message,'Your password has been reset. You can now sign in with your new password.');
    assert.equal(studentChanged.response.headers.get('set-cookie'),null);
    assert.equal((await ctx.request('/auth/me',{cookie:studentOldSession})).response.status,401);
    assert.equal((await ctx.request('/auth/login',{method:'POST',body:{email:student.email,password:'student-password-123',expectedRole:'student'}})).response.status,401);
    const studentNewLogin=await ctx.request('/auth/login',{method:'POST',body:{email:student.email,password:studentNewPassword,expectedRole:'student'}});
    assert.equal(studentNewLogin.response.status,200);assert.equal(studentNewLogin.data.user.role,'student');
    const studentStored=await ctx.pool.query('SELECT u.password_hash,u.role FROM users u JOIN students s USING(user_id) WHERE s.student_id=$1',[student.studentId]);
    assert.equal(studentStored.rows[0].role,'student');assert.notEqual(studentStored.rows[0].password_hash,studentNewPassword);
    assert.equal(await bcrypt.default.compare(studentNewPassword,studentStored.rows[0].password_hash),true);
    const reused=await ctx.request('/auth/password-reset/confirm',{method:'POST',body:{token:studentToken,password:'another-new-password-789'}});
    assert.equal(reused.response.status,400);assert.equal(reused.data.error,malformed.data.error);

    const officerToken=deliveries.find(item=>item.to===ctx.officerEmail).token;
    const officerNewPassword='officer-new-password-456';
    const officerChanged=await ctx.request('/auth/password-reset/confirm',{method:'POST',body:{token:officerToken,password:officerNewPassword}});
    assert.equal(officerChanged.response.status,200);assert.equal((await ctx.request('/auth/me',{cookie:officerOldSession})).response.status,401);
    assert.equal((await ctx.request('/auth/login',{method:'POST',body:{email:ctx.officerEmail,password:ctx.officerPass,expectedRole:'placement_officer'}})).response.status,401);
    const officerNewLogin=await ctx.request('/auth/login',{method:'POST',body:{email:ctx.officerEmail,password:officerNewPassword,expectedRole:'placement_officer'}});
    assert.equal(officerNewLogin.response.status,200);assert.equal(officerNewLogin.data.user.role,'placement_officer');

    const recruiterToken=deliveries.find(item=>item.to===recruiterEmail).token;
    const recruiterNewPassword='recruiter-new-password-456';
    const concurrent=await Promise.all([
     ctx.request('/auth/password-reset/confirm',{method:'POST',body:{token:recruiterToken,password:recruiterNewPassword}}),
     ctx.request('/auth/password-reset/confirm',{method:'POST',body:{token:recruiterToken,password:recruiterNewPassword}}),
    ]);
    assert.deepEqual(concurrent.map(item=>item.response.status).sort(),[200,400]);
    assert.equal((await ctx.request('/auth/me',{cookie:recruiterOldSession})).response.status,401);
    assert.equal((await ctx.request('/auth/login',{method:'POST',body:{email:recruiterEmail,password:recruiterOldPassword,expectedRole:'recruiter'}})).response.status,401);
    const recruiterNewLogin=await ctx.request('/auth/login',{method:'POST',body:{email:recruiterEmail,password:recruiterNewPassword,expectedRole:'recruiter'}});
    assert.equal(recruiterNewLogin.response.status,200);assert.equal(recruiterNewLogin.data.user.role,'recruiter');
    assert.equal((await ctx.pool.query('SELECT role FROM users WHERE user_id=$1',[recruiterUser.rows[0].user_id])).rows[0].role,'recruiter');

    const replacementOne=await ctx.request('/auth/password-reset/request',{method:'POST',body:{email:student.email}});
    const replacementTwo=await ctx.request('/auth/password-reset/request',{method:'POST',body:{email:student.email}});
    assert.equal(replacementOne.response.status,202);assert.equal(replacementTwo.response.status,202);
    await emailService.waitForPasswordResetEmailJobsForTests();
    const studentTokens=deliveries.filter(item=>item.to===student.email);
    assert.equal(studentTokens.length,3);
    const replaced=await ctx.request('/auth/password-reset/confirm',{method:'POST',body:{token:studentTokens[1].token,password:'replacement-password-789'}});
    assert.equal(replaced.response.status,400,'A replacement request invalidates the prior link.');
    const latest=await ctx.request('/auth/password-reset/confirm',{method:'POST',body:{token:studentTokens[2].token,password:'student-final-password-789'}});
    assert.equal(latest.response.status,200);
    const sentBeforeAccountLimit=deliveries.length;
    const accountLimited=await ctx.request('/auth/password-reset/request',{method:'POST',body:{email:student.email}});
    assert.equal(accountLimited.response.status,202);assert.deepEqual(accountLimited.data,{message:genericMessage});
    await emailService.waitForPasswordResetEmailJobsForTests();assert.equal(deliveries.length,sentBeforeAccountLimit,'Per-account limits must suppress excess email.');

    failAddress=ctx.officerEmail;
    const originalError=console.error;const capturedLogs=[];
    console.error=(...args)=>capturedLogs.push(args.map(value=>typeof value==='string'?value:JSON.stringify(value)).join(' '));
    try{
     const failedEmail=await ctx.request('/auth/password-reset/request',{method:'POST',body:{email:ctx.officerEmail}});
     assert.equal(failedEmail.response.status,202);assert.deepEqual(failedEmail.data,{message:genericMessage});
     await emailService.waitForPasswordResetEmailJobsForTests();
    }finally{console.error=originalError;}
    assert.equal(capturedLogs.length,1);assert.match(capturedLogs[0],/EAUTH/);
    assert.equal(capturedLogs.join(' ').includes(ctx.officerEmail),false);
    assert.equal(capturedLogs.join(' ').includes('private smtp details'),false);
    const failedToken=await ctx.pool.query(`SELECT invalidated_at IS NOT NULL AS invalidated FROM password_reset_tokens
     WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`,[ctx.ids.officerId]);
    assert.equal(failedToken.rows[0].invalidated,true);
    assert.equal((await ctx.request('/auth/login',{method:'POST',body:{email:ctx.officerEmail,password:officerNewPassword,expectedRole:'placement_officer'}})).response.status,200);

    const duplicateCaseEmail=await ctx.pool.query("SELECT lower(btrim(email)) AS normalized FROM users WHERE user_id=$1",[ctx.ids.officerId]);
    await assert.rejects(ctx.pool.query("INSERT INTO users(name,email,password_hash,role) VALUES('Case Duplicate',$1,'test-only-hash','student')",[duplicateCaseEmail.rows[0].normalized.toUpperCase()]),{code:'23505'});

    let rateLimited=false;
    for(let index=0;index<25&&!rateLimited;index++){
     const attempt=await ctx.request('/auth/password-reset/request',{method:'POST',clientIp:'198.18.255.1',body:{email:`rate-limit-${index}-${randomUUID()}@test.example`}});
     rateLimited=attempt.response.status===429;
    }
    assert.equal(rateLimited,true,'The password-reset request route must enforce its own IP rate limit.');
   }finally{
    await emailService.waitForPasswordResetEmailJobsForTests();
    restoreSender();
   }
  });
 }finally{
  await ctx.pool.query('DELETE FROM student_imports WHERE import_id=ANY($1::uuid[])',[ctx.importIds]);
  await ctx.pool.query('DELETE FROM ai_match_results WHERE student_id IN (SELECT student_id FROM students WHERE registration_number=ANY($1::text[]))',[ctx.registrationNumbers]);
  await ctx.pool.query('DELETE FROM job_drives WHERE drive_id=ANY($1::uuid[])',[ctx.driveIds]);
  await ctx.pool.query('DELETE FROM students WHERE registration_number=ANY($1::text[])',[ctx.registrationNumbers]);
  await ctx.pool.query('DELETE FROM users WHERE email=ANY($1::text[])',[[...ctx.emails,ctx.officerEmail]]);
  await ctx.pool.query('DELETE FROM companies WHERE company_id=ANY($1::uuid[])',[ctx.companyIds]);
  await new Promise(resolve=>ctx.server.close(resolve));await ctx.pool.end();
 }
});
