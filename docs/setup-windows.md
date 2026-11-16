# Windows setup (PowerShell)

This guide uses PostgreSQL databases you create locally. It does not require Docker or cloud services. Use synthetic data only.

## Requirements

- Windows 10 or 11.
- Node.js 20.19+ or 22.12+ and npm.
- PostgreSQL 14+ with `psql` available, or use the PostgreSQL SQL Shell.
- Python 3.11+ for local resume matching and K-Means student grouping.

Check the installed tools:

```powershell
node --version
npm --version
python --version
psql --version
```

## Create local databases

Start the PostgreSQL Windows service, then connect as a local PostgreSQL administrator. In `psql`, run this once, replacing the example password with a private local password:

```sql
CREATE ROLE scem_dev LOGIN PASSWORD 'replace-with-a-local-password';
CREATE DATABASE scem_placement OWNER scem_dev;
CREATE DATABASE scem_placement_test OWNER scem_dev;
```

If the role already exists, keep it and create only the missing databases. The test database is separate and its name includes `test`, which the test and SQL practical runners require.

## Configure environment files

From the project root, install dependencies and copy the examples only if local files do not already exist. These commands preserve any existing secrets:

```powershell
npm install
if (-not (Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
if (-not (Test-Path frontend/.env)) { Copy-Item frontend/.env.example frontend/.env }
```

Edit `backend/.env` locally:

```dotenv
DATABASE_URL=postgresql://scem_dev:URL_ENCODED_LOCAL_PASSWORD@localhost:5432/scem_placement
TEST_DATABASE_URL=postgresql://scem_dev:URL_ENCODED_LOCAL_PASSWORD@localhost:5432/scem_placement_test
FRONTEND_ORIGIN=http://localhost:5173
JWT_SECRET=generated-random-secret-of-at-least-32-characters
AI_SERVICE_URL=http://localhost:8000
```

URL-encode reserved characters in a database password (for example `@` becomes `%40`). Generate a new secret in PowerShell and paste it into `.env` without sharing it:

```powershell
$secretBytes = New-Object byte[] 48
[System.Security.Cryptography.RandomNumberGenerator]::Fill($secretBytes)
[Convert]::ToBase64String($secretBytes)
```

Never commit `.env` files. They are ignored by Git. The test runner checks that the test database name contains `test`; the SQL practical runner also refuses the same host, port, and database as `DATABASE_URL`.

## Migrate, seed, and start

```powershell
npm --workspace backend run db:migrate
npm --workspace backend run db:seed
python -m venv ai-service/.venv
.\ai-service\.venv\Scripts\Activate.ps1
python -m pip install -r ai-service/requirements.txt
deactivate
npm run dev
```

If PowerShell blocks activation, use `ai-service\.venv\Scripts\python.exe -m pip install -r ai-service/requirements.txt`; the root `dev:ai` script selects that virtual environment automatically when it exists. Open `http://localhost:5173`. Check the API at `http://localhost:4000/api/health` and local matching/grouping service at `http://localhost:8000/health`.

The backend's PDF.js and Mammoth libraries are installed through the root `npm install`; no separate PDF/DOCX executable or service is needed. Resume file limits and OCR/password restrictions are documented in [resume format support](resume-formats.md).

To create local placement officer or recruiter demo accounts during initial setup, set each matching `DEV_*_EMAIL` and `DEV_*_PASSWORD` pair in `backend/.env`, then run `db:seed`. Use private passwords of at least 12 characters. The seed contains synthetic examples only.

For an already seeded database, `npm --workspace backend run db:provision-officer` creates or repairs only the configured development Placement Officer using bcrypt. It does not rerun the data seed or change other accounts. Keep the password in the ignored `backend/.env`; it is never printed by the command.

## Run tests and the SQL practical

With `TEST_DATABASE_URL` configured to the dedicated test database:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://scem_dev:URL_ENCODED_LOCAL_PASSWORD@localhost:5432/scem_placement_test'
npm test
npm run build
python -m unittest discover -s ai-service/tests
npm --workspace backend run db:practicals
```

`db:practicals` applies any missing migrations, creates tagged synthetic records in one test run, executes the labeled SQL statements, writes `docs/sql-practical-results.json`, and deletes its fixtures. It requires a dedicated database whose name includes `test`; never point it to production or a database with valuable data. The query-plan case temporarily swaps an index inside a rolled-back transaction.

To configure the connection only for the current PowerShell session, use `$env:TEST_DATABASE_URL = '...'` as above. Do not put passwords into committed files or share terminal transcripts containing secrets.

## Troubleshooting

- **`ECONNREFUSED`**: confirm the PostgreSQL service is running and the configured port is correct.
- **Password authentication failed**: check the local role/password and URL-encode reserved characters.
- **`TEST_DATABASE_URL` rejected**: use a separate database with `test` in its name.
- **AI dependencies missing**: install requirements with `ai-service\.venv\Scripts\python.exe -m pip install -r ai-service/requirements.txt`.
- **PowerShell cannot find `python`**: install Python 3.11+ and enable its PATH option, then reopen PowerShell.

For schema and migration details see [database design](database-design.md), and for the executed DBMS practical and results see [SQL practical](sql-practical.md).
