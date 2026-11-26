import asyncio
from datetime import datetime, timezone
import uuid

from agents.gatekeeper import evaluate_action
from agents.scout_swarm import collect_candidate_urls, run_scout_swarm
from agents.synthesis import SynthesisError, run_synthesis
from schemas import (
    AgentStatus,
    ExecutionEvent,
    JobStatusResponse,
    ResearchRequest,
)

JOBS: dict[str, JobStatusResponse] = {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _record_event(
    job: JobStatusResponse,
    agent: str,
    status: AgentStatus,
    message: str,
) -> None:
    job.agent_statuses[agent] = status
    job.events.append(
        ExecutionEvent(
            timestamp=_now_iso(),
            agent=agent,
            status=status,
            message=message,
        )
    )


def create_research_job(req: ResearchRequest) -> JobStatusResponse:
    job_id = f"job_{uuid.uuid4().hex[:8]}"
    job = JobStatusResponse(
        job_id=job_id,
        status="PENDING",
        agent_statuses={
            "gatekeeper": "IDLE",
            "scout_swarm": "IDLE",
            "synthesis": "IDLE",
        },
    )
    JOBS[job_id] = job
    asyncio.create_task(_execute_job(job_id, req))
    return job


async def _execute_job(job_id: str, req: ResearchRequest) -> None:
    job = JOBS[job_id]
    job.status = "RUNNING"

    # 1. Gatekeeper validates candidate URLs
    _record_event(job, "gatekeeper", "WORKING", "Validating candidate source URLs.")
    candidates = collect_candidate_urls(req.tabs, req.current_page)
    permitted: list[tuple[str, str]] = []
    blocked_count = 0

    for url, title in candidates:
        decision, reason = evaluate_action("READ_PUBLIC_SOURCE", target_url=url)
        if decision == "PERMIT":
            permitted.append((url, title))
        else:
            blocked_count += 1
            _record_event(
                job,
                "gatekeeper",
                "WORKING",
                f"Filtered URL '{url}': {reason}",
            )

    if not permitted and not (req.current_page and req.current_page.text.strip()) and not req.clips:
        _record_event(
            job,
            "gatekeeper",
            "BLOCKED" if blocked_count > 0 else "ERROR",
            "No permitted public HTTP/HTTPS sources available to research.",
        )
        job.status = "ERROR"
        job.error = "No permitted public URLs or page context available for research."
        return

    _record_event(
        job,
        "gatekeeper",
        "COMPLETED",
        f"Permitted {len(permitted)} source(s); filtered {blocked_count}.",
    )

    # 2. Scout Swarm fetches up to 4 sources concurrently
    _record_event(
        job,
        "scout_swarm",
        "WORKING",
        f"Fetching up to {min(len(permitted), 4)} public source(s) concurrently.",
    )

    def on_source_done(src) -> None:
        if src.status == "COMPLETED":
            _record_event(
                job,
                "scout_swarm",
                "WORKING",
                f"Fetched {src.source_id}: {src.title}",
            )
        else:
            _record_event(
                job,
                "scout_swarm",
                "WORKING",
                f"Failed {src.source_id} ({src.url}): {src.error}",
            )

    sources = await run_scout_swarm(permitted, on_source_fetched=on_source_done)
    job.sources = sources
    succeeded = [s for s in sources if s.status == "COMPLETED"]
    failed_count = len(sources) - len(succeeded)

    if not succeeded:
        _record_event(
            job,
            "scout_swarm",
            "ERROR",
            f"All {len(sources)} source fetch(es) failed (0/{len(sources)} succeeded).",
        )
        _record_event(
            job,
            "synthesis",
            "ERROR",
            "No usable research sources were retrieved.",
        )
        job.status = "ERROR"
        job.error = "No usable research sources were retrieved."
        return

    _record_event(
        job,
        "scout_swarm",
        "COMPLETED",
        f"Fetched {len(succeeded)}/{len(sources)} source(s) successfully ({failed_count} failed).",
    )

    # 3. Synthesis using local Ollama
    _record_event(job, "synthesis", "WORKING", "Synthesizing findings with local Ollama.")
    try:
        synthesis = await run_synthesis(
            query=req.query,
            sources=sources,
            current_page=req.current_page,
            clips=req.clips,
        )
        job.synthesis = synthesis
        _record_event(job, "synthesis", "COMPLETED", "Structured synthesis completed.")
        job.status = "COMPLETED"
    except SynthesisError as exc:
        _record_event(job, "synthesis", "ERROR", str(exc))
        job.status = "ERROR"
        job.error = str(exc)
