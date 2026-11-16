from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from .matcher import match_resume
from .clustering import MAX_CLUSTERS, cluster_students

app = FastAPI(title="SCEM Placement Matching and Student Grouping", version="1.1.0")

class MatchRequest(BaseModel):
    resume_text: str = Field(min_length=1, max_length=30000)
    job_description: str = Field(min_length=1, max_length=20000)

class ClusterProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")
    cgpa: float | None = Field(default=None, allow_inf_nan=False)
    active_backlogs: float | None = Field(default=None, allow_inf_nan=False)
    resume_text: str = Field(default="", max_length=30000)

class ClusterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    profiles: list[ClusterProfile] = Field(max_length=2000)
    n_clusters: int | None = Field(default=None, ge=2, le=MAX_CLUSTERS)

@app.get("/health")
def health():
    return {"status": "ok", "service": "local-placement-ai"}

@app.post("/match")
def match(request: MatchRequest):
    if not request.resume_text.strip() or not request.job_description.strip():
        raise HTTPException(status_code=422, detail="Resume text and job description must not be blank.")
    try:
        return match_resume(request.resume_text, request.job_description)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

@app.post("/cluster")
def cluster(request: ClusterRequest):
    try:
        profiles = [profile.model_dump() for profile in request.profiles]
        return cluster_students(profiles, request.n_clusters)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
