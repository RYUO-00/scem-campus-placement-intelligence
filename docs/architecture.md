# Architecture and workflows

## System components

```mermaid
flowchart LR
  Student[Student browser]
  Officer[Placement officer browser]
  Recruiter[Recruiter browser]
  UI[React + Vite]
  API[Express REST API]
  DB[(PostgreSQL)]
  AI[FastAPI + scikit-learn]
  Student --> UI
  Officer --> UI
  Recruiter --> UI
  UI -->|Cookie-authenticated /api| API
  API -->|Parameterized SQL, pooled connection| DB
  API -->|Local POST /match| AI
```

## Student placement workflow

```mermaid
flowchart TD
  A[Student record imported by officer] --> B[Student registers with matching name, registration number, email]
  B --> C[Authenticated account is linked to imported record]
  C --> D[Browse published drives]
  D --> E[Check CGPA, backlogs, branch, drive status and deadline]
  E -->|Eligible| F[Apply]
  E -->|Not eligible| G[Show reasons; do not submit]
  F --> H[Store application and eligibility snapshot]
  H --> I[Officer/recruiter review]
  I --> J[Student follows status, interview and offer]
```

## Placement officer workflow

```mermaid
flowchart LR
  A[Officer account provisioned in local seed config] --> B[Manage companies]
  B --> C[Create drive and eligibility criteria]
  C --> D[Publish drive]
  D --> E[Review applications]
  E --> F[Shortlist, reject, schedule interviews]
  F --> G[Record offer]
  G --> H[Live database reports]
```

## Bulk import workflow

```mermaid
flowchart TD
  A[Download CSV template] --> B[Select CSV or XLSX]
  B --> C[Validate headers and every row]
  C --> D[Stage preview rows with uploader and expiry]
  D --> E{Officer confirms before expiry?}
  E -->|No| F[Preview expires; no student rows inserted]
  E -->|Yes| G[Lock preview and recheck branch + registration number]
  G --> H[One database transaction inserts valid rows]
  H --> I[Persist counts, skipped/failed rows, and report]
```

## AI resume matching workflow

```mermaid
sequenceDiagram
  participant S as Student browser
  participant E as Express API
  participant P as Python matcher
  participant D as PostgreSQL
  S->>E: POST /api/ai/match/:driveId
  E->>D: Load authenticated student's resume and published job description
  E->>P: POST /match (resume text, job description)
  P-->>E: TF-IDF score, skills, grounded suggestions
  E->>E: Validate score and result shape
  E->>D: Store successful result for the authenticated student
  E-->>S: Similarity result and limitation note
```

Express owns authentication, authorization, data validation, and persistence. The Python service has no database credentials. Core workflows continue if the matcher is unavailable.
