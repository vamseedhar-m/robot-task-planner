import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

load_dotenv()

from models import SceneInput, TaskPlanResponse
from planner import plan_task
from scenarios import ALL_SCENARIOS

app = FastAPI(
    title="Robot Task Planner API",
    description="Natural language → constraint-validated robot task graphs",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/scenarios")
def get_scenarios():
    return [
        {
            "id": s["id"],
            "name": s["name"],
            "description": s["description"],
            "task_description": s["task_description"],
            "scene": s["scene"]
        }
        for s in ALL_SCENARIOS
    ]


@app.post("/plan", response_model=TaskPlanResponse)
def create_plan(scene: SceneInput, x_api_key: Optional[str] = Header(None)):
    # BYOK: prefer key from request header, fall back to server env var
    api_key = x_api_key or os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=401,
            detail="No API key provided. Add your Anthropic API key via the key button in the header."
        )
    try:
        return plan_task(scene, api_key=api_key)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# Serve frontend in development
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

    @app.get("/")
    def serve_frontend():
        return FileResponse(str(FRONTEND_DIR / "index.html"))
