-- NUMERIC(3,2) cannot represent 10.00. Widen GPA fields while keeping the 0–10 checks.
ALTER TABLE students ALTER COLUMN cgpa TYPE NUMERIC(4,2);
ALTER TABLE academic_records ALTER COLUMN sgpa TYPE NUMERIC(4,2);
ALTER TABLE job_drives ALTER COLUMN minimum_cgpa TYPE NUMERIC(4,2);
