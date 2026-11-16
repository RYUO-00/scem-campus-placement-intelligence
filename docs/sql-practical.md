# PostgreSQL SQL practical

This practical is a runnable viva collection, not a list of unexecuted examples. The statements are in [`backend/database/sql-practical.sql`](../backend/database/sql-practical.sql), with synthetic setup, isolation checks, per-case execution, cleanup, and evidence generation in [`backend/database/run-practicals.mjs`](../backend/database/run-practicals.mjs).

## Reproduce it safely

1. Create a dedicated PostgreSQL database whose name contains `test`, for example `scem_placement_test`.
2. Set `TEST_DATABASE_URL` to that database. The runner refuses a database name without `test` and refuses the configured `DATABASE_URL` endpoint.
3. From the project root run:

   ```powershell
   $env:TEST_DATABASE_URL = 'postgresql://local_role:URL_ENCODED_PASSWORD@localhost:5432/scem_placement_test'
   npm --workspace backend run db:practicals
   ```

The runner applies outstanding migrations, adds uniquely tagged synthetic roster, application, offer, interview, import, and AI rows; runs each case; and deletes its tagged records. It creates 8,000 synthetic query-plan students and 24,000 related applications. It does not use a real roster or modify the development database. The plan case replaces the application drive/status index only inside a transaction and rolls the DDL back after measuring it.

The temporary `sql_practical_context` relation supplies concrete IDs and prefixes to examples, so there are no unexplained `$1` parameters. All statements run on one connection with temporary context values created by the runner.

## Example index

```sql
CREATE INDEX sql_practical_plan_drive_status ON applications(drive_id, status);
ANALYZE applications;

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT status, COUNT(*)::INTEGER AS application_count
FROM applications
WHERE drive_id = (SELECT uuid_value FROM sql_practical_context WHERE key='plan_drive_id')
  AND status = 'applied'
GROUP BY status;
```

The experiment is Q15–Q17. The migration's normal index is restored by rollback after the plan is captured.

## Case guide

| ID | Demonstrates |
|---|---|
| Q01–Q02 | `CREATE TEMP TABLE`, `INSERT`, generated keys, and `RETURNING`. |
| Q03–Q04 | Roster filtering/sorting and `UPDATE`. |
| Q05–Q07 | `INNER JOIN`, `LEFT JOIN`, and `NOT EXISTS`. |
| Q08–Q11 | `GROUP BY`, `HAVING`, `COUNT`, `AVG`, `MIN`, `MAX`, and scalar subquery. |
| Q12–Q13 | A temporary view reading the migrated `drive_application_summary` view. |
| Q14 | `RANK()` over applicants' CGPA. |
| Q15–Q17 | Index creation, `ANALYZE`, and a measured `EXPLAIN ANALYZE` placement query. |
| Q18 | Owner-scoped import summary. |
| Q19–Q20 | Valid academic insert and the `updated_at` trigger. |
| Q21 | Multi-step `BEGIN`/`COMMIT` changing application status and inserting an interview together. |
| Q22 | Intentional CGPA update followed by `ROLLBACK` and readback. |
| Q23 | Controlled `DELETE` of a temporary synthetic row. |
| Q24–Q30 | Duplicate/case-variant registration, invalid FK, CGPA above 10, invalid role/status, and NULL required company name rejection. |

The database-backed API suite additionally verifies CGPA below zero, negative backlogs, duplicate student-drive applications, duplicate company names, and valid GPA 10.00.

## Executed evidence

On 2026-10-20 (Asia/Calcutta), the runner executed all 30 cases on PostgreSQL 18.6 in `scem_placement_test`: **30 passed, 0 failed, 0 unverified**. It separately confirmed that the synthetic fixture cleanup passed. The commit check read back `under_review` plus one interview row. The rollback check read back the original CGPA `8.75`. Constraint cases observed SQLSTATE `23502` (not null), `23505` (unique), `23503` (foreign key), and `23514` (check constraint) where expected.

The complete machine-readable report includes query IDs, purposes, status, row counts/results, version, query-plan text, transaction evidence, cleanup, and limitations: [`sql-practical-results.json`](sql-practical-results.json). Query-plan interpretation and its timing limits are documented in [SQL optimization](sql-optimization.md).
