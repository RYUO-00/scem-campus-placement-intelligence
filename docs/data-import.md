# Student roster import

The placement officer can download the CSV template or upload `.csv` and `.xlsx` files. XLSX parsing reads the first worksheet. Uploads are limited to 5 MB and 10,000 rows. Only the listed headers are used; extra columns are ignored.

Required columns: `registration_number`, `full_name`, `branch_code`, `cgpa`, `active_backlogs`, `graduation_year`, and `email`. `phone` is optional. Branch codes are configured in `branches`; the initial codes are `CSE`, `CSE-AIML`, `ISE`, `ECE`, `EC`, and `MECH-ROBOTICS`.

The preview validates each row, configured branch, CGPA (0–10), nonnegative integer backlogs, year (2000–2100), email, duplicates within the file, and existing registration numbers. Existing records are skipped and never overwritten. Invalid rows are reported and excluded. The preview is staged for the uploader in PostgreSQL for 30 minutes by default (`IMPORT_PREVIEW_MINUTES` can configure 5–120 minutes). Confirmation locks the import, rechecks row branch availability and unique registration numbers, writes all insertable rows in one transaction, and can only be used once. Re-upload after expiry to obtain a new preview. No student account is created by import; the student registers later against the roster name, registration number, and imported email.

Error reports contain row numbers, actions, and validation explanations rather than row payloads. Staged records contain student data until confirmation or until the preview is cleaned up. This academic prototype currently retains expired preview staging rows for audit; operators can remove old staging rows during a future retention-policy rollout.
