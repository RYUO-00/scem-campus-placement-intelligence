# Student profile grouping with K-Means

Placement officers can request groups from the Student directory. The feature runs the existing scikit-learn service against the current PostgreSQL roster through Express; it is not a static demo result.

## Data flow and access

The browser sends `POST /api/officer/student-groups`. The entire `/api/officer` router requires the `placement_officer` role. Express reads each row in `students` once, sends only CGPA, active backlog count, and saved resume text to FastAPI, then validates the returned input positions and maps them back to an officer-authorized subset of roster fields. Student IDs, names, registration numbers, emails, phone numbers, department, graduation year, and authentication fields are not sent to the model. FastAPI rejects unknown profile fields.

The local FastAPI runner binds to `127.0.0.1:8000`; it does not connect to PostgreSQL. Express remains the only database owner. A service outage returns HTTP 503 with a useful message. The service accepts up to 2,000 profiles per request.

## Features and preprocessing

The feature matrix uses the available values only:

- **Numeric features:** CGPA and active backlog count. Missing values are filled with the median of the current usable roster; missing-value flags are included. Both numeric columns are standardized, then the numeric block is L2-normalized per student.
- **Skill features:** the project's existing recognized resume skill vocabulary is represented as a multi-hot vector and L2-normalized. Free-form resume text is used only to extract recognized skills; it is not a model feature.
- **Combined features:** the normalized numeric and skill blocks receive equal weight when present. A profile with only one block is normalized to unit length. Students with either useful academic data or at least one recognized skill are eligible for clustering.

Invalid CGPA (non-finite or outside 0–10), invalid backlog values (non-finite, negative, or fractional), or non-text resume input exclude that record with a counted reason. Profiles missing both academic values and all recognized skills are also excluded. Missing CGPA/backlog fields alone do not exclude a profile when the other features provide information.

Each student table row occurs once in the request. Department and graduation year are intentionally excluded, so the result groups academic and skills profiles across departments. Eligibility is independent: ineligible students remain part of the unsupervised profile analysis, and group membership never changes an eligibility result.

## Algorithm and cluster count

The service fits scikit-learn `KMeans` with `random_state=42` and `n_init=20`. By default it evaluates valid values of *k* from 2 through the smaller of 8, usable student count minus one, and the count of distinct feature vectors. It selects the valid run with the highest silhouette score. A caller may request a specific `n_clusters` from 2 through 8; the service rejects counts that cannot be formed from the usable, distinct profiles. If fewer than three usable profiles exist, profiles are identical, or no candidate has a valid silhouette score, the response is `status: "insufficient_data"` with an explanation rather than made-up labels.

The silhouette score measures separation of the current clusters in this feature space; it is not accuracy, a hiring probability, or proof of job readiness. Cluster identifiers such as `C0` and `C1` are run-specific and have no fixed meaning.

## API response and persistence

The officer endpoint returns run time, model version, total/included/excluded counts, exclusion reasons, selected *k*, silhouette score, cluster sizes, average CGPA/backlogs, common recognized skills with counts, computed profile summaries, and authorized member details. Resume text and contact details are not returned. The interface shows loading, error, insufficient-data, and success states and lets the officer expand each membership list.

Results are computed only after the officer presses **Generate groups** or **Recompute groups**. They are not persisted: the schema has no clustering-run table, and each run is inexpensive and reproducible from the current roster. Recompute after roster or resume changes to use the latest data. The API reports the time and feature/model version for each result.

## Difference from other placement decisions

| Capability | Method | Purpose | Placement decision? |
|---|---|---|---|
| Eligibility | Deterministic backend rules for CGPA, branch, backlogs, drive status, and deadline | Decide whether mandatory requirements are met | Yes, hard requirements |
| Resume matching | TF-IDF and cosine similarity between one resume and a job description | Explain textual overlap and recognized skill matches | No; does not affect eligibility |
| Student grouping | Unsupervised K-Means over academic and skill features | Summarize similarities among current profiles | No; does not predict placement success |

## Limits

The skill extractor uses a finite, case-insensitive vocabulary; synonyms and unrecognized skills are invisible to the model. Resume content quality and profile completeness affect the groups. The model has no labeled placement outcome and is not trained to recommend or rank students. K-Means prefers compact Euclidean clusters, and silhouette is only one internal quality measure. Treat the output as an exploratory academic demonstration, not a hiring tool. The current development roster is synthetic and does not represent actual student outcomes.

## Verification

Run the Python suite with:

```powershell
.\ai-service\.venv\Scripts\python.exe -m unittest discover -s ai-service/tests -v
```

PostgreSQL-backed API tests use the isolated database configured in `TEST_DATABASE_URL`. A dedicated contract test verifies the placement-officer boundary, the exact feature fields sent to FastAPI, member mapping, and service-unavailable response. The actual FastAPI inference path and the browser display should be checked separately; contract mocks are not evidence of actual model output.
