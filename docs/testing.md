# Testing

## Commands

```powershell
npm test
npm run build
python -m unittest discover -s ai-service/tests
```

The Node suite uses `node:test` and tests eligibility boundaries, application transitions, CSV parsing, and XLSX parsing, including malformed files and worksheet row numbers. Python tests check score bounds, skill extraction, and blank input behavior.

## Integration prerequisites

The complete API route and database integration suite requires the JavaScript dependencies installed and a separate test PostgreSQL database. Set `TEST_DATABASE_URL` to that dedicated database; the suite refuses database names that do not include `test` and runs the migrations. Do not point it at the local demo or production database.

## Results for this workspace

Verified on 2026-10-15:

| Command | Result |
| --- | --- |
| `npm --workspace backend test` | 10 passed; 1 PostgreSQL route suite skipped because `TEST_DATABASE_URL` is not configured. |
| `npm run build` | Passed with Vite 8.3.4. |
| `.\\ai-service\\.venv\\Scripts\\python.exe -m unittest discover -s ai-service/tests` | 2 passed. |
| Node source syntax checks and Python `compileall` | Passed. |
| `npm audit` | 0 known vulnerabilities. |

No PostgreSQL client or Docker executable was available in this workspace. Migrations, seed execution, and the database-backed route suite therefore remain unverified locally; the skipped suite is not counted as a pass.
