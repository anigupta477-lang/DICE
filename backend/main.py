import logging
from fastapi import FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from agents.gatekeeper import PENDING_APPROVALS, create_approval_request, decide_approval
from orchestrator import JOBS, create_research_job
from schemas import (
    ApprovalDecisionRequest,
    ApprovalRecord,
    GatekeeperTestRequest,
    HealthResponse,
    JobStatusResponse,
    ResearchCreateResponse,
    ResearchRequest,
)
from services.ollama import check_ollama_health

logger = logging.getLogger("dice.api")

app = FastAPI(title="DICE Local Research Engine", version="0.3.0")


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    errors = jsonable_encoder(exc.errors())
    logger.warning("Validation error on %s: %s", request.url.path, errors)
    return JSONResponse(
        status_code=422,
        content={"detail": errors, "message": "Invalid research request payload."},
    )

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^(chrome-extension://.*|http://localhost:\d+|http://127\.0\.0\.1:\d+)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    connected, configured_model, model_available, available_models = await check_ollama_health()
    return HealthResponse(
        status="ok",
        ollama_connected=connected,
        configured_model=configured_model,
        model_available=model_available,
        available_models=available_models,
    )


@app.post("/api/research", response_model=ResearchCreateResponse)
async def start_research(req: ResearchRequest) -> ResearchCreateResponse:
    job = create_research_job(req)
    return ResearchCreateResponse(job_id=job.job_id, status=job.status)


@app.get("/api/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job(job_id: str) -> JobStatusResponse:
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")
    return job


@app.post("/api/gatekeeper/test", response_model=ApprovalRecord)
async def test_gatekeeper(req: GatekeeperTestRequest) -> ApprovalRecord:
    return create_approval_request(
        action_type=req.action_type,
        target_url=req.target_url,
        summary=req.summary,
        payload_preview=req.payload_preview,
    )


@app.post("/api/gatekeeper/{gate_id}/decision", response_model=ApprovalRecord)
async def gatekeeper_decision(
    gate_id: str,
    req: ApprovalDecisionRequest,
) -> ApprovalRecord:
    if gate_id not in PENDING_APPROVALS:
        raise HTTPException(status_code=404, detail=f"Gate '{gate_id}' not found.")
    return decide_approval(gate_id, req.approved)
