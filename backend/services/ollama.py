import os
import json
import httpx
from dotenv import load_dotenv
from pydantic import ValidationError

from schemas import SynthesisOutput

load_dotenv()

DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434"
DEFAULT_OLLAMA_MODEL = "llama3.2"


class OllamaServiceError(Exception):
    """Raised when Ollama is unreachable, missing the model, or returns invalid output."""


def get_ollama_config() -> tuple[str, str]:
    base_url = os.getenv("OLLAMA_BASE_URL", DEFAULT_OLLAMA_URL).rstrip("/")
    model = os.getenv("OLLAMA_MODEL", DEFAULT_OLLAMA_MODEL).strip() or DEFAULT_OLLAMA_MODEL
    return base_url, model


async def check_ollama_health() -> tuple[bool, str, bool, list[str]]:
    base_url, configured_model = get_ollama_config()
    try:
        async with httpx.AsyncClient(timeout=2.5) as client:
            resp = await client.get(f"{base_url}/api/tags")
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        return False, configured_model, False, []

    models_raw = data.get("models", [])
    available = [
        str(m.get("name", ""))
        for m in models_raw
        if isinstance(m, dict) and m.get("name")
    ]
    model_available = any(
        name == configured_model or name.startswith(f"{configured_model}:")
        for name in available
    )
    return True, configured_model, model_available, available


async def generate_structured_synthesis(
    system_prompt: str,
    user_prompt: str,
    timeout_seconds: float = 60.0,
) -> SynthesisOutput:
    base_url, model = get_ollama_config()
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "stream": False,
        "format": SynthesisOutput.model_json_schema(),
        "options": {"temperature": 0.2},
    }

    try:
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            resp = await client.post(f"{base_url}/api/chat", json=payload)
    except httpx.ConnectError as exc:
        raise OllamaServiceError(
            f"Ollama is offline or unreachable at {base_url}. Start Ollama and try again."
        ) from exc
    except httpx.TimeoutException as exc:
        raise OllamaServiceError(
            f"Ollama timed out after {timeout_seconds:.0f}s while running model '{model}'."
        ) from exc
    except httpx.HTTPError as exc:
        raise OllamaServiceError(f"Ollama HTTP request failed: {exc}") from exc

    if resp.status_code == 404:
        raise OllamaServiceError(
            f"Configured Ollama model '{model}' is not installed. Run `ollama list` or `ollama pull {model}`."
        )
    if resp.status_code >= 400:
        raise OllamaServiceError(
            f"Ollama returned HTTP {resp.status_code}: {resp.text[:300]}"
        )

    try:
        body = resp.json()
        raw_content = body["message"]["content"]
    except (ValueError, KeyError, TypeError) as exc:
        raise OllamaServiceError("Ollama returned an unexpected response envelope.") from exc

    if not isinstance(raw_content, str) or not raw_content.strip():
        raise OllamaServiceError("Ollama returned an empty synthesis response.")

    try:
        return SynthesisOutput.model_validate_json(raw_content)
    except (ValidationError, json.JSONDecodeError) as exc:
        raise OllamaServiceError(
            f"Ollama returned invalid JSON for SynthesisOutput: {exc}"
        ) from exc
