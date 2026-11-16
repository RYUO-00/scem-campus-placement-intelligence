# Technical decisions and current trade-offs

> **Purpose:** Record implementation-backed decisions for future maintenance.  
> **Updated:** 2026-10-20

These entries describe the choices visible in the current code. Unless stated otherwise, the rationale is inferred from how the implementation is structured; this document does not claim that a formal decision meeting or approval took place.

## Web architecture

### React with Vite for the browser application

- **Decision:** Use React, React Router, and Vite for the client application.
- **Context:** The project has several role-specific forms, tables, dialogs, and dashboard views.
- **Reason:** *Inferred:* component state and route-level pages keep the interactive workflows organized; Vite provides a local server and production build.
- **Trade-offs:** The client provides navigation and display only; server-side authorization remains necessary. A separate build and API must be run for development.
- **Current status:** Implemented in `frontend/`; the frontend package defines `dev`, `build`, and `preview` scripts, with no frontend test script.

### Express is the trusted API and database boundary

- **Decision:** Route all browser operations through Express rather than connecting the frontend directly to PostgreSQL.
- **Context:** Authentication, ownership checks, validation, eligibility, and record changes must use trusted server-side rules.
- **Reason:** *Inferred:* the API can enforce one consistent authorization and transaction boundary for all roles.
- **Trade-offs:** The API is a central dependency; its health and database connection affect most workflows.
- **Current status:** Implemented in `backend/src/`, using parameterized PostgreSQL queries and role-specific routers.

### PostgreSQL as the placement record store

- **Decision:** Store operational data in relational tables with foreign keys, uniqueness, checks, indexes, migrations, and selected JSON snapshots.
- **Context:** Applications relate students, drives, employers, interviews, offers, and imports.
- **Reason:** *Inferred:* relational constraints and joins make these relationships and DBMS exercises concrete and inspectable.
- **Trade-offs:** Schema changes require migrations; intentionally historical or model-result details remain JSONB documents rather than individually constrained columns.
- **Current status:** Migrations live in `backend/database/migrations/`; see [database design](database-design.md).

## Placement decision methods

### Eligibility uses explicit hard rules

- **Decision:** Determine eligibility by backend checks for CGPA, backlog count, branch, drive publication, and deadline.
- **Context:** Mandatory requirements need predictable pass/fail explanations.
- **Reason:** *Inferred:* deterministic rules are easier to explain, validate, and reproduce than inferred ML decisions.
- **Trade-offs:** Rules depend on accurate roster and drive values; incomplete academic data prevents an eligible result.
- **Current status:** Implemented in `backend/src/services/eligibility.js`; applications save a criteria snapshot.

### Resume matching uses TF-IDF and cosine similarity

- **Decision:** Compare normalized resume text with a job description using TF-IDF word/ngram features and cosine similarity, alongside a finite recognized skill vocabulary.
- **Context:** Students benefit from a lightweight local text-overlap summary.
- **Reason:** *Inferred:* the method can run locally without external AI credentials and returns inspectable text/skill signals.
- **Trade-offs:** Synonyms, context, unrecognized skills, and work quality are not understood reliably. A score is not probability or candidate rank.
- **Current status:** Implemented in `ai-service/app/matcher.py`; successful results are stored per student and drive.

### K-Means is exploratory and on demand

- **Decision:** Use deterministic scikit-learn K-Means for profile similarity groups, with silhouette-based selection of a valid cluster count when not supplied.
- **Context:** The officer directory offers an exploratory grouping action.
- **Reason:** *Inferred:* on-demand inference avoids treating clusters as a permanent student field and lets the feature run without changing schema.
- **Trade-offs:** Labels can shift as roster features change, small/identical datasets can be insufficient, and clusters have no placement-success target.
- **Current status:** Implemented in `ai-service/app/clustering.py` and `POST /api/officer/student-groups`; results are not persisted.

## Identity, data, and development

### Registration is roster-linked and student-only

- **Decision:** Public registration can create only a student account and requires a match to an unclaimed roster name, registration number, and email.
- **Context:** The project imports academic roster records before student accounts may exist.
- **Reason:** *Inferred:* this links accounts to an existing student row without allowing public self-assignment of an officer or recruiter role.
- **Trade-offs:** Matching these fields is a prototype verification method and is not equivalent to institution-managed identity proofing.
- **Current status:** Implemented in `backend/src/routes/auth.js`; unresolved registration-code mappings are rejected.

### Recruiter access derives from an assigned company

- **Decision:** Recruiter queries and writes are scoped through the authenticated account's recruiter/company relation.
- **Context:** Recruiters should only see their company's drives and applicants.
- **Reason:** *Inferred:* server-derived ownership prevents a client-supplied company ID from granting cross-company access.
- **Trade-offs:** Each recruiter account needs a correct company assignment before use.
- **Current status:** Implemented in recruiter queries and covered by integration tests; see [security](security.md).

### Separate development and test databases

- **Decision:** Route integration tests and the SQL practical to a separately named database through `TEST_DATABASE_URL`.
- **Context:** The tests and practical create temporary fixtures and apply migrations.
- **Reason:** *Inferred:* separation and database-name guards reduce the risk of altering development data.
- **Trade-offs:** The test database must be created and configured before DB-backed tests run.
- **Current status:** Test runners require a database name containing `test`; test commands must not be pointed at valuable or production data.

### Mailtrap sandbox for local password recovery

- **Decision:** Send development reset emails through configured Mailtrap Email Sandbox SMTP, when enabled.
- **Context:** The reset flow needs a message channel to exercise email links without delivering to synthetic users.
- **Reason:** *Inferred:* a sandbox lets developers inspect the message and link without a production mail sender.
- **Trade-offs:** SMTP acceptance alone does not prove an inbox message or a completed reset. Production email delivery is not configured by this local setup.
- **Current status:** Integration is implemented. Real sandbox delivery and role reset flows were verified on 2026-10-20; see the [test plan](TEST_PLAN.md). No secret values belong in documentation.

## Related documentation

[Product requirements](PRD.md) · [Architecture](architecture.md) · [Design](DESIGN.md) · [Test plan](TEST_PLAN.md) · [Security](security.md) · [AI handoff](MEMORY.md)
