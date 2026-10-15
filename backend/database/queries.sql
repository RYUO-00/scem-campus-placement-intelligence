-- 1. Students meeting basic criteria for one drive (empty allowed-branch rows mean all active branches).
SELECT s.*, b.branch_code FROM students s JOIN branches b USING(branch_id) JOIN job_drives d ON d.drive_id=$1
WHERE s.cgpa >= d.minimum_cgpa AND s.active_backlogs <= d.maximum_backlogs
AND (NOT EXISTS (SELECT 1 FROM drive_allowed_branches a WHERE a.drive_id=d.drive_id) OR EXISTS (SELECT 1 FROM drive_allowed_branches a WHERE a.drive_id=d.drive_id AND a.branch_id=s.branch_id));
-- 2. Applications by company.
SELECT c.company_name, count(*) AS application_count FROM applications a JOIN job_drives d USING(drive_id) JOIN companies c USING(company_id) GROUP BY c.company_id;
-- 3. Application counts by status.
SELECT status, count(*) FROM applications GROUP BY status ORDER BY count(*) DESC;
-- 4. Students receiving offers.
SELECT s.registration_number,s.full_name,c.company_name,o.package_lpa,o.status FROM offers o JOIN applications a USING(application_id) JOIN students s USING(student_id) JOIN job_drives d USING(drive_id) JOIN companies c USING(company_id);
-- 5. Company offer statistics.
SELECT c.company_name,count(o.offer_id) offer_count,avg(o.package_lpa) average_lpa,max(o.package_lpa) highest_lpa FROM companies c LEFT JOIN job_drives d USING(company_id) LEFT JOIN applications a USING(drive_id) LEFT JOIN offers o USING(application_id) GROUP BY c.company_id;
-- 6. Average accepted offer package.
SELECT avg(package_lpa) FROM offers WHERE status='accepted';
-- 7. Placement rate: distinct students with accepted offers divided by distinct students with an account.
SELECT 100.0 * count(DISTINCT s.student_id) FILTER (WHERE o.status='accepted') / NULLIF(count(DISTINCT s.student_id),0) AS accepted_offer_rate_pct FROM students s LEFT JOIN applications a USING(student_id) LEFT JOIN offers o USING(application_id);
-- 8. Drives ranked by application count.
SELECT d.drive_id,d.role,c.company_name,count(a.application_id) applications FROM job_drives d JOIN companies c USING(company_id) LEFT JOIN applications a USING(drive_id) GROUP BY d.drive_id,c.company_name ORDER BY applications DESC;
-- 9. Students without applications.
SELECT s.registration_number,s.full_name FROM students s LEFT JOIN applications a USING(student_id) WHERE a.application_id IS NULL;
-- 10. Interview outcomes by round.
SELECT round_name,result,count(*) FROM interview_rounds GROUP BY round_name,result ORDER BY round_name,result;
-- 11. Branch-wise application statistics.
SELECT b.branch_code,count(a.application_id) application_count FROM branches b LEFT JOIN students s USING(branch_id) LEFT JOIN applications a USING(student_id) GROUP BY b.branch_id;
-- 12. Branch-wise accepted placement outcomes.
SELECT b.branch_code,count(DISTINCT s.student_id) FILTER (WHERE o.status='accepted') placed FROM branches b LEFT JOIN students s USING(branch_id) LEFT JOIN applications a USING(student_id) LEFT JOIN offers o USING(application_id) GROUP BY b.branch_id;
-- 13. Recruiter company-scoped activity (parameter is recruiter user_id).
SELECT c.company_name,d.role,count(a.application_id) reviewed FROM recruiters r JOIN companies c USING(company_id) JOIN job_drives d USING(company_id) LEFT JOIN applications a USING(drive_id) WHERE r.user_id=$1 GROUP BY c.company_name,d.drive_id;
-- 14. Import history.
SELECT import_id,original_filename,total_rows,inserted_rows,skipped_rows,failed_rows,status,created_at FROM student_imports ORDER BY created_at DESC;
-- 15. Import failures by report.
SELECT i.import_id,i.original_filename,count(r.row_id) FILTER (WHERE r.action='fail') failed,count(r.row_id) FILTER (WHERE r.action='skip') skipped FROM student_imports i LEFT JOIN student_import_rows r USING(import_id) GROUP BY i.import_id;
-- 16. Monthly application trend.
SELECT date_trunc('month',applied_at) month,count(*) FROM applications GROUP BY month ORDER BY month;
-- 17. Rank applicants per drive by CGPA.
SELECT drive_id,student_id,rank() OVER (PARTITION BY drive_id ORDER BY cgpa DESC) cgpa_rank FROM applications a JOIN students s USING(student_id);
-- 18. Transaction example for application status and audit timestamp.
BEGIN; UPDATE applications SET status=$2,updated_at=now() WHERE application_id=$1; COMMIT;
-- 19. Create an aggregate view for current drive activity.
CREATE OR REPLACE VIEW drive_application_summary AS SELECT d.drive_id,d.role,c.company_name,count(a.application_id) application_count,count(*) FILTER (WHERE a.status='shortlisted') shortlisted FROM job_drives d JOIN companies c USING(company_id) LEFT JOIN applications a USING(drive_id) GROUP BY d.drive_id,c.company_name;
