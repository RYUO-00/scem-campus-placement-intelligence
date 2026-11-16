# REST API

Base URL: `http://localhost:4000/api`. Authentication uses an HTTP-only session cookie. All IDs are UUIDs. JSON errors use `{ "error": "..." }`.

## Authentication

| Method and path | Access | Purpose |
|---|---|---|
| `POST /auth/register` | Public | Link an imported roster record and create a student account. Body: `{name,email,password,registrationNumber}`. The name, registration number, and email must match the import. |
| `POST /auth/login` | Public | Body: `{email,password,expectedRole?}`. The optional intended role (`student`, `placement_officer`, or `recruiter`) is checked against the database role; a mismatch returns 403 without issuing a session cookie. Authorization still uses the server-side database role. |
| `POST /auth/password-reset/request` | Public | Body: `{email}`. Returns the same generic 202 response for existing and unknown addresses. When configured, an eligible account receives a 30-minute Mailtrap Email Sandbox link. No role is accepted. |
| `POST /auth/password-reset/confirm` | Public | Body: `{token,password}`. A valid, unexpired, unused token changes the account password, invalidates that account's existing sessions, and preserves its role. Invalid or reused tokens are rejected. |
| `POST /auth/logout` | Signed in | Clears the session cookie. |
| `GET /auth/me` | Signed in | Current user and trusted role. |

Password-reset requests are limited to 20 per IP per 15 minutes and three token issuances per account per hour; confirmations are limited to 10 per IP per 15 minutes. The raw token is sent only by sandbox email and never returned in the API response.

## Student

`GET /students/me`, `PUT /students/me` (phone/resume text only), `POST /students/me/resume` (text or a `.txt`, `.pdf`, or `.docx` multipart file), `GET /students/me/academics`, and `GET /students/me/applications` are student-only. Resume uploads are limited to 2 MB; extracted text is limited to 30,000 characters and returned in the response so the student can review it. PDF resumes are limited to 100 pages. Scanned PDFs needing OCR and password-protected/corrupt documents are rejected with a useful error. Binary uploads are parsed in memory and are not stored. Academic records and eligibility fields are read-only to students. `POST /students/claim-record` requires an authenticated student and exact roster name, registration number, and imported contact email. `PATCH /students/me/offers/:applicationId` accepts `{status:"accepted"}` or `{status:"declined"}` for a pending offer on the authenticated student's application; another student's offer and already-answered offers cannot be updated.

## Drives and applications

| Method and path | Access | Purpose |
|---|---|---|
| `GET /drives` | Signed in | Published drives for students, assigned company drives for recruiters, all drives for officers. |
| `GET /drives/:id` | Signed in | Drive details, scoped by role. |
| `GET /drives/:id/eligibility` | Student | Evaluate mandatory rules. |
| `POST /drives/:id/applications` | Student | Apply only when eligible and before deadline. A criteria snapshot is saved. |

## Officer

All `/officer/*` routes require `placement_officer`.

| Method and path | Purpose |
|---|---|
| `GET /officer/dashboard` | Live counts and recent drives. |
| `GET /officer/students?q=&limit=&offset=` | Searchable roster directory. |
| `POST /officer/student-groups` | Recompute K-Means groups from the current roster. Optional body `{nClusters:2..8}`; omit it to select a cluster count by silhouette score. Results are returned to the requesting officer and are not persisted. |
| `GET /officer/students/template` | Download the canonical empty 4SF XLSX roster workbook. |
| `GET /officer/registration-policy` | Read configured registration years, department mappings, and unresolved codes. |
| `POST /officer/students/import/preview` | Multipart `file` (`.csv`/`.xlsx`, up to 5 MB); validates and stages rows. |
| `POST /officer/students/import/confirm` | Body `{importId}`; commits insertable rows once before preview expiry. |
| `GET /officer/students/imports` | Import history for the authenticated officer. |
| `GET /officer/students/imports/:id` | Import summary, only for its uploader. |
| `GET /officer/students/imports/:id/errors` | Sanitized failed/skipped row details, only for its uploader. |
| `GET /officer/branches` | Active branch choices for drive setup. |
| `GET /officer/branches/all` | Active and inactive branch configuration. |
| `POST /officer/branches` | Add a configurable branch (`branchCode`, `branchName`). |
| `PUT /officer/branches/:id` | Rename or activate/deactivate a branch; historical foreign keys remain intact. |
| `GET, POST /officer/companies`; `PUT /officer/companies/:id` | Company management. |
| `GET, POST /officer/drives`; `PUT /officer/drives/:id`; `PATCH /officer/drives/:id/status` | Drive management. Empty `allowedBranches` means every active branch. |
| `GET /officer/drives/:id/applications` | Applications for one drive. |
| `PATCH /officer/applications/:id/status` | Body `{status}`; validated transition. |
| `POST /officer/applications/:id/rounds` | Add an interview round. |
| `POST /officer/applications/:id/offers` | Add one offer and set application state to offered. |
| `GET /officer/reports/summary` | Branch, company, monthly, and offer aggregates. |
| `GET /officer/reports/export?kind=applications` | Download an authorized CSV report. `kind=offers` exports offers. Spreadsheet formula prefixes are escaped. |

## Recruiter

All `/recruiter/*` routes use the server-side recruiter-to-company relation: `GET /recruiter/dashboard`, `GET /recruiter/drives`, `GET /recruiter/drives/:id/applications`, `PATCH /recruiter/applications/:id/status`, and `POST /recruiter/applications/:id/rounds`. A company ID supplied by the browser is never used to grant access.

## AI

`GET /ai/health` reports matcher availability. `POST /ai/match/:driveId` is student-only and persists the authenticated student's result. `GET /ai/matches/:driveId` returns results only to the owner, placement officers, or that drive's assigned recruiter company. A score is textual similarity and does not affect eligibility.

The internal FastAPI `POST http://localhost:8000/cluster` endpoint accepts at most 2,000 profiles containing only `cgpa`, `active_backlogs`, and `resume_text`, plus optional `n_clusters` from 2 to 8. Express calls it only after placement-officer authorization and maps returned input positions back to roster members. FastAPI rejects extra profile fields, so identifiers and contact data cannot be included accidentally. It returns `status: "insufficient_data"` with a reason when there are too few usable or distinct profiles. This internal endpoint is loopback-bound by the local runner and is not a user-facing public API.

## Status transitions

Applications begin at `applied`. Officer/recruiter transitions are checked against the server allowlist in `backend/src/services/eligibility.js`. `rejected`, `offered`, and `withdrawn` are terminal. Only the placement officer creates offers; only a single offer can exist per application.

Import history, summary, and error queries include the authenticated officer ID in SQL. An unknown or other officer's import ID returns 404. The integration suite verifies this ownership boundary.
