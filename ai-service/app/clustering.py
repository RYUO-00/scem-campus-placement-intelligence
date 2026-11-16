"""Deterministic, on-demand K-Means grouping for academic and skill profiles."""

from datetime import datetime, timezone
from math import isfinite

import numpy as np
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import MultiLabelBinarizer, StandardScaler, normalize

from .skills import SKILL_VOCABULARY, extract_skills

MODEL_VERSION = "kmeans-student-profile-v1"
FEATURE_CONFIGURATION = (
    "CGPA and active backlogs are median-imputed with missingness indicators, "
    "standardized and row-normalized; recognized resume skills are multi-hot "
    "encoded and row-normalized. Numeric and skill blocks each receive equal "
    "weight when present. Names, registration numbers, contact details, "
    "department, graduation year, and account data are not model features."
)
MAX_CLUSTERS = 8


def _finite_number(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        result = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return result if isfinite(result) else None


def prepare_features(profiles):
    """Build a feature matrix; list position is metadata and never a feature."""
    included = []
    excluded_reasons = []

    for record_index, profile in enumerate(profiles):
        cgpa = _finite_number(profile.get("cgpa"))
        raw_cgpa = profile.get("cgpa")
        if raw_cgpa is not None and (cgpa is None or cgpa < 0 or cgpa > 10):
            excluded_reasons.append("invalid_cgpa")
            continue

        backlog = _finite_number(profile.get("active_backlogs"))
        raw_backlog = profile.get("active_backlogs")
        if raw_backlog is not None and (
            backlog is None or backlog < 0 or not backlog.is_integer()
        ):
            excluded_reasons.append("invalid_active_backlogs")
            continue

        resume_text = profile.get("resume_text", "")
        if not isinstance(resume_text, str):
            excluded_reasons.append("invalid_resume_text")
            continue
        skills = extract_skills(resume_text)
        if cgpa is None and backlog is None and not skills:
            excluded_reasons.append("missing_academics_and_recognized_skills")
            continue

        included.append(
            {
                "record_index": record_index,
                "cgpa": cgpa,
                "active_backlogs": int(backlog) if backlog is not None else None,
                "skills": skills,
            }
        )

    if not included:
        return np.empty((0, 0), dtype=float), included, excluded_reasons

    numeric = np.asarray(
        [
            [
                row["cgpa"] if row["cgpa"] is not None else np.nan,
                row["active_backlogs"] if row["active_backlogs"] is not None else np.nan,
            ]
            for row in included
        ],
        dtype=float,
    )
    missing = np.isnan(numeric).astype(float)
    medians = np.asarray(
        [np.nanmedian(numeric[:, column]) if np.isfinite(numeric[:, column]).any() else 0.0
         for column in range(numeric.shape[1])],
        dtype=float,
    )
    imputed = np.where(np.isnan(numeric), medians, numeric)
    scaled_numeric = StandardScaler().fit_transform(imputed)
    numeric_block = normalize(np.concatenate((scaled_numeric, missing), axis=1), norm="l2")

    skill_encoder = MultiLabelBinarizer(classes=sorted(SKILL_VOCABULARY))
    skill_block = skill_encoder.fit_transform(
        [[skill.lower() for skill in row["skills"]] for row in included]
    ).astype(float)
    skill_block = normalize(skill_block, norm="l2")

    numeric_present = np.linalg.norm(numeric_block, axis=1) > 0
    skill_present = np.linalg.norm(skill_block, axis=1) > 0
    features = np.concatenate(
        (
            numeric_block * numeric_present[:, None] * np.sqrt(0.5),
            skill_block * skill_present[:, None] * np.sqrt(0.5),
        ),
        axis=1,
    )
    # When a profile has only one feature block, retain unit length rather than
    # making it artificially closer to every other profile.
    features = normalize(features, norm="l2")
    return features, included, excluded_reasons


def _insufficient(total, included, exclusions, reason):
    reason_counts = {}
    for exclusion in exclusions:
        reason_counts[exclusion] = reason_counts.get(exclusion, 0) + 1
    return {
        "algorithm": "k-means",
        "model_version": MODEL_VERSION,
        "status": "insufficient_data",
        "reason": reason,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "feature_configuration": FEATURE_CONFIGURATION,
        "total_records": total,
        "included_records": len(included),
        "excluded_records": total - len(included),
        "exclusion_summary": [
            {"reason": name, "count": count}
            for name, count in sorted(reason_counts.items())
        ],
        "selected_cluster_count": None,
        "selection_metric": "silhouette",
        "silhouette_score": None,
        "assignments": [],
        "clusters": [],
    }


def cluster_students(profiles, n_clusters=None):
    """Fit deterministic K-Means and summarize only computed cluster data."""
    total = len(profiles)
    features, included, exclusions = prepare_features(profiles)
    if n_clusters is not None:
        if isinstance(n_clusters, bool) or not isinstance(n_clusters, int) or not 2 <= n_clusters <= MAX_CLUSTERS:
            raise ValueError(f"Cluster count must be between 2 and {MAX_CLUSTERS}.")
        if n_clusters >= len(included):
            raise ValueError("Cluster count must be smaller than the number of usable student profiles.")
    if len(included) < 3:
        return _insufficient(total, included, exclusions, "At least three usable student profiles are required.")

    distinct_count = len(np.unique(features, axis=0))
    if n_clusters is not None and n_clusters > distinct_count:
        raise ValueError("There are fewer distinct student profiles than the requested cluster count.")
    if distinct_count < 2:
        return _insufficient(total, included, exclusions, "All usable student profiles have identical features.")

    if n_clusters is not None:
        candidates = [n_clusters]
    else:
        candidates = range(2, min(MAX_CLUSTERS, len(included) - 1, distinct_count) + 1)

    best = None
    for candidate in candidates:
        try:
            model = KMeans(n_clusters=candidate, random_state=42, n_init=20)
            raw_labels = model.fit_predict(features)
            label_count = len(set(int(label) for label in raw_labels))
            if label_count != candidate or label_count >= len(included):
                continue
            score = float(silhouette_score(features, raw_labels))
        except (ValueError, FloatingPointError):
            continue
        if best is None or score > best["score"] + 1e-12:
            best = {"count": candidate, "labels": raw_labels, "score": score}

    if best is None:
        return _insufficient(total, included, exclusions, "No cluster configuration produced a valid silhouette score.")

    members_by_raw_label = {}
    for row, raw_label in zip(included, best["labels"]):
        members_by_raw_label.setdefault(int(raw_label), []).append(row)
    # Canonical IDs are ordered by the first input record only for readable,
    # repeatable output; they do not imply a persistent meaning between runs.
    ordered_labels = sorted(members_by_raw_label, key=lambda label: members_by_raw_label[label][0]["record_index"])
    canonical_ids = {label: f"C{position}" for position, label in enumerate(ordered_labels)}
    assignments = [
        {"record_index": row["record_index"], "cluster_id": canonical_ids[int(label)]}
        for row, label in zip(included, best["labels"])
    ]

    clusters = []
    for raw_label in ordered_labels:
        members = members_by_raw_label[raw_label]
        cgpas = [row["cgpa"] for row in members if row["cgpa"] is not None]
        backlogs = [row["active_backlogs"] for row in members if row["active_backlogs"] is not None]
        skill_counts = {}
        for row in members:
            for skill in row["skills"]:
                skill_counts[skill] = skill_counts.get(skill, 0) + 1
        common_skills = [
            {"skill": skill, "student_count": count, "proportion": round(count / len(members), 4)}
            for skill, count in sorted(skill_counts.items(), key=lambda item: (-item[1], item[0]))[:8]
        ]
        summary_parts = []
        if cgpas:
            summary_parts.append(f"average CGPA {sum(cgpas) / len(cgpas):.2f}")
        if backlogs:
            summary_parts.append(f"average active backlogs {sum(backlogs) / len(backlogs):.2f}")
        if common_skills:
            summary_parts.append("commonly observed skills: " + ", ".join(item["skill"] for item in common_skills[:4]))
        summary = "; ".join(summary_parts) or "No academic or recognized skill summary is available."
        clusters.append(
            {
                "cluster_id": canonical_ids[raw_label],
                "student_count": len(members),
                "member_indices": [row["record_index"] for row in members],
                "average_cgpa": round(sum(cgpas) / len(cgpas), 2) if cgpas else None,
                "average_active_backlogs": round(sum(backlogs) / len(backlogs), 2) if backlogs else None,
                "common_skills": common_skills,
                "profile_summary": summary,
            }
        )

    reason_counts = {}
    for exclusion in exclusions:
        reason_counts[exclusion] = reason_counts.get(exclusion, 0) + 1
    return {
        "algorithm": "k-means",
        "model_version": MODEL_VERSION,
        "status": "ok",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "feature_configuration": FEATURE_CONFIGURATION,
        "total_records": total,
        "included_records": len(included),
        "excluded_records": total - len(included),
        "exclusion_summary": [
            {"reason": name, "count": count}
            for name, count in sorted(reason_counts.items())
        ],
        "selected_cluster_count": best["count"],
        "selection_metric": "silhouette",
        "silhouette_score": round(best["score"], 4),
        "assignments": assignments,
        "clusters": clusters,
    }
