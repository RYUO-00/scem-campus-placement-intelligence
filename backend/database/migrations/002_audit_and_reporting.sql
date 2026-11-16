-- Keep timestamps consistent even for writes outside the Express API, and provide a shared placement report.
CREATE OR REPLACE FUNCTION set_row_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();
DROP TRIGGER IF EXISTS students_set_updated_at ON students;
CREATE TRIGGER students_set_updated_at BEFORE UPDATE ON students
FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();
DROP TRIGGER IF EXISTS companies_set_updated_at ON companies;
CREATE TRIGGER companies_set_updated_at BEFORE UPDATE ON companies
FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();
DROP TRIGGER IF EXISTS drives_set_updated_at ON job_drives;
CREATE TRIGGER drives_set_updated_at BEFORE UPDATE ON job_drives
FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();
DROP TRIGGER IF EXISTS eligibility_rules_set_updated_at ON eligibility_rules;
CREATE TRIGGER eligibility_rules_set_updated_at BEFORE UPDATE ON eligibility_rules
FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();
DROP TRIGGER IF EXISTS applications_set_updated_at ON applications;
CREATE TRIGGER applications_set_updated_at BEFORE UPDATE ON applications
FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();
DROP TRIGGER IF EXISTS interviews_set_updated_at ON interview_rounds;
CREATE TRIGGER interviews_set_updated_at BEFORE UPDATE ON interview_rounds
FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();
DROP TRIGGER IF EXISTS offers_set_updated_at ON offers;
CREATE TRIGGER offers_set_updated_at BEFORE UPDATE ON offers
FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();
DROP TRIGGER IF EXISTS college_settings_set_updated_at ON college_settings;
CREATE TRIGGER college_settings_set_updated_at BEFORE UPDATE ON college_settings
FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();

CREATE OR REPLACE VIEW drive_application_summary AS
SELECT d.drive_id,
       d.role,
       d.company_id,
       c.company_name,
       d.status AS drive_status,
       d.application_deadline,
       COUNT(DISTINCT a.application_id)::INTEGER AS application_count,
       COUNT(DISTINCT a.application_id) FILTER (WHERE a.status = 'shortlisted')::INTEGER AS shortlisted_count,
       COUNT(DISTINCT o.offer_id)::INTEGER AS offer_count,
       COUNT(DISTINCT o.offer_id) FILTER (WHERE o.status = 'accepted')::INTEGER AS accepted_offer_count,
       ROUND(AVG(o.package_lpa) FILTER (WHERE o.offer_id IS NOT NULL), 2) AS average_offer_lpa
FROM job_drives AS d
JOIN companies AS c USING (company_id)
LEFT JOIN applications AS a USING (drive_id)
LEFT JOIN offers AS o USING (application_id)
GROUP BY d.drive_id, c.company_name;
