# REST API

Base URL: `http://localhost:4000/api`. Authentication uses an HTTP-only session cookie. All IDs are UUIDs. JSON errors use `{ "error": "..." }`.

## Authentication

| Method and path | Access | Purpose |
|---|---|---|
| `POST /auth/register` | Public | Link an imported roster record and create a student account. Body: `{name,email,password,registrationNumber}`. The name, registration number, and email must match the import. |
| `POST /auth/login` | Public | Body: `{email,password}`; role is read from the database. |
| `POST /auth/logout` | Signed in | Clears the session cookie. |
| `GET /auth/me` | Signed in | Current user and trusted role. |

## Student

`GET /students/me`, `PUT /students/me` (phone/resume text only), `POST /students/me/resume` (text or a `.txt` multipart file), `GET /students/me/academics`, and `GET /students/me/applications` are student-only. Academic records and eligibility fields are read-only to students. `POST /students/claim-record` requires an authenticated student and exact roster name, registration number, and imported contact email.

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
| `GET /officer/students/template` | Download the CSV template. |
| `POST /officer/students/import/preview` | Multipart `file` (`.csv`/`.xlsx`, up to 5 MB); validates and stages rows. |
| `POST /officer/students/import/confirm` | Body `{importId}`; commits insertable rows once before preview expiry. |
| `GET /officer/students/imports` | Import history. |
| `GET /officer/students/imports/:id` | Import summary. |
| `GET /officer/students/imports/:id/errors` | Sanitized failed/skipped row details. |
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

## Status transitions

Applications begin at `applied`. Officer/recruiter transitions are checked against the server allowlist in `backend/src/services/eligibility.js`. `rejected`, `offered`, and `withdrawn` are terminal. Only the placement officer creates offers; only a single offer can exist per application.
