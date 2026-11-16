-- Canonical initial schema and configurable branch/settings bootstrap.
-- Apply with: npm --workspace backend run db:migrate
\ir migrations/001_initial.sql
\ir migrations/002_audit_and_reporting.sql
\ir migrations/003_allow_perfect_gpa.sql
\ir migrations/004_normalized_registration_number.sql
