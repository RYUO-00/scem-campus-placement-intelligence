# Security controls and boundaries

> **Purpose:** Document protections present in the current academic prototype and distinguish them from future recommendations.  
> **Updated:** 2026-10-20  
> **Boundary:** Code and tests describe local prototype controls; this is not a production security certification.

## Contents

- [Identity and sessions](#identity-and-sessions)
- [Authorization and ownership](#authorization-and-ownership)
- [Student and employer data](#student-and-employer-data)
- [Uploads, validation, and database integrity](#uploads-validation-and-database-integrity)
- [Password recovery and email](#password-recovery-and-email)
- [Configuration and testing safety](#configuration-and-testing-safety)
- [Known gaps and future work](#known-gaps-and-future-work)
- [Verification evidence](#verification-evidence)
- [Related documentation](#related-documentation)

## Identity and sessions

- Public registration creates only a `student` role. It requires an unclaimed roster row whose imported name, registration number, and contact email match. Client-supplied role values do not grant privileges.
- Login checks the password against its bcrypt hash. If a role is selected, it must match the role stored on the user record before a session is issued.
- The API signs an eight-hour JWT session and stores it in an HTTP-only cookie with `SameSite=Lax`. The `Secure` cookie flag is enabled when `NODE_ENV=production`.
- On each authenticated request, the API reloads the account from PostgreSQL and checks active status, role, and `session_version`. Password reset increments the affected account's version and invalidates its earlier sessions.
- Express applies Helmet, credentialed CORS for the configured frontend origin, a JSON body-size limit, and route-specific rate limits. SQL uses bound parameters.

These are API-side controls. The frontend route gate is for navigation and must not be treated as authorization.

## Authorization and ownership

| Resource | Server-side control |
|---|---|
| Placement Cell routes | The `/api/officer` router applies placement-officer authentication/role checks. |
| Student profile and offers | Student endpoints require the student role and join writes/reads through the authenticated student's linked roster record or owned application. Official academic roster values cannot be edited through profile updates. |
| Recruiter drives/applicants | Queries use the authenticated recruiter's server-side company assignment. A company ID from the browser does not grant access to another company. |
| Import reports | Import history filters by `uploaded_by`; per-import summary and error queries check both import ID and authenticated uploader. Other officers receive no report details. |
| Resume matches | Match history is visible to the owning student, Placement Officer, or recruiter authorized for the drive's company, subject to route rules. |
| Offers | Students may respond only to their own pending offers; the API prevents repeated responses. Offer creation is a Placement Officer operation. |
| Interview rounds | Round operations validate ownership/role and application state. Rejected applications must be reopened before a new round can be added. |

See [API documentation](api-documentation.md) for route access and [database design](database-design.md) for foreign keys and delete behavior.

## Student and employer data

- The roster import and student registration share a centralized registration-number policy. The importer validates required headers, branch mapping, row fields, duplicates, and existing normalized IDs. Unresolved registration department codes are not guessed.
- CSV/XLSX previews are associated with the uploader, staged in PostgreSQL, and expire after the configured preview interval. Confirmation locks and rechecks the data before a single transaction inserts valid rows. Existing student records are not silently overwritten.
- Import files are parsed from in-memory uploads. The preview payload and row diagnostics are stored in PostgreSQL; expired preview cleanup is not automated yet.
- Resume uploads allow TXT, text-based PDF, and DOCX with a 2 MB upload limit, up to 30,000 extracted characters and 100 PDF pages. Binary files are processed in memory and discarded; extracted resume text is retained in PostgreSQL. Scanned/image-only PDFs and OCR are unsupported.
- DOCX parsing runs in a worker thread with a five-second timeout and bounded heap. Parsing errors are surfaced without returning file contents or parser stack traces.
- The AI service receives resume text for an explicitly requested match. For K-Means, the API sends only CGPA, active backlog count, and resume text; identifiers/contact data are not model features, and FastAPI rejects extra input fields. Group responses are mapped by Express to the authorized directory fields.

## Uploads, validation, and database integrity

- Zod request schemas validate JSON API payloads. Import upload is limited to one `.csv` or `.xlsx` file and 5 MB; parsed imports are capped at 10,000 rows.
- Resume extension/MIME checks and parser validation reject unsupported, malformed, empty, or password-protected documents. Failed parsing does not replace the saved resume.
- PostgreSQL enforces required fields, role/status allowlists, numeric ranges, uniqueness, and foreign-key relationships. Transactions are used for registration, import confirmation, and password reset; status and interview writes use idempotency or transition constraints where implemented.
- Spreadsheet export escapes formula-leading values to reduce CSV formula injection risk.
- Error handlers avoid logging request bodies, passwords, reset tokens, or uploaded document contents. Unexpected server errors use restricted error metadata; client errors return useful messages.

## Password recovery and email

- A shared role-neutral endpoint accepts an email address only; it does not accept a target role or account ID.
- Known, unknown, inactive, rate-limited-by-account, and email-unavailable requests receive the same HTTP 202 response. Invalid email syntax is rejected with a generic validation error. Unknown addresses do not get a message.
- Per-IP rate limits apply to reset request and confirmation endpoints. Each account is limited to three requests per hour. Reset attempts are separately rate-limited.
- Tokens are generated from 32 random bytes. PostgreSQL stores only the SHA-256 digest, with 30-minute expiry. A new request invalidates an older active token. Confirmation consumes a token and changes the bcrypt password within a transaction; concurrent reuse can succeed only once. Other outstanding reset links are invalidated, and the response does not issue a new session.
- The reset page removes the token query from browser history after reading it. The server's HTML sets `Referrer-Policy: no-referrer`. The public API response never includes the token or reset URL.
- SMTP settings are read from ignored local `backend/.env`. SMTP error logs are sanitized, and a failed send invalidates its unused token. `mailtrap:check` reports field names only and does not reveal values. Mailtrap Email Sandbox messages are captured for development; they are not delivered to synthetic users' actual mailboxes.

## Configuration and testing safety

Never commit or paste values from `.env`. Relevant variable names are `DATABASE_URL`, `TEST_DATABASE_URL`, `JWT_SECRET`, `FRONTEND_ORIGIN`, `FRONTEND_URL`, `AI_SERVICE_URL`, `MAILTRAP_HOST`, `MAILTRAP_PORT`, `MAILTRAP_USER`, `MAILTRAP_PASS`, `MAIL_FROM`, `IMPORT_PREVIEW_MINUTES`, `DEV_OFFICER_EMAIL`, `DEV_OFFICER_PASSWORD`, `DEV_RECRUITER_EMAIL`, and `DEV_RECRUITER_PASSWORD`. Frontend configuration uses `VITE_API_URL`.

Use a dedicated test database whose name contains `test` for integration tests and SQL practicals. Some test operations apply migrations and create fixtures. Verify the host and database name before running; never point these commands at the development or production database. Do not run seed or reset commands as routine startup.

## Known gaps and future work

| Gap | Boundary or recommended follow-up |
|---|---|
| No explicit CSRF token | `SameSite=Lax`, JSON APIs, and configured CORS help in local use but do not replace a deployment-specific CSRF review. |
| Prototype roster matching | Name, registration number, and imported email matching is not institutional identity proofing. A real deployment would require an institution-approved identity process. |
| Local-only secrets and mail | Production secret storage, email delivery, TLS, monitoring, and credential rotation are not configured here. |
| Data retention | Add a reviewed retention job for expired import-preview payloads before wider use. |
| Operations | Backups, audit monitoring, incident response, deployment hardening, and production database access policy need separate design. |
| Resume/ML limits | Add OCR or broader skill ontology only if the product requirements justify them; neither is present now. Do not use similarity or clusters as automated hiring decisions. |

These are recommendations or environment limits, not implemented controls.

## Verification evidence

The backend integration suite was previously run on 2026-10-20 against an isolated test database. It covered registration role safety, import report ownership, recruiter company isolation, offer ownership, validation, password recovery, token hashing/expiry/single use, old-password rejection, role preservation, session revocation, and rate limits. Real Mailtrap sandbox email and Student, Placement Officer/TPO, and Recruiter reset flows were also completed in the built-in browser on that date. See [test plan](TEST_PLAN.md) for counts, scope, and caveats; this documentation update did not rerun those checks.

## Related documentation

[Product requirements](PRD.md) · [Architecture](architecture.md) · [Design](DESIGN.md) · [Test plan and evidence](TEST_PLAN.md) · [AI handoff](MEMORY.md)
