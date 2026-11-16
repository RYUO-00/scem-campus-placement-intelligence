# SQL optimization evidence

## Representative query

The practical measures application counts for one placement drive and status:

```sql
SELECT status, COUNT(*)::INTEGER AS application_count
FROM applications
WHERE drive_id = (SELECT uuid_value FROM sql_practical_context WHERE key='plan_drive_id')
  AND status = 'applied'
GROUP BY status;
```

The temporary `sql_practical_context` relation supplies a UUID created by the runner. The application table already has the composite B-tree index `idx_applications_drive_status (drive_id, status)` from migration 001. Both predicates are equality conditions, matching the index's leading columns.

## Experiment and observed plan

The SQL practical uses 8,000 synthetic query-plan students across 12 synthetic drives, creating 24,000 applications. It drops the normal composite index and creates an equivalent experiment index inside a transaction, runs `ANALYZE`, executes `EXPLAIN (ANALYZE, BUFFERS)`, then rolls the transaction back. The test database's original index is restored.

The recorded PostgreSQL 18.6 plan selected:

```text
GroupAggregate
  -> Bitmap Heap Scan on applications (actual rows=2000)
       Recheck Cond: drive_id = ... AND status = 'applied'
       -> Bitmap Index Scan on sql_practical_plan_drive_status (actual rows=2000)
            Index Cond: drive_id = ... AND status = 'applied'
Execution Time: 0.844 ms
```

The run reported 37 shared buffer hits and 4 shared reads for the application plan, with the context lookup served by its temporary primary-key index. The full plan is preserved in [`sql-practical-results.json`](sql-practical-results.json), case Q17.

## Interpretation and limits

The planner used the composite index to identify rows matching both the drive and status, then visited the matching heap pages and aggregated them. That observed access path supports retaining the existing `(drive_id, status)` index for this filtering/reporting pattern. The experiment demonstrates index use on a workload larger than the roster examples.

The recorded execution time is one local run on PostgreSQL 18.6 and is sensitive to cache, hardware, server settings, and data distribution. There is no controlled before/after timing comparison in this report, so it does not claim a measured speedup. Re-run `npm --workspace backend run db:practicals` to regenerate the plan on the local environment.
