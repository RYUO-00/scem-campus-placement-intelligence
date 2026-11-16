import 'dotenv/config';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Client } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const reportPath = path.join(root, 'docs', 'sql-practical-results.json');
const testUrl = process.env.TEST_DATABASE_URL;
const migrationsDir = path.join(here, 'migrations');

function databaseName(url) {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
}

function endpointKey(url) {
  const parsed = new URL(url);
  return `${parsed.hostname.toLowerCase()}:${parsed.port || '5432'}${parsed.pathname.toLowerCase()}`;
}

function safeError(error) {
  return { code: error?.code || 'INTERNAL', message: error?.code ? error.message : 'Database practical runner failed.' };
}

function lastResult(value) {
  return Array.isArray(value) ? value.at(-1) : value;
}

function resultSummary(value) {
  const results = Array.isArray(value) ? value : [value];
  const final = results.filter(Boolean).at(-1);
  return {
    command: results.map((result) => result?.command).filter(Boolean).join(' → '),
    rowCount: final?.rowCount ?? null,
    rows: (final?.rows || []).slice(0, 5),
    returnedRowCount: final?.rows?.length ?? 0,
  };
}

function parseCases(source) {
  const markers = [...source.matchAll(/^-- @case (Q\d{2}) \| (.+)$/gm)];
  if (!markers.length) throw new Error('No SQL practical cases were found.');
  return markers.map((marker, index) => {
    const next = markers[index + 1];
    const start = marker.index + marker[0].length;
    const sql = source.slice(start, next?.index ?? source.length).trim();
    const [purpose, ...metadataParts] = marker[2].split(/\s+\|\s+/);
    const metadata = metadataParts.join(' ');
    const id = marker[1];
    return {
      id,
      purpose: purpose.trim(),
      type: metadata.match(/(?:^|\s)type=([\w-]+)/)?.[1] || 'sql',
      group: metadata.match(/(?:^|\s)group=([\w-]+)/)?.[1] || null,
      expectedError: metadata.match(/(?:^|\s)expected-error=(\d{5})/)?.[1] || null,
      sql,
    };
  });
}

if (!testUrl) throw new Error('Set TEST_DATABASE_URL to a dedicated PostgreSQL database whose name contains "test".');
const targetDatabase = databaseName(testUrl);
if (!targetDatabase.toLowerCase().includes('test')) throw new Error('Refusing to run practicals: TEST_DATABASE_URL database name must contain "test".');
if (process.env.DATABASE_URL && endpointKey(testUrl) === endpointKey(process.env.DATABASE_URL)) throw new Error('Refusing to run practicals against the configured development database.');

const suffix = randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
const runTag = `SQLPRACTICAL-${suffix}`;
const rosterPrefix = `${runTag}-R-`;
const planPrefix = `${runTag}-P-`;
const companyName = `SQL Practical Synthetic ${suffix}`;
const officerEmail = `sql-practical-${suffix.toLowerCase()}@example.invalid`;
const report = {
  generatedAt: new Date().toISOString(),
  environment: { database: targetDatabase, postgresVersion: null, databaseUser: null, runner: 'PostgreSQL SQL practical runner' },
  fixture: { label: runTag, syntheticRosterStudents: 3, syntheticQueryPlanStudents: 8000, syntheticQueryPlanDrives: 12 },
  migrations: [],
  summary: { total: 0, passed: 0, failed: 0, unverified: 0 },
  cases: [],
  transactionEvidence: { commit: 'unverified', rollback: 'unverified' },
  queryPlanEvidence: { index: 'sql_practical_plan_drive_status', output: [] },
  cleanup: 'not started',
  limitations: [],
};

const client = new Client({ connectionString: testUrl, application_name: 'scem-sql-practical' });
let fixtureStarted = false;
let fixtureCommitted = false;
let planTransactionOpen = false;
let clientConnected = false;
let context = {};

async function addContext(key, textValue = null, uuidValue = null) {
  await client.query('INSERT INTO sql_practical_context(key,text_value,uuid_value) VALUES($1,$2,$3)', [key, textValue, uuidValue]);
}

async function applyMigrations() {
  await client.query('SELECT pg_advisory_lock(710017, 1)');
  try {
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    const applied = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((row) => row.name));
    const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();
    for (const name of files) {
      if (applied.has(name)) continue;
      await client.query('BEGIN');
      try {
        await client.query(await readFile(path.join(migrationsDir, name), 'utf8'));
        await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
        await client.query('COMMIT');
        report.migrations.push({ name, status: 'applied' });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    for (const name of files) if (!report.migrations.some((migration) => migration.name === name)) report.migrations.push({ name, status: 'already applied' });
  } finally {
    await client.query('SELECT pg_advisory_unlock(710017, 1)');
  }
}

async function createFixtures() {
  const branchResult = await client.query("SELECT branch_id FROM branches WHERE branch_code='CSE' AND is_active=true");
  const branchId = branchResult.rows[0]?.branch_id;
  if (!branchId) throw new Error('The active CSE branch was not created by the migrations.');

  await client.query('CREATE TEMP TABLE sql_practical_context(key TEXT PRIMARY KEY,text_value TEXT,uuid_value UUID) ON COMMIT PRESERVE ROWS');
  await client.query('BEGIN');
  fixtureStarted = true;

  const officer = await client.query("INSERT INTO users(name,email,password_hash,role) VALUES('SQL Practical Synthetic Officer',$1,'test-only-not-a-login-hash','placement_officer') RETURNING user_id", [officerEmail]);
  const company = await client.query('INSERT INTO companies(company_name,industry) VALUES($1,$2) RETURNING company_id', [companyName, 'SQL Practical Synthetic Industry']);
  const studentRows = [];
  for (let index = 1; index <= 3; index++) {
    const registrationNumber = `${rosterPrefix}${String(index).padStart(3, '0')}`;
    const inserted = await client.query(`INSERT INTO students(registration_number,full_name,branch_id,cgpa,active_backlogs,graduation_year,contact_email)
      VALUES($1,$2,$3,$4,$5,2027,$6) RETURNING student_id,registration_number`, [registrationNumber, `Synthetic SQL Student ${index}`, branchId, [8.75, 9.25, 7.00][index - 1], index === 3 ? 1 : 0, `sql-student-${suffix.toLowerCase()}-${index}@example.invalid`]);
    studentRows.push(inserted.rows[0]);
  }

  const drives = [];
  for (let index = 1; index <= 3; index++) {
    const inserted = await client.query(`INSERT INTO job_drives(company_id,role,job_description,minimum_cgpa,maximum_backlogs,application_deadline,status,created_by)
      VALUES($1,$2,'Synthetic SQL practical placement role with Python, PostgreSQL, communication, and testing requirements.',7.00,0,now()+interval '30 days','published',$3)
      RETURNING drive_id,role`, [company.rows[0].company_id, `SQL Practical Demonstration Role ${index}`, officer.rows[0].user_id]);
    drives.push(inserted.rows[0]);
  }
  await client.query('INSERT INTO drive_allowed_branches(drive_id,branch_id) VALUES($1,$2)', [drives[0].drive_id, branchId]);

  const applications = [];
  for (const [studentIndex, driveIndex, status] of [[0, 0, 'applied'], [1, 0, 'shortlisted'], [1, 1, 'under_review']]) {
    const inserted = await client.query('INSERT INTO applications(student_id,drive_id,status,eligibility_snapshot) VALUES($1,$2,$3,$4) RETURNING application_id',
      [studentRows[studentIndex].student_id, drives[driveIndex].drive_id, status, JSON.stringify({ eligible: true, synthetic: true })]);
    applications.push(inserted.rows[0].application_id);
  }
  await client.query('INSERT INTO academic_records(student_id,semester,sgpa,backlogs) VALUES($1,1,10.00,0),($2,1,9.50,0)', [studentRows[0].student_id, studentRows[1].student_id]);
  await client.query("INSERT INTO interview_rounds(application_id,round_name,result,feedback) VALUES($1,'Synthetic Technical Round','passed','Synthetic practical fixture.')", [applications[1]]);
  await client.query("INSERT INTO offers(application_id,package_lpa,status) VALUES($1,12.50,'accepted')", [applications[1]]);
  await client.query('INSERT INTO ai_match_results(student_id,drive_id,similarity_score,matched_skills,missing_skills,recommendations) VALUES($1,$2,72.50,$3,$4,$5)',
    [studentRows[0].student_id, drives[0].drive_id, JSON.stringify(['Python', 'SQL']), JSON.stringify(['Docker']), JSON.stringify(['Practice container fundamentals.'])]);

  const planDrives = [];
  for (let index = 1; index <= 12; index++) {
    const inserted = await client.query(`INSERT INTO job_drives(company_id,role,job_description,minimum_cgpa,maximum_backlogs,application_deadline,status,created_by)
      VALUES($1,$2,'Synthetic query plan workload for placement applications.',0,50,now()+interval '30 days','published',$3) RETURNING drive_id`,
      [company.rows[0].company_id, `SQL Practical Plan Role ${String(index).padStart(2, '0')}`, officer.rows[0].user_id]);
    planDrives.push(inserted.rows[0].drive_id);
  }
  await client.query(`INSERT INTO students(registration_number,full_name,branch_id,cgpa,active_backlogs,graduation_year)
    SELECT $1||lpad(n::text,6,'0'),'Synthetic Query Plan Student '||n,$2,(6+(n%401)/100.0)::numeric(4,2),n%3,2027
    FROM generate_series(1,8000) AS n`, [planPrefix, branchId]);
  await client.query(`WITH synthetic_students AS (
      SELECT student_id,row_number() OVER (ORDER BY registration_number)::INTEGER AS seq
      FROM students WHERE registration_number LIKE $1||'%'
    ), synthetic_drives AS (
      SELECT drive_id,row_number() OVER (ORDER BY drive_id)::INTEGER AS seq
      FROM job_drives WHERE company_id=$2 AND role LIKE 'SQL Practical Plan Role %'
    )
    INSERT INTO applications(student_id,drive_id,status,eligibility_snapshot)
    SELECT s.student_id,d.drive_id,
           CASE ((s.seq+d.seq)%4) WHEN 0 THEN 'applied' WHEN 1 THEN 'under_review' WHEN 2 THEN 'shortlisted' ELSE 'rejected' END,
           jsonb_build_object('eligible',true,'synthetic',true)
    FROM synthetic_students AS s CROSS JOIN synthetic_drives AS d
    WHERE ((s.seq+d.seq)%4)=0`, [planPrefix, company.rows[0].company_id]);

  const imported = await client.query(`INSERT INTO student_imports(uploaded_by,original_filename,total_rows,inserted_rows,failed_rows,status,completed_at)
    VALUES($1,$2,3,2,1,'completed',now()) RETURNING import_id`, [officer.rows[0].user_id, `sql-practical-${suffix}.csv`]);
  await client.query("INSERT INTO student_import_rows(import_id,row_number,payload,errors,action) VALUES($1,4,'{}'::jsonb,$2::jsonb,'fail')",
    [imported.rows[0].import_id, JSON.stringify(['Synthetic validation error for SQL practical demonstration.'])]);

  await client.query('COMMIT');
  fixtureCommitted = true;
  context = { officerId: officer.rows[0].user_id, companyId: company.rows[0].company_id, branchId,
    studentIds: studentRows.map((row) => row.student_id), registrations: studentRows.map((row) => row.registration_number),
    driveIds: drives.map((row) => row.drive_id), applicationIds: applications, planDriveId: planDrives[0], importId: imported.rows[0].import_id };

  await addContext('run_tag', suffix);
  await addContext('roster_prefix', rosterPrefix);
  await addContext('plan_prefix', planPrefix);
  await addContext('registration_1', studentRows[0].registration_number);
  await addContext('company_id', null, company.rows[0].company_id);
  await addContext('officer_id', null, officer.rows[0].user_id);
  await addContext('branch_id', null, branchId);
  await addContext('student_1', null, studentRows[0].student_id);
  await addContext('student_2', null, studentRows[1].student_id);
  await addContext('student_3', null, studentRows[2].student_id);
  await addContext('drive_1', null, drives[0].drive_id);
  await addContext('drive_2', null, drives[1].drive_id);
  await addContext('drive_3', null, drives[2].drive_id);
  await addContext('application_1', null, applications[0]);
  await addContext('application_2', null, applications[1]);
  await addContext('plan_drive_id', null, planDrives[0]);
  await addContext('import_id', null, imported.rows[0].import_id);
}

async function runCase(testCase) {
  if (testCase.expectedError) {
    await client.query('SAVEPOINT sql_practical_expected_error');
    let error = null;
    try { await client.query(testCase.sql); }
    catch (caught) { error = caught; }
    await client.query('ROLLBACK TO SAVEPOINT sql_practical_expected_error');
    await client.query('RELEASE SAVEPOINT sql_practical_expected_error');
    if (error?.code === testCase.expectedError) return { id: testCase.id, purpose: testCase.purpose, status: 'passed', expectedError: testCase.expectedError, actualError: error.code, rowCount: 0, rows: [] };
    return { id: testCase.id, purpose: testCase.purpose, status: 'failed', expectedError: testCase.expectedError, actualError: error?.code || null, error: error ? safeError(error) : { code: 'NO_ERROR', message: 'The invalid statement unexpectedly succeeded.' }, rowCount: 0, rows: [] };
  }

  const result = await client.query(testCase.sql);
  const summary = resultSummary(result);
  const record = { id: testCase.id, purpose: testCase.purpose, status: 'passed', ...summary };

  if (testCase.id === 'Q17') {
    report.queryPlanEvidence.output = (lastResult(result)?.rows || []).map((row) => row['QUERY PLAN']);
    report.queryPlanEvidence.indexUsed = report.queryPlanEvidence.output.some((line) => String(line).includes('sql_practical_plan_drive_status'));
    if (!report.queryPlanEvidence.indexUsed) {
      record.status = 'failed';
      record.error = { code: 'INDEX_NOT_USED', message: 'The measured EXPLAIN ANALYZE plan did not use the practical drive/status index.' };
    }
  }
  if (testCase.id === 'Q20') {
    const value = lastResult(result)?.rows?.[0]?.updated_at;
    if (!value || new Date(value) <= new Date('2000-01-01T00:00:00Z')) {
      record.status = 'failed';
      record.error = { code: 'TRIGGER_NOT_VERIFIED', message: 'The updated_at trigger did not replace the forced old timestamp.' };
    }
  }
  if (testCase.id === 'Q21') {
    const evidence = await client.query(`SELECT a.status,COUNT(r.round_id)::INTEGER AS interview_count
      FROM applications AS a LEFT JOIN interview_rounds AS r USING(application_id)
      WHERE a.application_id=$1 GROUP BY a.application_id`, [context.applicationIds[0]]);
    record.evidence = evidence.rows[0];
    report.transactionEvidence.commit = evidence.rows[0]?.status === 'under_review' && evidence.rows[0]?.interview_count === 1 ? 'verified: status and interview round committed together' : 'failed';
    if (report.transactionEvidence.commit === 'failed') record.status = 'failed';
  }
  if (testCase.id === 'Q22') {
    const value = lastResult(result)?.rows?.[0]?.cgpa;
    record.evidence = { observedCgpaAfterRollback: value };
    report.transactionEvidence.rollback = Number(value) === 8.75 ? 'verified: original CGPA 8.75 remained after ROLLBACK' : 'failed';
    if (report.transactionEvidence.rollback === 'failed') record.status = 'failed';
  }
  return record;
}

async function cleanup() {
  if (!fixtureStarted || !clientConnected) return;
  try { await client.query('ROLLBACK'); } catch {}
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM student_imports WHERE uploaded_by=(SELECT user_id FROM users WHERE email=$1)', [officerEmail]);
    await client.query('DELETE FROM job_drives WHERE company_id=(SELECT company_id FROM companies WHERE company_name=$1)', [companyName]);
    await client.query('DELETE FROM students WHERE registration_number LIKE $1 OR registration_number LIKE $2', [`${rosterPrefix}%`, `${planPrefix}%`]);
    await client.query('DELETE FROM users WHERE email=$1', [officerEmail]);
    await client.query('DELETE FROM companies WHERE company_name=$1', [companyName]);
    await client.query('COMMIT');
    report.cleanup = 'passed: all SQL practical synthetic rows removed';
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    report.cleanup = 'failed';
    report.limitations.push({ area: 'fixture cleanup', ...safeError(error) });
  }
}

try {
  await client.connect();
  clientConnected = true;
  const meta = await client.query("SELECT current_database() AS database,current_user AS database_user,current_setting('server_version') AS postgres_version");
  report.environment = { ...report.environment, database: meta.rows[0].database, databaseUser: meta.rows[0].database_user, postgresVersion: meta.rows[0].postgres_version };
  if (report.environment.database !== targetDatabase) throw new Error('Connected database name does not match TEST_DATABASE_URL.');
  await applyMigrations();
  await createFixtures();
  const source = await readFile(path.join(here, 'sql-practical.sql'), 'utf8');
  const cases = parseCases(source);
  report.summary.total = cases.length;

  for (const testCase of cases) {
    if (testCase.group === 'plan' && !planTransactionOpen) {
      await client.query('BEGIN');
      planTransactionOpen = true;
    } else if (planTransactionOpen && testCase.group !== 'plan') {
      await client.query('ROLLBACK');
      planTransactionOpen = false;
    }
    try {
      if (testCase.group === 'plan') report.cases.push(await runCase(testCase));
      else if (testCase.type === 'transaction' || testCase.type === 'rollback') report.cases.push(await runCase(testCase));
      else {
        await client.query('BEGIN');
        await client.query('SAVEPOINT sql_practical_case');
        try {
          report.cases.push(await runCase(testCase));
          await client.query('RELEASE SAVEPOINT sql_practical_case');
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK TO SAVEPOINT sql_practical_case');
          await client.query('RELEASE SAVEPOINT sql_practical_case');
          await client.query('COMMIT');
          report.cases.push({ id: testCase.id, purpose: testCase.purpose, status: 'failed', error: safeError(error), rowCount: 0, rows: [] });
        }
      }
    } catch (error) {
      if (planTransactionOpen) {
        try { await client.query('ROLLBACK'); } catch {}
        planTransactionOpen = false;
      }
      report.cases.push({ id: testCase.id, purpose: testCase.purpose, status: 'failed', error: safeError(error), rowCount: 0, rows: [] });
    }
    if (testCase.id === 'Q17' && planTransactionOpen) {
      await client.query('ROLLBACK');
      planTransactionOpen = false;
    }
  }
} catch (error) {
  report.limitations.push({ area: 'runner', ...safeError(error) });
} finally {
  if (planTransactionOpen) {
    try { await client.query('ROLLBACK'); } catch {}
    planTransactionOpen = false;
  }
  await cleanup();
  try { await client.end(); } catch {}
  report.summary.passed = report.cases.filter((item) => item.status === 'passed').length;
  report.summary.failed = report.cases.filter((item) => item.status === 'failed').length;
  report.summary.unverified = report.summary.total - report.summary.passed - report.summary.failed;
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`SQL practical report: ${path.relative(root, reportPath)}`);
  console.log(`Executed ${report.summary.total} cases: ${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.unverified} unverified.`);
  console.log(`Fixture cleanup: ${report.cleanup}`);
  if (report.summary.failed || report.summary.unverified || report.limitations.length || report.cleanup.startsWith('failed')) process.exitCode = 1;
}
