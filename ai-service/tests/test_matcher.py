import unittest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.matcher import match_resume

class MatcherTests(unittest.TestCase):
    def test_score_is_bounded_and_skills_are_extracted(self):
        result = match_resume("Python SQL and REST APIs", "Python SQL Docker REST APIs")
        self.assertGreaterEqual(result["similarity_score"], 0)
        self.assertLessEqual(result["similarity_score"], 100)
        self.assertIn("Python", result["matched_skills"])
        self.assertIn("Docker", result["missing_skills"])

    def test_blank_text_is_rejected(self):
        with self.assertRaises(ValueError):
            match_resume(" ", "Some job")

if __name__ == "__main__":
    unittest.main()
