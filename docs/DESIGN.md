# User interface and workflow design

> **Purpose:** Describe the current interface as implemented, not propose a redesign.  
> **Updated:** 2026-10-20

## Contents

- [Interface structure](#interface-structure)
- [Pages by role](#pages-by-role)
- [Key workflows](#key-workflows)
- [Feedback and responsive behavior](#feedback-and-responsive-behavior)
- [Verification boundary](#verification-boundary)
- [Related documentation](#related-documentation)

## Interface structure

The React application uses a shared authentication layout for login, registration, and password recovery. Signed-in users enter a shared portal shell with a left-side role-specific navigation, college branding, a workspace label, an identity chip, a sign-out confirmation dialog, a page content area, and a prototype footer. `frontend/src/layouts/PortalLayout.jsx` provides the portal shell; `frontend/src/components/Branding.jsx` uses local Sahyadri SVG assets in `frontend/public/assets/` and switches to a compact asset at narrow widths.

The visual system uses reusable panels, page headings, feedback banners, stat cards, tables, dialogs, status pills, and charts. It is a restrained college project dashboard, not a production design system. The pages present current application data and label synthetic or prototype context where applicable.

## Pages by role

| Role | Routes and pages |
|---|---|
| Public/authentication | `/login`, `/register`, `/forgot-password`, `/reset-password` |
| Student | `/dashboard`, `/drives`, `/applications`, `/profile` |
| Placement Officer / TPO | `/dashboard`, `/students`, `/imports`, `/manage-drives`, `/reviews`, `/reports` |
| Recruiter | `/dashboard`, `/recruiter-drives` |

`frontend/src/App.jsx` lazy-loads pages and gates protected routes by role. API authorization is separate and authoritative.

## Key workflows

### Student

1. Sign in or register using a roster-linked identity. Registration requires an imported record with matching name, registration number, and email.
2. Review the dashboard, profile completeness, recent activity, and application counts.
3. Browse published drives and optionally search by role, company, or location.
4. Request a rule-based eligibility check. The page shows explanations and exposes **Apply** only when eligible.
5. Optionally request resume matching for a drive. The page labels the score as text similarity and shows recognized skill overlap.
6. Review applications, interview activity, and offers; update contact and resume text in the profile.

### Placement Officer / TPO

1. Review the placement overview and application-stage chart.
2. Import a roster by downloading the blank workbook or fictional demo roster, uploading CSV/XLSX, reviewing row outcomes, and confirming a valid preview.
3. Use the Student Directory search and filters for name/registration/email, department, intake year, and portal-account status. Directory totals and visible sections group students by canonical department and intake cohort; pagination controls the displayed student rows.
4. Request K-Means groups from the directory. Loading, service error, insufficient-data, and successful cluster summaries are rendered when the corresponding responses occur. Each successful run has cluster counts, averages, common skills, explanations, and expandable membership lists.
5. Manage branches, companies, drives, allowed branches, thresholds, deadlines, and publication status.
6. Review applications, move them through permitted statuses, record interview rounds, and create offers.
7. Inspect reports and export application or offer CSV files.

Directory filters affect the directory result and its summaries. K-Means is a separate request against the current roster; it is not a cluster of only the visible search page.

### Recruiter

1. Open the recruiter overview with assigned drive, applicant, shortlist, and offer counts.
2. Select an assigned drive and review only its applicants and allowed resume text.
3. Change a review status through a confirmation dialog. Rejection requires explicit confirmation; a rejected application must be reopened to **Under review** before interview rounds can be added.
4. Add interview rounds using the shared round dialog and review existing round outcomes.

### Shared password recovery

The login page links to a role-neutral recovery form. It returns the same confirmation for known and unknown addresses. A message captured in the development Mailtrap sandbox contains a single-use link that expires after 30 minutes. The reset page asks for a new password and confirmation; success directs the user back to sign-in. The form explicitly warns that the generic confirmation does not establish email delivery.

## Feedback and responsive behavior

Pages use shared loading indicators, error banners, success messages, empty states, field validation, disabled busy controls, and confirmation dialogs. The password input defaults to masked text and has a keyboard-operable show/hide button with an accessible label. The dashboard and directory use responsive grids and horizontally scrollable wide tables where applicable; charts use responsive Chart.js containers.

These descriptions reflect source code and interface copy. For dated browser evidence and its coverage boundary, see the [test plan](TEST_PLAN.md); a successful build alone does not verify a rendered interaction.

## Verification boundary

Password-recovery flows were checked in the built-in browser as recorded in the test evidence. That work did not constitute a full visual audit of every page, control, or viewport. Do not treat a code description as proof that a particular screen was visually tested.

## Related documentation

[Product requirements](PRD.md) · [Architecture](architecture.md) · [Test plan and evidence](TEST_PLAN.md) · [Security](security.md) · [AI handoff](MEMORY.md)
