# Student roster import

The canonical workbook is `backend/database/templates/SCEM_Student_Roster_Import_Template_4SF_Format.xlsx`. The Placement Cell download serves this same workbook. Its first worksheet, `Roster Import`, contains only these headers, in this order:

`registration_number, full_name, branch_code, cgpa, active_backlogs, graduation_year, email, phone`

The import worksheet is empty below its header. `Instructions` and `Registration Format Guide` hold the format notes, explicit department mappings, examples, and illustrative cohort counts so none of those guide rows can be imported as students. Run `npm --workspace backend run db:roster-template` after changing the shared template generator.

The official registration format is `^4SF(24|25)(IS|CS|AI|RE|ME|EC)\d{3}$`. Values remain text, including leading zeros; harmless surrounding whitespace and letter case are normalized before duplicate checks and storage. The importer and public student registration API use the same centralized policy in `backend/src/config/registrationPolicy.js`. Existing synthetic development IDs matching `DEMO` plus a four-digit demo year and suffix remain supported. Obsolete formats such as `24AI001`, `RE001`, and `ME001` are rejected.

Registration department codes map explicitly to canonical `branches.branch_code` values. Confirmed mappings follow the college's published department/program names: [official Sahyadri program listing](https://www.sahyadri.edu.in/) shows CS, IS, EC, ME, and CS(AI&ML), which correspond to this project's CSE, ISE, ECE, MECH-ROBOTICS, and CSE-AIML branches. Its listing uses RA for Robotics & Automation and does not confirm a registration code `RE`, so `RE` remains unresolved rather than being mapped by assumption:

| Registration code | Canonical branch | Mapping state |
| --- | --- | --- |
| `IS` | `ISE` | Confirmed |
| `CS` | `CSE` | Confirmed |
| `AI` | `CSE-AIML` | Confirmed |
| `EC` | `ECE` | Confirmed |
| `ME` | `MECH-ROBOTICS` | Confirmed |
| `RE` | — | Unresolved; import and account registration are blocked pending confirmation |

`branch_code` in the workbook is the canonical application branch. An official-format registration number must agree with its configured mapping; the importer never infers a branch by searching the ID. `GET /api/officer/registration-policy` returns the configured map and unresolved codes. The mapping lives in the shared registration policy module so confirmed departments can be added without changing parsing or registration logic.

In this project's branch table, `EC` means Electronics and Computer Engineering, while the college's published `BE-EC` program is Electronics and Communication Engineering (the published Electronics and Computer Engineering program is `BE-UE`). Therefore registration code `EC` maps to canonical `ECE`; legacy `DEMO` records already attached to canonical `EC` are left untouched. The published robotics code is `RA`, not the supplied `RE`, so `RE` needs Placement Cell confirmation.

CSV and XLSX files up to 5 MB and 10,000 rows are accepted. XLSX parsing reads the first worksheet. All eight headers are required; a phone cell may be blank. Branch codes must refer to active configured branches. Preview checks registration format/mapping, row fields, duplicates within the file, and existing normalized registration numbers. Existing records are skipped and never overwritten. Invalid rows are reported and excluded. The preview is staged for the uploader in PostgreSQL for 30 minutes by default (`IMPORT_PREVIEW_MINUTES` can configure 5–120 minutes). Confirmation locks the import, rechecks branch availability and normalized uniqueness, writes all insertable records in one transaction, and can only be used once. No student account is created by import; a student registers later against the roster name, registration number, and imported email.

The synthetic seed roster contains two 2024-intake records and one 2025-intake record for each currently mapped department. `RE` is omitted until its mapping is confirmed. The workbook’s 2-to-1 cohort example is illustrative only; genuine imports always reflect the uploaded roster, regardless of its distribution.
