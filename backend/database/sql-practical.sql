-- Executed by database/run-practicals.mjs on the connection-scoped synthetic fixture.
-- Context keys are defined by the runner in the temporary sql_practical_context table.

-- @case Q01 | Create a temporary work table for the practical | type=ddl
CREATE TEMP TABLE sql_practical_notes (
  note_id BIGSERIAL PRIMARY KEY,
  label TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- @case Q02 | Insert synthetic work rows and return their generated keys | type=insert
INSERT INTO sql_practical_notes(label, note) VALUES
  ('update-me', 'Synthetic row for UPDATE demonstration'),
  ('delete-me', 'Synthetic row for DELETE demonstration'),
  ('keep-me', 'Synthetic row retained until the session ends')
RETURNING note_id, label;

-- @case Q03 | Filter and sort the imported synthetic student roster | type=select
SELECT registration_number, full_name, branch_code, cgpa
FROM students AS s
JOIN branches AS b USING (branch_id)
WHERE s.registration_number LIKE (SELECT text_value FROM sql_practical_context WHERE key='roster_prefix') || '%'
ORDER BY cgpa DESC, registration_number;

-- @case Q04 | Update one synthetic work row and return the changed value | type=update
UPDATE sql_practical_notes
SET note = 'Updated synthetic note'
WHERE label = 'update-me'
RETURNING note_id, label, note;

-- @case Q05 | INNER JOIN applications to students, drives, and companies | type=join
SELECT s.registration_number, s.full_name, d.role, a.status, c.company_name
FROM applications AS a
JOIN students AS s USING (student_id)
JOIN job_drives AS d USING (drive_id)
JOIN companies AS c USING (company_id)
WHERE s.registration_number LIKE (SELECT text_value FROM sql_practical_context WHERE key='roster_prefix') || '%'
ORDER BY d.role, s.registration_number;

-- @case Q06 | LEFT JOIN all branches to their current synthetic roster count | type=join
SELECT b.branch_code, COUNT(s.student_id)::INTEGER AS student_count
FROM branches AS b
LEFT JOIN students AS s USING (branch_id)
WHERE b.branch_id = (SELECT uuid_value FROM sql_practical_context WHERE key='branch_id')
GROUP BY b.branch_id, b.branch_code;

-- @case Q07 | Use NOT EXISTS to find a student without an application | type=subquery
SELECT s.registration_number, s.full_name
FROM students AS s
WHERE s.student_id = (SELECT uuid_value FROM sql_practical_context WHERE key='student_3')
  AND NOT EXISTS (SELECT 1 FROM applications AS a WHERE a.student_id = s.student_id);

-- @case Q08 | GROUP BY application status for one synthetic drive | type=aggregate
SELECT status, COUNT(*)::INTEGER AS application_count
FROM applications
WHERE drive_id = (SELECT uuid_value FROM sql_practical_context WHERE key='drive_1')
GROUP BY status
ORDER BY status;

-- @case Q09 | HAVING retains only the synthetic company with applicants | type=aggregate
SELECT c.company_name, COUNT(a.application_id)::INTEGER AS application_count
FROM companies AS c
LEFT JOIN job_drives AS d USING (company_id)
LEFT JOIN applications AS a USING (drive_id)
WHERE c.company_id = (SELECT uuid_value FROM sql_practical_context WHERE key='company_id')
GROUP BY c.company_id, c.company_name
HAVING COUNT(a.application_id) > 0;

-- @case Q10 | Count and summarize package values for synthetic offers | type=aggregate
SELECT COUNT(*)::INTEGER AS offer_count,
       AVG(o.package_lpa)::NUMERIC(7,2) AS average_lpa,
       MIN(o.package_lpa)::NUMERIC(7,2) AS minimum_lpa,
       MAX(o.package_lpa)::NUMERIC(7,2) AS maximum_lpa
FROM offers AS o
JOIN applications AS a USING (application_id)
JOIN job_drives AS d USING (drive_id)
WHERE d.company_id = (SELECT uuid_value FROM sql_practical_context WHERE key='company_id');

-- @case Q11 | Scalar subquery ranks synthetic drives by applicant count | type=subquery
SELECT d.role,
       (SELECT COUNT(*)::INTEGER FROM applications AS a WHERE a.drive_id = d.drive_id) AS applicant_count
FROM job_drives AS d
WHERE d.company_id = (SELECT uuid_value FROM sql_practical_context WHERE key='company_id')
ORDER BY applicant_count DESC, d.role
LIMIT 3;

-- @case Q12 | Create a temporary view over the migrated placement report view | type=view
CREATE TEMP VIEW sql_practical_drive_summary AS
SELECT drive_id, role, company_id, company_name, drive_status,
       application_count, shortlisted_count, offer_count, accepted_offer_count, average_offer_lpa
FROM drive_application_summary;

-- @case Q13 | Read the drive summary view for the synthetic company | type=view
SELECT role, drive_status, application_count, shortlisted_count, offer_count, accepted_offer_count, average_offer_lpa
FROM sql_practical_drive_summary
WHERE company_id = (SELECT uuid_value FROM sql_practical_context WHERE key='company_id')
ORDER BY role;

-- @case Q14 | Rank drive applicants by GPA with a window function | type=window
SELECT s.registration_number, s.cgpa,
       RANK() OVER (PARTITION BY a.drive_id ORDER BY s.cgpa DESC) AS gpa_rank
FROM applications AS a
JOIN students AS s USING (student_id)
WHERE a.drive_id = (SELECT uuid_value FROM sql_practical_context WHERE key='drive_1')
ORDER BY gpa_rank, s.registration_number;

-- @case Q15 | Replace the drive/status index inside a rollback-only plan experiment | type=index group=plan
DROP INDEX IF EXISTS idx_applications_drive_status;
DROP INDEX IF EXISTS sql_practical_plan_drive_status;
CREATE INDEX sql_practical_plan_drive_status ON applications(drive_id, status);

-- @case Q16 | Refresh planner statistics for the synthetic applications | type=analyze group=plan
ANALYZE applications;

-- @case Q17 | Capture an actual placement status query plan | type=explain group=plan
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT status, COUNT(*)::INTEGER AS application_count
FROM applications
WHERE drive_id = (SELECT uuid_value FROM sql_practical_context WHERE key='plan_drive_id')
  AND status = 'applied'
GROUP BY status;

-- @case Q18 | Read one synthetic import batch using its owner-scoped key | type=select
SELECT original_filename, total_rows, inserted_rows, skipped_rows, failed_rows, status
FROM student_imports
WHERE import_id = (SELECT uuid_value FROM sql_practical_context WHERE key='import_id')
  AND uploaded_by = (SELECT uuid_value FROM sql_practical_context WHERE key='officer_id');

-- @case Q19 | Insert one valid semester record for a synthetic student | type=insert
INSERT INTO academic_records(student_id, semester, sgpa, backlogs)
VALUES ((SELECT uuid_value FROM sql_practical_context WHERE key='student_1'), 2, 9.25, 0)
RETURNING semester, sgpa, backlogs;

-- @case Q20 | Exercise the database updated_at trigger with direct SQL | type=trigger
UPDATE students
SET updated_at = TIMESTAMPTZ '2000-01-01 00:00:00+00'
WHERE student_id = (SELECT uuid_value FROM sql_practical_context WHERE key='student_1')
RETURNING updated_at;

-- @case Q21 | Commit status and interview changes together | type=transaction
BEGIN;
UPDATE applications
SET status = 'under_review'
WHERE application_id = (SELECT uuid_value FROM sql_practical_context WHERE key='application_1')
  AND status = 'applied';
INSERT INTO interview_rounds(application_id, round_name, result)
VALUES ((SELECT uuid_value FROM sql_practical_context WHERE key='application_1'), 'SQL Practical Review', 'pending');
COMMIT;

-- @case Q22 | Roll back a synthetic GPA update and read the original value | type=rollback
BEGIN;
UPDATE students
SET cgpa = 9.99
WHERE student_id = (SELECT uuid_value FROM sql_practical_context WHERE key='student_1');
ROLLBACK;
SELECT registration_number, cgpa
FROM students
WHERE student_id = (SELECT uuid_value FROM sql_practical_context WHERE key='student_1');

-- @case Q23 | Delete only the synthetic row created for this DELETE example | type=delete
DELETE FROM sql_practical_notes WHERE label = 'delete-me' RETURNING note_id, label;

-- @case Q24 | Confirm exact registration duplicates are rejected | type=constraint expected-error=23505
INSERT INTO students(registration_number, full_name, branch_id, cgpa, active_backlogs, graduation_year)
VALUES ((SELECT text_value FROM sql_practical_context WHERE key='registration_1'), 'Duplicate Synthetic Student',
        (SELECT uuid_value FROM sql_practical_context WHERE key='branch_id'), 8.00, 0, 2027);

-- @case Q25 | Confirm case-variant registration duplicates are rejected | type=constraint expected-error=23505
INSERT INTO students(registration_number, full_name, branch_id, cgpa, active_backlogs, graduation_year)
VALUES (LOWER((SELECT text_value FROM sql_practical_context WHERE key='registration_1')), 'Case Duplicate Synthetic Student',
        (SELECT uuid_value FROM sql_practical_context WHERE key='branch_id'), 8.00, 0, 2027);

-- @case Q26 | Confirm invalid company foreign keys are rejected | type=constraint expected-error=23503
INSERT INTO job_drives(company_id, role, job_description, application_deadline, status)
VALUES (gen_random_uuid(), 'Invalid FK Demo', 'Synthetic foreign-key negative test', now() + interval '7 days', 'draft');

-- @case Q27 | Confirm CGPA above ten is rejected by the database | type=constraint expected-error=23514
INSERT INTO students(registration_number, full_name, branch_id, cgpa, active_backlogs, graduation_year)
VALUES ((SELECT text_value FROM sql_practical_context WHERE key='roster_prefix') || 'BAD-GPA', 'Invalid GPA Synthetic Student',
        (SELECT uuid_value FROM sql_practical_context WHERE key='branch_id'), 10.01, 0, 2027);

-- @case Q28 | Confirm unsupported user roles are rejected by the database | type=constraint expected-error=23514
INSERT INTO users(name, email, password_hash, role)
VALUES ('Invalid Role Demo', 'sql-practical-invalid-' || (SELECT text_value FROM sql_practical_context WHERE key='run_tag') || '@example.invalid', 'test-only-hash', 'administrator');

-- @case Q29 | Confirm unsupported application statuses are rejected by the database | type=constraint expected-error=23514
UPDATE applications SET status = 'not-a-status'
WHERE application_id = (SELECT uuid_value FROM sql_practical_context WHERE key='application_1');

-- @case Q30 | Confirm a required company name cannot be NULL | type=constraint expected-error=23502
INSERT INTO companies(company_name) VALUES (NULL);
