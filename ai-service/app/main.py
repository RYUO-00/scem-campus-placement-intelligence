from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from .matcher import match_resume

app = FastAPI(title="SCEM Placement Resume Matcher", version="1.0.0")

class MatchRequest(BaseModel):
    resume_text: str = Field(min_length=1, max_length=30000)
    job_description: str = Field(min_length=1, max_length=20000)

@app.get("/health")
def health():
    return {"status": "ok", "service": "local-tfidf-matcher"}

@app.post("/match")
def match(request: MatchRequest):
    if not request.resume_text.strip() or not request.job_description.strip():
        raise HTTPException(status_code=422, detail="Resume text and job description must not be blank.")
    try:
        return match_resume(request.resume_text, request.job_description)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
