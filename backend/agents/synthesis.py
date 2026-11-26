from typing import Optional

from schemas import ClipInput, PageContextInput, SourceResult, SynthesisOutput
from services.ollama import OllamaServiceError, generate_structured_synthesis

SYSTEM_PROMPT = """You are DICE Synthesis, a strict research analyst.
Analyze the user's research query using ONLY the supplied sources, optional current page context, and optional saved clips.

Rules:
1. Only cite source_ids that were actually supplied (e.g., "src_01"). Never invent source_ids, URLs, quotes, or claims.
2. If sources disagree, report the disagreement clearly in "contradictions" rather than forcing a single conclusion.
3. If evidence is insufficient to answer part of the query, state that explicitly.
4. Provide exactly 3 concise, high-signal takeaways in "takeaways" when possible.
5. Output valid JSON matching the required schema."""


class SynthesisError(Exception):
    """Raised when synthesis cannot be completed."""


def _build_user_prompt(
    query: str,
    sources: list[SourceResult],
    total_sources_attempted: int,
    current_page: Optional[PageContextInput],
    clips: list[ClipInput],
) -> str:
    parts: list[str] = [f"USER QUERY:\n{query.strip()}\n"]

    if total_sources_attempted > len(sources):
        parts.append(
            f"NOTE: Partial research — {len(sources)} of {total_sources_attempted} sources succeeded.\n"
        )

    if current_page and (current_page.url or current_page.text):
        parts.append(
            f"CURRENT WEBPAGE CONTEXT:\nTitle: {current_page.title}\nURL: {current_page.url}\nText:\n{current_page.text[:3000]}\n"
        )

    if clips:
        clip_lines = "\n".join(
            f"- [{c.title or 'Clip'}]({c.url}): {c.text[:800]}"
            for c in clips[:6]
        )
        parts.append(f"SAVED CLIPS:\n{clip_lines}\n")

    parts.append("FETCHED SOURCES:")
    for src in sources:
        parts.append(
            f"--- {src.source_id} | {src.title} | {src.url} ---\n{src.content}\n"
        )

    return "\n".join(parts)


async def run_synthesis(
    query: str,
    sources: list[SourceResult],
    current_page: Optional[PageContextInput] = None,
    clips: list[ClipInput] = [],
) -> SynthesisOutput:
    valid_sources = [s for s in sources if s.status == "COMPLETED" and s.content.strip()]
    if not valid_sources:
        raise SynthesisError("No usable research sources were retrieved.")

    valid_ids = {s.source_id for s in valid_sources}
    user_prompt = _build_user_prompt(
        query, valid_sources, len(sources), current_page, clips
    )

    try:
        output = await generate_structured_synthesis(SYSTEM_PROMPT, user_prompt)
    except OllamaServiceError as exc:
        raise SynthesisError(str(exc)) from exc

    for finding in output.findings:
        finding.source_ids = [sid for sid in finding.source_ids if sid in valid_ids]
    for contra in output.contradictions:
        contra.source_ids = [sid for sid in contra.source_ids if sid in valid_ids]

    return output
