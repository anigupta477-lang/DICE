from typing import Literal, Optional
from pydantic import BaseModel, Field, field_validator

AgentStatus = Literal["IDLE", "WORKING", "COMPLETED", "ERROR", "BLOCKED"]
JobStatus = Literal["PENDING", "RUNNING", "COMPLETED", "ERROR"]
ActionType = Literal[
    "READ_PUBLIC_SOURCE",
    "DOM_CLIP",
    "FORM_SUBMIT",
    "CHECKOUT_CLICK",
    "EXTERNAL_POST",
]
GatekeeperDecision = Literal["PERMIT", "REQUIRE_APPROVAL", "DENY"]


class TabInput(BaseModel):
    url: str
    title: str = ""


class PageContextInput(BaseModel):
    title: str = ""
    url: str = ""
    text: str = ""


class ClipInput(BaseModel):
    id: str = ""
    text: str
    url: str = ""
    title: str = ""


class ResearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    current_page: Optional[PageContextInput] = None
    tabs: list[TabInput] = Field(default_factory=list)
    clips: list[ClipInput] = Field(default_factory=list)

    @field_validator("query")
    @classmethod
    def validate_non_empty_query(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Research query must be a non-empty string.")
        return cleaned


class ResearchCreateResponse(BaseModel):
    job_id: str
    status: JobStatus


class SourceResult(BaseModel):
    source_id: str
    title: str
    url: str
    content: str
    status: Literal["COMPLETED", "ERROR"]
    error: Optional[str] = None


class FindingItem(BaseModel):
    claim: str
    explanation: str
    source_ids: list[str] = Field(default_factory=list)


class ContradictionItem(BaseModel):
    topic: str
    position_a: str
    position_b: str
    source_ids: list[str] = Field(default_factory=list)


class SynthesisOutput(BaseModel):
    summary: str
    findings: list[FindingItem] = Field(default_factory=list)
    contradictions: list[ContradictionItem] = Field(default_factory=list)
    takeaways: list[str] = Field(default_factory=list)


class ExecutionEvent(BaseModel):
    timestamp: str
    agent: str
    status: AgentStatus
    message: str


class JobStatusResponse(BaseModel):
    job_id: str
    status: JobStatus
    agent_statuses: dict[str, AgentStatus]
    events: list[ExecutionEvent] = Field(default_factory=list)
    sources: list[SourceResult] = Field(default_factory=list)
    synthesis: Optional[SynthesisOutput] = None
    error: Optional[str] = None


class GatekeeperTestRequest(BaseModel):
    action_type: ActionType = "EXTERNAL_POST"
    target_url: str = "https://example.com/api/research-export"
    summary: str = "Controlled demo: export research summary to an external endpoint"
    payload_preview: str = 'POST /api/research-export { "items": 3, "source": "DICE" }'


class ApprovalRecord(BaseModel):
    gate_id: str
    action_type: ActionType
    decision: GatekeeperDecision
    status: Literal["PENDING_APPROVAL", "APPROVED", "BLOCKED"]
    target_url: str
    summary: str
    payload_preview: str
    reason: str
    created_at: str
    decided_at: Optional[str] = None


class ApprovalDecisionRequest(BaseModel):
    approved: bool


class HealthResponse(BaseModel):
    status: str
    ollama_connected: bool
    configured_model: str
    model_available: bool
    available_models: list[str] = Field(default_factory=list)
