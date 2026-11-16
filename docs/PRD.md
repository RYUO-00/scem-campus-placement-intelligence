# Product Requirements Document

> **Purpose:** Describe the existing academic prototype and its current requirements.  
> **Project:** Unified Campus Placement and Eligibility Intelligence System  
> **Institutional context:** Sahyadri College of Engineering & Management (SCEM), Mangaluru  
> **Updated:** 2026-10-20

## Contents

- [Overview](#overview)
- [Problem and objectives](#problem-and-objectives)
- [Users](#users)
- [Requirements](#requirements)
- [User journeys](#user-journeys)
- [Scope and boundaries](#scope-and-boundaries)
- [Implementation status and limitations](#implementation-status-and-limitations)
- [Related documentation](#related-documentation)

## Overview

This project is a student-built local web application prototype for organizing campus placement information. It brings student roster records, placement drives, eligibility checks, applications, recruiter review, interviews, offers, and database-derived reports into one interface. It also includes local resume text matching and an optional student-profile grouping feature.

The prototype is not an official SCEM deployment and is not connected to institutional student, recruiter, or placement systems. Seeded people and placement outcomes are synthetic. The user interface uses Sahyadri branding assets, while the project identifies itself as an academic prototype.

## Problem and objectives

Placement information can be difficult to manage when roster, employer, drive, application, and interview information is spread across separate files or informal processes. The system demonstrates how these records and workflows can be represented in one web application with database constraints and role-specific access.

The project has been framed around these three objectives:

1. **Centralize placement records** in a relational PostgreSQL database with student, company, drive, application, interview, and offer relationships.
2. **Apply clear placement rules** consistently and provide an exploratory way to group similar student profiles.
3. **Support job matching and placement reporting** with resume-text similarity and database-derived analytics.

These objectives describe the prototype's scope; they are not evidence of formal stakeholder approval or measured institutional outcomes.

## Users

| User | Needs addressed by this prototype |
|---|---|
| Student | Register against an imported roster record, maintain permitted profile and resume details, browse drives, understand hard eligibility rules, apply, and review application or offer status. |
| Placement Officer / TPO | Maintain branches, companies, and drives; import and review student records; review applications; record interviews and offers; and inspect reports. |
| Recruiter | View only drives and applicants belonging to the recruiter's assigned company; review applicant information; update permitted review statuses; and add interview rounds. |

Role names in the database are `student`, `placement_officer`, and `recruiter`. The login role selector is a user-interface choice; the server checks the account's stored role on protected requests.

## Requirements

### Identity and student records

- Students can create an account only when their name, registration number, and email match an unclaimed imported roster record.
- Student profile edits do not change roster-controlled academic fields such as CGPA, branch, backlog count, or graduation year.
- Students can upload supported resume documents for text extraction and edit the saved resume text.
- Placement officers can search, filter, and review roster records and import CSV/XLSX files through a staged preview and confirmation workflow.

### Drives, eligibility, and applications

- Placement officers can manage configurable branches, companies, placement drives, drive status, and eligibility criteria.
- Students can browse published drives and request an eligibility check.
- Eligibility checks enforce CGPA, active backlogs, branch availability, published status, and application deadline. The result is separate from resume similarity and profile grouping.
- Students can apply only when the backend confirms eligibility. The application retains a snapshot of the decision criteria at submission time.
- Students can follow their applications and respond to their own pending offers.

### Recruiter review and placement operations

- Recruiters see company-scoped drives and applicant records. The company association comes from the authenticated account, not a company ID supplied by the browser.
- Placement officers and recruiters can make only the status changes allowed by the server workflow.
- Authorized reviewers can record interview rounds. Placement officers can create offers; an application can have at most one offer.
- Placement officers can inspect current application and offer reports and export supported CSV reports.

### Matching and student grouping

- A student can request resume matching for a drive. The local Python service compares resume text and the job description using TF-IDF and cosine similarity, then reports recognized skill overlap and suggestions.
- The similarity score describes text overlap only. It is not a hiring probability, eligibility result, or placement recommendation.
- Placement officers can request K-Means grouping based on CGPA, active backlog count, and recognized resume skills. Results are computed on demand and are not persisted. Group membership does not predict placement success or change eligibility.

### Quality requirements

- **Security:** Enforce role and ownership checks in the API; hash passwords; validate input; use database constraints and parameterized SQL; keep local secrets out of source control.
- **Reliability:** Use database transactions for multi-step operations such as import confirmation, registration, and password reset. Return useful loading, empty, validation, and error states where implemented.
- **Usability:** Keep student, officer, and recruiter tasks in role-specific navigation; explain eligibility and validation outcomes; support laptop and narrow layouts through responsive styling.
- **Maintainability:** Separate React interface, Express API, PostgreSQL schema/migrations, and Python inference service.
- **Data integrity:** Preserve student, company, drive, application, interview, and offer relationships with keys and constraints. Keep synthetic demo data distinguishable from real institutional data.

## User journeys

1. **Roster-to-student account:** an officer previews and confirms a CSV/XLSX import; a student later registers using the matching name, registration number, and imported email.
2. **Drive-to-application:** an officer creates and publishes a drive; a student checks eligibility, reviews any reasons, and applies if eligible; the application is stored with its criteria snapshot.
3. **Recruiter review:** a recruiter opens an assigned company drive, reviews applicants, updates an allowed status, and adds interview rounds where the application state permits.
4. **Resume feedback:** a student saves resume text and requests a match for a published drive; Express authorizes and persists the returned result from the local matcher.
5. **Officer reporting:** an officer reviews summary charts and tables derived from PostgreSQL records and can export application or offer data.

## Scope and boundaries

**Included:** local role-based portal, PostgreSQL-backed records, student roster imports, deterministic eligibility rules, applications and review lifecycle, local resume text matching, on-demand K-Means profile grouping, and officer reporting.

**Excluded:** production hosting, integration with official SCEM systems, institutional identity verification, external hiring decisions, real placement statistics, OCR for image-only resumes, public or cloud AI services, and automated import-preview retention cleanup.

## Implementation status and limitations

| Area | Current state |
|---|---|
| Student, officer, and recruiter workflows | Implemented in the React and Express applications. Exact routes and page map are described in [architecture](architecture.md) and [design](DESIGN.md). |
| Student import and ownership | Implemented with validation, per-officer preview ownership, and transactional confirmation. See [security](security.md) and [database design](database-design.md). |
| Eligibility, applications, reviews, interviews, offers | Implemented with server-side rules, status validation, and database constraints. |
| Resume matching | Implemented locally with TF-IDF/cosine similarity; limited by text extraction and a finite skill vocabulary. |
| K-Means grouping | Implemented as an officer-triggered FastAPI request; results are transient, and small or indistinguishable datasets may return insufficient-data status. |
| Analytics | Implemented using current prototype database records. Synthetic seed data must not be presented as institutional placement outcomes. |
| Password recovery | Implemented with short-lived single-use tokens and development Mailtrap sandbox delivery when configured. Production email delivery and operational recovery processes are outside scope. |
| Deployment and identity assurance | Not implemented as production services. Public student registration uses roster matching rather than an institution-approved identity provider. |

See [test plan](TEST_PLAN.md) for dated verification evidence and its limits. Claims in that file distinguish earlier executions from checks not run during this documentation update.

## Related documentation

[Architecture](architecture.md) · [Design](DESIGN.md) · [Test plan](TEST_PLAN.md) · [Security](security.md) · [Decisions](DECISIONS.md) · [AI handoff](MEMORY.md)
