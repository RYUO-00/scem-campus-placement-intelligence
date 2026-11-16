import math
import sys
import unittest
from pathlib import Path

import numpy as np
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.clustering import cluster_students, prepare_features
from app.main import ClusterProfile, ClusterRequest


def sample_profiles():
    return [
        {"cgpa": 9.0, "active_backlogs": 0, "resume_text": "Python SQL data analysis"},
        {"cgpa": 8.8, "active_backlogs": 0, "resume_text": "Python SQL Java"},
        {"cgpa": 8.1, "active_backlogs": 1, "resume_text": "Python SQL REST API"},
        {"cgpa": 6.2, "active_backlogs": 2, "resume_text": "React JavaScript HTML CSS"},
        {"cgpa": 6.0, "active_backlogs": 1, "resume_text": "React JavaScript CSS"},
        {"cgpa": 6.5, "active_backlogs": 3, "resume_text": "HTML CSS React"},
    ]


class ClusteringTests(unittest.TestCase):
    def test_kmeans_is_real_reproducible_and_membership_summaries_reconcile(self):
        profiles = sample_profiles()
        first = cluster_students(profiles)
        second = cluster_students(profiles)
        self.assertEqual(first["status"], "ok")
        self.assertEqual(first["algorithm"], "k-means")
        self.assertEqual(first["assignments"], second["assignments"])
        self.assertEqual(first["selected_cluster_count"], second["selected_cluster_count"])
        self.assertEqual(first["silhouette_score"], second["silhouette_score"])
        self.assertEqual(sum(cluster["student_count"] for cluster in first["clusters"]), len(profiles))
        self.assertEqual(len(first["assignments"]), len(profiles))
        for cluster in first["clusters"]:
            self.assertEqual(cluster["student_count"], len(cluster["member_indices"]))
            self.assertTrue(cluster["profile_summary"])

    def test_numeric_and_skill_blocks_are_numeric_scaled_and_missing_values_are_explicit(self):
        profiles = [
            {"cgpa": 9.0, "active_backlogs": None, "resume_text": "Python SQL"},
            {"cgpa": 6.0, "active_backlogs": 2, "resume_text": "React JavaScript"},
            {"cgpa": None, "active_backlogs": 1, "resume_text": "Docker Linux"},
        ]
        matrix, included, exclusions = prepare_features(profiles)
        self.assertEqual(matrix.shape, (3, 50))  # two metrics, two missing flags, 46 skill tokens
        self.assertEqual(len(included), 3)
        self.assertEqual(exclusions, [])
        np.testing.assert_allclose(np.linalg.norm(matrix, axis=1), np.ones(3))
        self.assertTrue(np.isfinite(matrix).all())
        self.assertEqual(included[0]["skills"], ["Python", "SQL"])

    def test_identifiers_and_other_private_fields_never_change_features_or_appear_in_results(self):
        clean = sample_profiles()
        with_private_fields = [
            {**row, "student_id": f"secret-{index}", "full_name": "Private Name",
             "registration_number": "PRIVATE-REG", "email": "private@example.test",
             "phone": "555", "password_hash": "must-not-enter-model", "branch_code": "CS"}
            for index, row in enumerate(clean)
        ]
        clean_features, _, _ = prepare_features(clean)
        private_features, _, _ = prepare_features(with_private_fields)
        np.testing.assert_allclose(clean_features, private_features)
        result = cluster_students(with_private_fields)
        self.assertNotIn("student_id", str(result))
        self.assertNotIn("Private Name", str(result))
        self.assertNotIn("PRIVATE-REG", str(result))
        self.assertNotIn("private@example.test", str(result))

    def test_fastapi_input_schema_accepts_features_but_rejects_student_identifiers(self):
        request = ClusterRequest(profiles=[{"cgpa": 8.2, "active_backlogs": 0, "resume_text": "Python"}])
        self.assertEqual(request.profiles[0].cgpa, 8.2)
        with self.assertRaises(ValidationError):
            ClusterProfile(cgpa=8.2, active_backlogs=0, resume_text="Python", registration_number="private")

    def test_invalid_and_unusable_profiles_are_excluded_with_reasons(self):
        profiles = sample_profiles()[:3] + [
            {"cgpa": 10.1, "active_backlogs": 0, "resume_text": "Python"},
            {"cgpa": 7.0, "active_backlogs": -1, "resume_text": "Java"},
            {"cgpa": None, "active_backlogs": None, "resume_text": "No recognized terms"},
            {"cgpa": math.inf, "active_backlogs": 0, "resume_text": "SQL"},
        ]
        result = cluster_students(profiles)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["total_records"], 7)
        self.assertEqual(result["included_records"], 3)
        self.assertEqual(result["excluded_records"], 4)
        self.assertEqual(
            {item["reason"]: item["count"] for item in result["exclusion_summary"]},
            {"invalid_cgpa": 2, "invalid_active_backlogs": 1, "missing_academics_and_recognized_skills": 1},
        )

    def test_empty_too_small_and_identical_data_return_clear_insufficient_result(self):
        for profiles in ([], sample_profiles()[:2]):
            result = cluster_students(profiles)
            self.assertEqual(result["status"], "insufficient_data")
            self.assertTrue(result["reason"])
            self.assertEqual(result["assignments"], [])
        identical = [{"cgpa": 8, "active_backlogs": 0, "resume_text": "Python SQL"} for _ in range(4)]
        self.assertIn("identical", cluster_students(identical)["reason"])

    def test_requested_cluster_count_validation_and_skill_only_profiles(self):
        profiles = sample_profiles()
        with self.assertRaisesRegex(ValueError, "between 2 and 8"):
            cluster_students(profiles, 9)
        with self.assertRaisesRegex(ValueError, "fewer distinct"):
            cluster_students([{"cgpa": 8, "active_backlogs": 0, "resume_text": "Python"}] * 3, 2)
        skill_only = [
            {"cgpa": None, "active_backlogs": None, "resume_text": "Python SQL"},
            {"cgpa": None, "active_backlogs": None, "resume_text": "React CSS"},
            {"cgpa": None, "active_backlogs": None, "resume_text": "Docker Linux"},
        ]
        matrix, included, _ = prepare_features(skill_only)
        self.assertEqual(len(included), 3)
        self.assertEqual(cluster_students(skill_only)["status"], "ok")


if __name__ == "__main__":
    unittest.main()
