from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from .skills import extract_skills

def match_resume(resume_text: str, job_description: str) -> dict:
    resume = " ".join(resume_text.split())
    job = " ".join(job_description.split())
    if not resume or not job:
        raise ValueError("Resume text and job description must both contain text.")
    vectorizer = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), max_features=8000)
    matrix = vectorizer.fit_transform([resume, job])
    score = float(cosine_similarity(matrix[0:1], matrix[1:2])[0, 0] * 100)
    resume_skills = extract_skills(resume)
    job_skills = extract_skills(job)
    matched = [skill for skill in job_skills if skill in resume_skills]
    missing = [skill for skill in job_skills if skill not in resume_skills]
    recommendations = [f"Consider learning {skill} if it is relevant to your target role." for skill in missing[:5]]
    if not job_skills:
        recommendations = ["The current skill list did not identify specific skills in this job description. Review its requirements manually."]
    elif not recommendations:
        recommendations = ["Your resume mentions the skills found in this job description. Review the role requirements and add evidence for your experience where appropriate."]
    return {"similarity_score": round(max(0.0, min(100.0, score)), 1), "matched_skills": matched, "missing_skills": missing, "recommendations": recommendations}
