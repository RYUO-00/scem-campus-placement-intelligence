# Project audit and current evidence

Audit date: 2026-10-20. All destructive database work used the isolated PostgreSQL test database `scem_placement_test`; the development database was not reset or modified by this audit.

## Objective traceability

| Original objective | Before this change | Work in this audit | Final status | Evidence and remaining limit |
|---|---|---|---|---|
| 1. Centralized placement database | Existing PostgreSQL schema and CRUD workflows; no student clustering implementation was found. | Preserved the schema. K-Means reads current student rows through Express; run outputs are deliberately transient. | **PARTIAL** | 30/30 SQL practical cases and the PostgreSQL API suite pass. Profiles, drives, applications, interviews, offers, and resume matches remain database-backed. K-Means run history is not stored; there is no schema field/table for clustering history. |
| 2. Automated eligibility and intelligent grouping | Rule-based eligibility existed; actual K-Means was absent. | Added real scikit-learn K-Means, silhouette-based cluster selection, a protected officer API, summaries, and a directory UI section. | **PARTIAL** | Eligibility boundary tests and real FastAPI inference through Express pass. The feature compiles, but browser automation was blocked before the page could be opened, so visible success/error states and layout were not clicked or visually checked. |
| 3. Job matching and placement intelligence | TF-IDF/cosine matching and database-derived placement reports existed. | Preserved these flows; no unrelated analytics or matching rewrite was made. | **PARTIAL** | The backend suite passes real resume match/persistence, AI outage, role/company scope, and report-to-PostgreSQL reconciliation checks. The browser charts, skill-demand presentation, and responsive report layout were not visually audited in this run. |

## K-Means implementation

- **Algorithm:** scikit-learn `KMeans`, `random_state=42`, `n_init=20`.
- **Features:** CGPA, active backlog count, and the project's recognized resume skill vocabulary. Names, student IDs, registration numbers, contact details, department, graduation year, and authentication data never enter the feature matrix. The FastAPI request schema rejects unknown profile fields.
- **Preprocessing:** numeric median imputation with missingness flags, standard scaling and L2 normalization; recognized skills are multi-hot encoded and L2-normalized; the numeric and skill blocks are equally weighted when present.
- **Cluster count:** automatic search from `k=2` through `min(8, n-1, distinct profiles)`, selecting the highest valid silhouette score. Invalid requested counts produce validation errors; insufficient records, identical profiles, and invalid records return explanations/exclusion counts rather than invented labels.
- **Endpoint/UI:** placement-officer-only `POST /api/officer/student-groups`; on-demand UI section is in the Student directory. Express sends only the features to loopback FastAPI, validates returned membership, then maps members to an authorized roster subset. Resume text and email are not returned to the browser.
- **Persistence:** no schema changes. Results are computed only when an officer requests them and are not persisted; the response includes model version and generation time. Cluster IDs are per-run labels.
- **Actual isolated test-roster run:** 15 records included, 0 excluded, `k=2`, silhouette `0.8015`. This is an internal separation metric for that run, not model accuracy or a placement probability.
- **Verification:** 9 Python tests pass; the full Node/PostgreSQL suite passes 37/37 with FastAPI available. A contract test separately checks role denial, exact outbound fields, member mapping, and service outage. Contract-test outputs are not counted as model results.

## Database and security evidence

- SQL practical: 30 passed, 0 failed, 0 unverified, against PostgreSQL 18.6 in `scem_placement_test`; synthetic fixture cleanup passed. Actual evidence includes constraints, joins, subqueries, aggregation/HAVING, views, transactions, trigger behavior, and an index scan in `EXPLAIN ANALYZE`. Full result JSON is [sql-practical-results.json](sql-practical-results.json).
- The officer route router applies `requireOfficer` to all routes. Tests verify unauthenticated (401) and student (403) requests are denied for grouping.
- Model input minimizes student data. The service receives academic/skill inputs only. Returned roster membership excludes resume text, email, and contact details.
- Existing tests also verify import-report ownership, recruiter-to-company boundaries, student access, resume matching persistence, database constraints, eligibility enforcement, and rejected-application interview restrictions.
- No database migration, auth logic, eligibility rule, resume matcher, recruiter flow, or seeded development record was changed.

## Final checks and limits

- Backend tests: 37 passed, 0 failed, 0 skipped, with test database and live FastAPI configured.
- Python ML/matcher tests: 9 passed.
- Frontend production build: passed; Vite transformed 108 modules.
- Browser click-through: **BLOCKED**. The Windows computer-use helper stopped because it could not identify Chrome's current URL with enough confidence. No visual rendering, laptop/mobile viewport, or student/officer/recruiter browser workflow is claimed as verified.
- Frontend unit tests: not configured. `npm audit` was not rerun during this audit.

The existing project has a solid API/database verification base and now has actual ML grouping in the officer flow. Treat the complete website demonstration as **PARTIAL** until a person verifies the rendered UI and visible workflows in a normal browser session. Detailed test commands and dates are in [testing.md](testing.md); K-Means assumptions and limits are in [student-clustering.md](student-clustering.md).
