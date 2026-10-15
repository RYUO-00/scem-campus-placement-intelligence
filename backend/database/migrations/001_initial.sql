CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student','placement_officer','recruiter')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS branches (
  branch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_code TEXT NOT NULL UNIQUE,
  branch_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS students (
  student_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES users(user_id) ON DELETE SET NULL,
  registration_number TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  branch_id UUID NOT NULL REFERENCES branches(branch_id) ON DELETE RESTRICT,
  cgpa NUMERIC(3,2) CHECK (cgpa BETWEEN 0 AND 10),
  active_backlogs INTEGER NOT NULL DEFAULT 0 CHECK (active_backlogs >= 0),
  graduation_year INTEGER CHECK (graduation_year BETWEEN 2000 AND 2100),
  phone TEXT,
  contact_email TEXT,
  resume_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_registration_number_ci ON students (lower(registration_number));

CREATE TABLE IF NOT EXISTS academic_records (
  record_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  semester INTEGER NOT NULL CHECK (semester BETWEEN 1 AND 12),
  sgpa NUMERIC(3,2) NOT NULL CHECK (sgpa BETWEEN 0 AND 10),
  backlogs INTEGER NOT NULL DEFAULT 0 CHECK (backlogs >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, semester)
);

CREATE TABLE IF NOT EXISTS companies (
  company_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL UNIQUE,
  industry TEXT,
  website TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recruiters (
  recruiter_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(company_id) ON DELETE RESTRICT,
  designation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_drives (
  drive_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id) ON DELETE RESTRICT,
  role TEXT NOT NULL,
  job_description TEXT NOT NULL,
  minimum_cgpa NUMERIC(3,2) NOT NULL DEFAULT 0 CHECK (minimum_cgpa BETWEEN 0 AND 10),
  maximum_backlogs INTEGER NOT NULL DEFAULT 0 CHECK (maximum_backlogs >= 0),
  application_deadline TIMESTAMPTZ NOT NULL,
  package_lpa NUMERIC(7,2) CHECK (package_lpa >= 0),
  location TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','closed')),
  created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS drive_allowed_branches (
  drive_id UUID NOT NULL REFERENCES job_drives(drive_id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(branch_id) ON DELETE RESTRICT,
  PRIMARY KEY (drive_id, branch_id)
);

CREATE TABLE IF NOT EXISTS eligibility_rules (
  rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_id UUID NOT NULL REFERENCES job_drives(drive_id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('min_cgpa','max_backlogs','allowed_branch')),
  rule_value JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (drive_id, rule_type)
);

CREATE TABLE IF NOT EXISTS applications (
  application_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  drive_id UUID NOT NULL REFERENCES job_drives(drive_id) ON DELETE CASCADE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'applied' CHECK (status IN ('applied','under_review','shortlisted','rejected','interview','offered','withdrawn')),
  eligibility_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, drive_id)
);

CREATE TABLE IF NOT EXISTS interview_rounds (
  round_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES applications(application_id) ON DELETE CASCADE,
  round_name TEXT NOT NULL,
  interview_date TIMESTAMPTZ,
  result TEXT CHECK (result IN ('pending','passed','failed','no_show')),
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS offers (
  offer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL UNIQUE REFERENCES applications(application_id) ON DELETE CASCADE,
  offer_date DATE NOT NULL DEFAULT CURRENT_DATE,
  package_lpa NUMERIC(7,2) NOT NULL CHECK (package_lpa >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','withdrawn')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_match_results (
  match_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  drive_id UUID NOT NULL REFERENCES job_drives(drive_id) ON DELETE CASCADE,
  similarity_score NUMERIC(5,2) NOT NULL CHECK (similarity_score BETWEEN 0 AND 100),
  matched_skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS student_imports (
  import_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  original_filename TEXT NOT NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  inserted_rows INTEGER NOT NULL DEFAULT 0,
  updated_rows INTEGER NOT NULL DEFAULT 0,
  skipped_rows INTEGER NOT NULL DEFAULT 0,
  failed_rows INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('preview','completed','expired','failed')),
  preview_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS student_import_rows (
  row_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES student_imports(import_id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  action TEXT NOT NULL CHECK (action IN ('insert','skip','fail')),
  UNIQUE (import_id, row_number)
);

CREATE TABLE IF NOT EXISTS college_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_students_branch ON students(branch_id);
CREATE INDEX IF NOT EXISTS idx_students_grad_year ON students(graduation_year);
CREATE INDEX IF NOT EXISTS idx_drives_status_deadline ON job_drives(status, application_deadline);
CREATE INDEX IF NOT EXISTS idx_drives_company ON job_drives(company_id);
CREATE INDEX IF NOT EXISTS idx_applications_student ON applications(student_id, applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_drive_status ON applications(drive_id, status);
CREATE INDEX IF NOT EXISTS idx_interview_application ON interview_rounds(application_id);
CREATE INDEX IF NOT EXISTS idx_ai_student_drive ON ai_match_results(student_id, drive_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_imports_user_created ON student_imports(uploaded_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_rows_import ON student_import_rows(import_id, row_number);

INSERT INTO branches (branch_code, branch_name) VALUES
 ('CSE','Computer Science and Engineering'),
 ('CSE-AIML','Computer Science and Engineering (Artificial Intelligence and Machine Learning)'),
 ('ISE','Information Science and Engineering'),
 ('ECE','Electronics and Communication Engineering'),
 ('EC','Electronics and Computer Engineering'),
 ('MECH-ROBOTICS','Mechanical and Robotics Engineering')
ON CONFLICT (branch_code) DO UPDATE SET branch_name = EXCLUDED.branch_name, is_active = TRUE;

INSERT INTO college_settings (setting_key, setting_value) VALUES
 ('institution', '{"name":"Sahyadri College of Engineering & Management","shortName":"SCEM","location":"Sahyadri Campus, Adyar, Mangaluru, Karnataka, India – 575007","website":"https://www.sahyadri.edu.in/","placementUrl":"https://www.sahyadri.edu.in/placements","footer":"Academic Project Prototype | Sahyadri College of Engineering & Management"}'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;
