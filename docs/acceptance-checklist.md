# Acceptance checklist

Status is based on code inspection and commands actually run in this workspace on 2026-10-18 (Asia/Calcutta). `Verified` means a reproducible test, query execution, or build passed; `Implemented` means present but not fully exercised end to end in this run.

## Application and access control

| Requirement | Status | Evidence / boundary |
|---|---|---|
| Student, officer, and recruiter roles | Verified | Live logins and the imported-student application workflow were exercised against the running API; integration tests also verify role checks, roster linking, officer imports/reviews, and recruiter scoping. |
| Student academic fields are read-only; permitted profile and resume edits | Verified | API route test attempts to write CGPA and confirms the roster value is unchanged. |
| Eligibility rules, explanations, deadline, drive state, branch, backlog, duplicate-application checks | Verified | Node unit and API integration tests exercise pass/fail boundaries and snapshot persistence. |
| Students view interviews/offers and respond to pending offers | Verified | Application history test reads the pending offer; integration tests verify owner-only accept, invalid status rejection, and no second response. |
| Officer CSV/XLSX preview, confirm, summaries and row errors | Verified | A live CSV import inserted one valid row and reported an invalid row; PostgreSQL tests also exercise XLSX, commit-once, expiry, and cross-officer history/summary/error denial. |
| Recruiter company ownership for drives, applicants, status, and rounds | Verified | Integration test confirms another company's recruiter receives 404 for scoped resources and writes. |
| Import ownership is enforced in SQL | Verified | History is filtered by uploader; summary/errors are filtered by import ID plus uploader; regression assertions pass. |
| AI matching, persistence, and outage handling | Verified | Live FastAPI matching produced a 24.4% text similarity and persisted its result; Python tests pass and the API suite verifies service-unavailable behavior. |
| Officer dashboards, application reports, and CSV exports | Verified | Live HTTP checks returned the updated applicant in summary and drive reports and exported an applications CSV. |
| Branch/company/drive administration controls | Implemented; not fully exercised | Routes and forms are present; not every create/edit/publish/deactivate control was clicked in a browser during this run. |
| Rendered UI controls and laptop viewport review | Blocked | No browser provider or native UI control was available in the computer-use session. Frontend build, Vite HTTP response, and credentialed API CORS preflight passed; button-by-button interaction and visual layout remain unverified. |

## Mandatory DBMS practicals

| Requirement | Status | Evidence |
|---|---|---|
| ER diagram with entities, key attributes, relationships, and cardinalities | Verified by schema review | [Database design](database-design.md) is aligned to migrations 001–003. |
| 1NF, 2NF, and 3NF explanations with functional dependencies and examples | Verified by schema review | Table-specific discussion in [database design](database-design.md). Historical eligibility JSON is identified as a deliberate snapshot. |
| At least 20 meaningful executable SQL examples | Verified | 30 labeled examples in `backend/database/sql-practical.sql`. |
| At least 15 SQL examples executed | Verified | 30/30 passed against PostgreSQL 18.6; all result statuses are in [machine-readable evidence](sql-practical-results.json). |
| Required DDL/DML, joins, subqueries, aggregates, view, window function, index, plan, trigger | Verified | Cases Q01–Q20 and Q23–Q30 cover the required constructs; Q17 records actual plan output. |
| Safe synthetic fixtures and repeatable runner | Verified | Runner uses the dedicated `scem_placement_test`, unique tags, migration checks, database safeguards, and fixture cleanup. |
| Transaction commit and rollback with readback | Verified | Q21 reads committed status plus interview; Q22 reads back original CGPA 8.75 after rollback. API test also verifies atomic multi-step commit/rollback. |
| Database negative tests and valid operations | Verified | API integration and SQL practical assert NOT NULL, uniqueness, range, foreign-key, role, status, and application constraints; GPA 10.00 succeeds. |
| Meaningful trigger and automated test | Verified | `set_row_updated_at()` refreshes `updated_at`; integration test and Q20 check its effect. |
| Query optimization on representative synthetic data | Verified with measurement limit | Q17 on 24,000 synthetic applications uses `sql_practical_plan_drive_status`. One local plan is recorded; no comparative speedup is claimed. |

## Setup, security, and delivery

| Requirement | Status | Evidence / boundary |
|---|---|---|
| Windows PowerShell setup guide | Documented | [Windows setup](setup-windows.md) uses guarded `.env` copies and the Python virtual environment. It was not replayed as a clean machine install. |
| Safe `.env.example` files and ignored secrets | Verified by file review | Backend example uses placeholders; frontend example contains only local API URL; `.env` and local artifacts are ignored. No `.env` contents are included in documentation or reports. |
| Postman-compatible requests | Verified structurally | Collection parses as JSON and uses variables/placeholders. Automated HTTP tests cover representative requests; Postman desktop itself was not launched. |
| Security limitations documented | Documented | [Security notes](security.md) cover ownership, session/CORS controls, data retention, and production gaps. |
| Automated checks | Verified | `npm test`: 20 passed; `npm run build`: passed; AI venv: 2 passed; SQL practical: 30/30 passed; `npm audit`: 0 known vulnerabilities. |

## Known gaps and limits

- Expired import preview payloads have no automatic retention job yet.
- There is no explicit CSRF token or server-side session revocation list; see [security notes](security.md).
- Query-plan timing is from one local PostgreSQL run and is not a comparative benchmark.
- The Windows setup instructions were documented and key commands were exercised in an existing workspace; a clean install on a new Windows machine was not run.
- The Postman collection was syntax-checked, but not executed in the Postman UI.
- Browser-level click-through and visual checks at common laptop sizes still need to be run in a browser-enabled session.
