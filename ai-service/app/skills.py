import re

SKILL_VOCABULARY = [
    "python", "java", "javascript", "typescript", "c++", "c", "sql", "postgresql", "mysql",
    "react", "node.js", "express", "rest api", "html", "css", "git", "docker", "kubernetes",
    "aws", "azure", "gcp", "machine learning", "deep learning", "tensorflow", "pytorch",
    "data analysis", "excel", "statistics", "power bi", "tableau", "communication", "leadership",
    "problem solving", "data structures", "algorithms", "linux", "embedded c", "microcontrollers",
    "iot", "debugging", "electronics", "solidworks", "cad", "testing", "agile", "cloud computing",
]

def extract_skills(text: str) -> list[str]:
    normalized = text.lower()
    found = []
    for skill in SKILL_VOCABULARY:
        trailing = r"(?![a-z0-9+#])" if skill == "c" else r"(?![a-z0-9])"
        pattern = rf"(?<![a-z0-9]){re.escape(skill.lower())}{trailing}"
        if re.search(pattern, normalized):
            found.append(skill.upper() if skill in {"c", "c++", "sql", "iot", "aws", "gcp", "cad", "html", "css"} else skill.title())
    return found
