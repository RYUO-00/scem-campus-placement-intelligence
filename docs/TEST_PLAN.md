# Test plan and verification evidence

> **Purpose:** Provide safe, reproducible test instructions and separate historical evidence from checks not performed.  
> **Updated:** 2026-10-20  
> **Important:** No application tests, migrations, seeds, or data-changing commands were run for this documentation update.

## Contents

- [Scope](#scope)
- [Prerequisites and configuration](#prerequisites-and-configuration)
- [Commands](#commands)
- [Test scenarios](#test-scenarios)
- [Previously verified results](#previously-verified-results)
- [Not verified or limited](#not-verified-or-limited)
- [Safe troubleshooting](#safe-troubleshooting)
- [Related documentation](#related-documentation)

## Scope

The project has Node unit and PostgreSQL-backed integration tests, Python matcher and clustering tests, a frontend production build, and a runnable SQL practical. The checks cover eligibility, registration, imports, recruiter/company and student ownership, resume extraction and matching, reports, application and interview workflows, password recovery, database constraints, transactions, indexes, and trigger behavior.

A build is a compilation check, not browser verification. An API test or mocked email transport does not prove the rendered UI or real Mailtrap inbox delivery. Use the status and date labels in the evidence below.

## Prerequisites and configuration

- Node.js `20.19+` or `22.12+`, npm, PostgreSQL, and Python `3.11+`.
- Backend environment names include `DATABASE_URL`, `TEST_DATABASE_URL`, `PORT`, `NODE_ENV`, `FRONTEND_ORIGIN`, `FRONTEND_URL`, `JWT_SECRET`, `AI_SERVICE_URL`, `IMPORT_PREVIEW_MINUTES`, `MAILTRAP_HOST`, `MAILTRAP_PORT`, `MAILTRAP_USER`, `MAILTRAP_PASS`, `MAIL_FROM`, `DEV_OFFICER_EMAIL`, and `DEV_OFFICER_PASSWORD`, `DEV_RECRUITER_EMAIL`, `DEV_RECRUITER_PASSWORD`.
- Frontend API configuration is `VITE_API_URL`. `TEST_AI_SERVICE_URL` lets the API suite call an available FastAPI service rather than intentionally testing its outage path.
- Keep `.env` values private. Use a dedicated database such as `scem_placement_test` for tests that write. The integration suite and SQL practical reject database names without `test`; the SQL practical also checks that its endpoint differs from the configured development database.
- Some test runners apply missing migrations to their target database. Never point them at a development database containing valuable records.

## Commands

Run these from the project root in PowerShell. Set a private, URL-encoded local connection string in the current shell; do not paste real values into a report or committed file:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://local_role:URL_ENCODED_PASSWORD@localhost:5432/scem_placement_test'
# Optional: enable real Express-to-FastAPI integration cases.
$env:TEST_AI_SERVICE_URL = 'http://127.0.0.1:8000'

npm test
npm run build
.\ai-service\.venv\Scripts\python.exe -m unittest discover -s ai-service/tests -v
npm --workspace backend run db:practicals
```

The root `npm test` delegates to the backend Node test runner. If `TEST_DATABASE_URL` is missing, PostgreSQL integration tests are skipped; a green process exit without those tests is not full integration verification. Python test prerequisites and setup are in [Windows setup](setup-windows.md).

To check Mailtrap SMTP configuration without sending a message:

```powershell
npm --workspace backend run mailtrap:check
```

The diagnostic reports missing/invalid field names and verifies SMTP connectivity; it must not be treated as proof of delivery. For real recovery verification, check the sandbox inbox, use the link, submit a new password, and verify login and single-use behavior. Never include reset tokens or full reset URLs in logs or documentation.

The following operations write to a database and are not required for normal startup: `npm --workspace backend run db:migrate`, `npm --workspace backend run db:seed`, and `npm --workspace backend run db:practicals`. Run migrations/seeds only when intentionally preparing a new, disposable local database; run the practical only with the isolated test database.

## Test scenarios

| Test ID | Feature | Steps or command | Expected result |
|---|---|---|---|
| T01 | Session and roles | Log in as each role; request a route reserved for another role. | Correct dashboard is available; the API denies the wrong role even if a client navigates directly. |
| T02 | Roster import | In an isolated test database, preview a valid and invalid CSV/XLSX; inspect row results; confirm once; retry and test another officer's report ID. | Validation is explicit, confirmation inserts only permitted rows once, and another officer receives no report details. |
| T03 | Eligibility | Try a drive with qualifying and non-qualifying CGPA, backlog, branch, status, and deadline cases. | Backend returns reasons; only eligible applications are inserted; submitted criteria are snapshotted. |
| T04 | Student application | Submit once as an eligible student, then repeat. | First request creates the application; duplicate application is rejected without a duplicate record. |
| T05 | Resume upload/match | Upload UTF-8 TXT, text PDF, or DOCX; check invalid/unsupported files; request a match against a published drive. | Only extracted text is stored; a successful API match persists for the student/drive; an unavailable AI service yields a useful error, not a fabricated score. |
| T06 | K-Means | Call the officer grouping route with FastAPI running; also test insufficient data and unavailable service. | Real cluster summaries correspond to submitted profiles, with no PII sent to FastAPI; service errors and insufficient-data results are explicit. |
| T07 | Recruiter isolation | Use two recruiters assigned to different companies and try reading/updating the other company's drive/application. | The other company's data and writes are denied server-side. |
| T08 | Interview and rejection | Move an application through valid statuses, reject it, try to add a round, reopen as allowed, then add a round. | Invalid transitions are rejected; a rejected application cannot receive an interview round until reopened. |
| T09 | Reports | Compare summary/chart totals with SQL-backed records and exported application/offer rows. | Report metrics reconcile to records; exports are scoped and formula-safe. |
| T10 | Password recovery | Request reset for known and unknown emails; inspect Mailtrap; reset once; test old/new passwords, session revocation, expiry, invalid/reused token, rate limits, and role. | Public confirmation does not reveal account existence; token is single-use and short-lived; new password works, old one fails, and role remains unchanged. |
| T11 | Database practical | `npm --workspace backend run db:practicals` on isolated test DB. | Labeled statements execute, commit/rollback readback is correct, constraints reject invalid rows, and tagged fixtures are cleaned. |
| T12 | Frontend | `npm run build`; then exercise role pages and controls in a browser at laptop and narrow widths. | Build compiles. Browser interactions and visual layout require separate observation; no frontend unit-test script is currently configured. |

Detailed endpoint payloads are in [API documentation](api-documentation.md); DBMS cases and evidence are in [SQL practical](sql-practical.md).

## Previously verified results

These results were executed during earlier project verification on **2026-10-20 (Asia/Calcutta)**. They were not rerun for this documentation-only task.

| Check | Result and scope |
|---|---|
| Backend tests | **PASS:** `npm test` with `TEST_DATABASE_URL` targeting an isolated `scem_placement_test`; 41 passed, 0 failed, 0 skipped. Includes PostgreSQL-backed workflows and password recovery coverage. |
| Frontend production build | **PASS:** `npm run build`; Vite 8.3.4 transformed 110 modules. This verifies compilation, not every page or interaction. |
| Python tests | **PASS:** `python -m unittest discover -s ai-service/tests -v`; 9 passed, 0 failed. Covers matcher and clustering behavior and edge cases. |
| PostgreSQL practical | **PASS:** `npm --workspace backend run db:practicals`; 30 cases passed, 0 failed, 0 unverified against PostgreSQL 18.6 in the isolated test database. Includes DDL/DML, joins, aggregates, view, window function, index plan, constraints, trigger, commit, rollback, and cleanup. Evidence is in [SQL results](sql-practical-results.json). |
| Mailtrap configuration | **PASS:** `npm --workspace backend run mailtrap:check` succeeded without exposing values. |
| Real email delivery | **PASS:** Seven messages were observed in the configured Mailtrap Email Sandbox across synthetic Student, Placement Officer/TPO, and Recruiter accounts. The subject, message instructions, local frontend destination, and 30-minute expiry were inspected. Reset tokens and full links are intentionally not recorded here. Three initial attempts logged sanitized `EENVELOPE` errors; later sequential sends reached the sandbox. The lower-level cause was not available in the logs. |
| Real password recovery | **PASS:** Student, Placement Officer/TPO, and a fresh isolated Recruiter retry completed reset through the actual sandbox message and returned to their matching dashboards in ChatGPT's built-in browser. Isolated DB checks showed role preserved, session version advanced, one token used, and no active token. Automated tests independently verified new-password login, old-password rejection, invalid/expired/reused token handling, generic unknown-email response, and rate limits. |
| Cleanup and data safety | **PASS:** Four temporary recovery accounts, their one Student profile, and the test-only company were removed from the isolated database. Targeted checks found zero matching recovery records in both isolated and development databases; the development seed was not reset. |
| Health checks | **PASS at that verification time:** Development API/PostgreSQL, Vite frontend, and FastAPI health endpoints returned HTTP 200 before the isolated recovery services were stopped. |
| Browser scope | **PASS, focused recovery flow only:** The built-in browser showed the three role dashboards after resets and an invalid-token message. No full application-wide click-through or responsive audit is claimed. The focused recovery page check reported no console warnings/errors. |
| Earlier browser checks | **PASS, dated 2026-10-18 and 2026-10-20:** A project changelog records Chrome 155 checks of the Placement Officer Student Directory at 1365×900 and 1280×720, department/cohort grouping, a department filter, an empty state, and no horizontal overflow. It also records password-toggle interactions for all three login role selections, registration, pointer/keyboard use, and a 390×844 viewport. Those checks are historical and do not establish that every current page/control was recently audited in the built-in browser. |
| Earlier live HTTP workflow | **PASS, dated 2026-10-18:** Existing project audit notes a live API exercise covering CSV preview/confirmation, student registration, TXT resume upload, eligibility, application creation, persisted local TF-IDF matching, student history, Placement Cell reports/export, and recruiter company scoping. It was HTTP/service verification, not a complete current UI click-through. |

## Not verified or limited

- No tests, build, migrations, SMTP calls, browser checks, or database operations were run during this documentation update.
- Old-password rejection was verified by automated backend integration tests; a manual old-password attempt in the browser was not performed.
- Full visual verification of every dashboard, directory filter, chart, recruiter action, and viewport is not covered by the focused recovery browser check.
- `frontend/package.json` has no test script, so no frontend unit test suite is configured.
- SMTP connection checks and HTTP 202 responses do not establish message delivery. Check the Mailtrap inbox for each actual send.
- A single `EXPLAIN ANALYZE` result is not a general performance benchmark. See [SQL optimization](sql-optimization.md).

## Safe troubleshooting

- **Integration suite skips DB tests:** set `TEST_DATABASE_URL` to a disposable database whose name contains `test`; verify the database name and host before running.
- **AI checks return unavailable:** start `python ai-service/run.py` and check `http://localhost:8000/health`; ensure `TEST_AI_SERVICE_URL` points to that service for integration tests.
- **SMTP check fails:** inspect only the variable names reported by the tool, correct the ignored local `backend/.env`, and rerun `mailtrap:check`. Never print values to diagnose.
- **No sandbox message appears:** confirm SMTP send logs and refresh the Mailtrap sandbox; an app confirmation alone is deliberately generic.
- **Do not use** seed/reset commands or a non-test database to troubleshoot test failures.

## Related documentation

[Product requirements](PRD.md) · [Architecture](architecture.md) · [Design](DESIGN.md) · [Security](security.md) · [SQL practical](sql-practical.md) · [AI handoff](MEMORY.md)
