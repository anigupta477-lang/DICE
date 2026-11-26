import asyncio
import json
import httpx
import pytest

from agents.gatekeeper import (
    create_approval_request,
    decide_approval,
    evaluate_action,
    validate_public_url,
)
from agents.scout_swarm import (
    build_user_agent,
    extract_readable_text,
    resolve_wikipedia_rest_url,
    run_scout_swarm,
)
from agents.synthesis import SynthesisError, run_synthesis
from orchestrator import JOBS, _execute_job
from schemas import JobStatusResponse, ResearchRequest, SourceResult, SynthesisOutput, TabInput


def test_url_validation():
    assert validate_public_url("https://example.com/article")[0] is True
    assert validate_public_url("http://127.0.0.1:8000/health")[0] is False
    assert validate_public_url("http://localhost:3000")[0] is False
    assert validate_public_url("http://192.168.1.10/admin")[0] is False
    assert validate_public_url("chrome://settings")[0] is False
    assert validate_public_url("file:///C:/secret.txt")[0] is False


def test_user_agent_header(monkeypatch, caplog):
    monkeypatch.setenv("DICE_CONTACT_INFO", "")
    ua_default = build_user_agent()
    assert ua_default == "DICE-Research-Assistant/0.3"
    assert "local-research-mvp" not in ua_default
    assert "Mozilla" not in ua_default
    assert "DICE_CONTACT_INFO is not set" in caplog.text

    monkeypatch.setenv("DICE_CONTACT_INFO", "maintainer@example.org")
    ua_with_contact = build_user_agent()
    assert ua_with_contact == "DICE-Research-Assistant/0.3 (maintainer@example.org)"


def test_wikipedia_rest_url_resolution():
    resolved = resolve_wikipedia_rest_url("https://en.wikipedia.org/wiki/Artificial_intelligence")
    assert resolved == (
        "https://en.wikipedia.org/w/rest.php/v1/page/Artificial_intelligence/html",
        "https://en.wikipedia.org/wiki/Artificial_intelligence",
        "Artificial intelligence",
    )
    encoded = resolve_wikipedia_rest_url("https://en.wikipedia.org/wiki/C%2B%2B")
    assert encoded == (
        "https://en.wikipedia.org/w/rest.php/v1/page/C%2B%2B/html",
        "https://en.wikipedia.org/wiki/C%2B%2B",
        "C++",
    )
    assert resolve_wikipedia_rest_url("https://en.wikipedia.org/wiki/Special:Search") is None
    assert resolve_wikipedia_rest_url("https://example.com/wiki/Test") is None


def test_html_extraction():
    html = """
    <html>
      <head><title>Sample Article</title><style>.x{}</style></head>
      <body>
        <nav>Menu</nav>
        <main><p>AI agents collaborate cleanly.</p></main>
        <script>alert(1)</script>
        <footer>Copyright</footer>
      </body>
    </html>
    """
    title, text = extract_readable_text(html)
    assert title == "Sample Article"
    assert "AI agents collaborate cleanly." in text
    assert "Menu" not in text
    assert "alert(1)" not in text
    assert "Copyright" not in text


def test_gatekeeper_decisions_and_approval_flow():
    assert evaluate_action("READ_PUBLIC_SOURCE", target_url="https://arxiv.org/abs/1")[0] == "PERMIT"
    assert evaluate_action("READ_PUBLIC_SOURCE", target_url="http://127.0.0.1/")[0] == "DENY"
    assert evaluate_action("DOM_CLIP", content="Valid excerpt")[0] == "PERMIT"
    assert evaluate_action("DOM_CLIP", content="   ")[0] == "DENY"
    assert evaluate_action("FORM_SUBMIT")[0] == "REQUIRE_APPROVAL"
    assert evaluate_action("CHECKOUT_CLICK")[0] == "REQUIRE_APPROVAL"
    assert evaluate_action("EXTERNAL_POST")[0] == "REQUIRE_APPROVAL"

    rec = create_approval_request(
        action_type="EXTERNAL_POST",
        target_url="https://example.com/submit",
        summary="Test export",
        payload_preview="POST /submit",
    )
    assert rec.status == "PENDING_APPROVAL"
    assert decide_approval(rec.gate_id, True).status == "APPROVED"
    assert decide_approval(rec.gate_id, False).status == "BLOCKED"


def _patch_httpx(monkeypatch, handler):
    transport = httpx.MockTransport(handler)
    orig = httpx.AsyncClient

    def patched(*args, **kwargs):
        kwargs["transport"] = transport
        return orig(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", patched)


def test_wikipedia_rest_api_fetch_and_three_success(monkeypatch):
    seen_urls: list[str] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        seen_urls.append(str(request.url))
        assert request.headers.get("User-Agent", "").startswith("DICE-Research-Assistant/")
        return httpx.Response(
            200,
            headers={"content-type": "text/html"},
            text="<html><head><title>Wiki Page</title></head><body><p>Readable content.</p></body></html>",
        )

    _patch_httpx(monkeypatch, handler)

    sources = asyncio.run(
        run_scout_swarm(
            [
                ("https://en.wikipedia.org/wiki/Python_(programming_language)", "Python"),
                ("https://one.example.com/a", "One"),
                ("https://two.example.com/b", "Two"),
            ]
        )
    )
    assert any("/w/rest.php/v1/page/Python_%28programming_language%29/html" in u for u in seen_urls)
    assert len(sources) == 3
    assert all(s.status == "COMPLETED" for s in sources)
    assert sources[0].url == "https://en.wikipedia.org/wiki/Python_(programming_language)"


def test_http_403_and_partial_failure_no_retries(monkeypatch):
    call_count = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        if "forbidden" in str(request.url):
            return httpx.Response(403, text="Forbidden")
        if "fail" in str(request.url):
            return httpx.Response(500, text="Server Error")
        return httpx.Response(
            200,
            headers={"content-type": "text/html"},
            text="<html><head><title>OK</title></head><body><p>Good source.</p></body></html>",
        )

    _patch_httpx(monkeypatch, handler)

    sources = asyncio.run(
        run_scout_swarm(
            [
                ("https://ok.example.com/1", "OK"),
                ("https://forbidden.example.com/2", "Forbidden"),
                ("https://fail.example.com/3", "Fail"),
            ]
        )
    )
    assert call_count == 3  # No retries on 403
    assert len([s for s in sources if s.status == "COMPLETED"]) == 1
    failed = [s for s in sources if s.status == "ERROR"]
    assert len(failed) == 2
    assert any("403" in (s.error or "") for s in failed)


def test_all_sources_fail_sets_scout_and_synthesis_error_without_ollama(monkeypatch):
    ollama_called = False

    async def fake_generate(*args, **kwargs):
        nonlocal ollama_called
        ollama_called = True
        raise AssertionError("Ollama must not be called when 0 sources succeed")

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(403, text="Forbidden")

    _patch_httpx(monkeypatch, handler)
    monkeypatch.setattr("agents.synthesis.generate_structured_synthesis", fake_generate)

    job_id = "job_test_all_fail"
    JOBS[job_id] = JobStatusResponse(
        job_id=job_id,
        status="PENDING",
        agent_statuses={"gatekeeper": "IDLE", "scout_swarm": "IDLE", "synthesis": "IDLE"},
    )
    req = ResearchRequest(
        query="Test query",
        tabs=[
            TabInput(url="https://a.example.com", title="A"),
            TabInput(url="https://b.example.com", title="B"),
        ],
    )
    asyncio.run(_execute_job(job_id, req))

    job = JOBS[job_id]
    assert ollama_called is False
    assert job.status == "ERROR"
    assert job.agent_statuses["scout_swarm"] == "ERROR"
    assert job.agent_statuses["synthesis"] == "ERROR"
    assert job.error == "No usable research sources were retrieved."


def test_synthesis_zero_sources_and_partial_sources(monkeypatch):
    with pytest.raises(SynthesisError, match="No usable research sources were retrieved."):
        asyncio.run(run_synthesis(query="Empty", sources=[]))

    valid_json = json.dumps(
        {
            "summary": "Partial synthesis from 1 source.",
            "findings": [
                {
                    "claim": "Claim",
                    "explanation": "Explanation",
                    "source_ids": ["src_01", "src_99_invalid"],
                }
            ],
            "contradictions": [],
            "takeaways": ["T1", "T2", "T3"],
        }
    )

    async def fake_generate(*args, **kwargs) -> SynthesisOutput:
        return SynthesisOutput.model_validate_json(valid_json)

    monkeypatch.setattr("agents.synthesis.generate_structured_synthesis", fake_generate)

    out = asyncio.run(
        run_synthesis(
            query="Partial?",
            sources=[
                SourceResult(
                    source_id="src_01",
                    title="Good",
                    url="https://good.example.com",
                    content="Valid content.",
                    status="COMPLETED",
                ),
                SourceResult(
                    source_id="src_02",
                    title="Bad",
                    url="https://bad.example.com",
                    content="",
                    status="ERROR",
                    error="HTTP 403",
                ),
            ],
        )
    )
    assert out.findings[0].source_ids == ["src_01"]


def test_research_request_validation():
    from fastapi.testclient import TestClient
    from main import app

    client = TestClient(app)

    bad_empty = client.post("/api/research", json={"query": "   "})
    assert bad_empty.status_code == 422

    bad_missing = client.post("/api/research", json={})
    assert bad_missing.status_code == 422

    ok = client.post(
        "/api/research",
        json={
            "query": "Research how multi-agent AI systems work and identify their limitations.",
            "tabs": [],
            "clips": [],
        },
    )
    assert ok.status_code == 200
    body = ok.json()
    assert body["job_id"].startswith("job_")
