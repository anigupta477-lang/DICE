import asyncio
import logging
import os
from typing import Callable, Optional
from urllib.parse import quote, unquote, urlparse
from bs4 import BeautifulSoup
from dotenv import load_dotenv
import httpx

from agents.gatekeeper import validate_public_url
from schemas import PageContextInput, SourceResult, TabInput

load_dotenv()

logger = logging.getLogger("dice.scout_swarm")

MAX_CONCURRENT_SOURCES = 4
MAX_WIKIMEDIA_CONCURRENCY = 3
MAX_CONTENT_CHARS = 8000
REQUEST_TIMEOUT_SECONDS = 10.0
MAX_RETRY_AFTER_SECONDS = 10.0

STRIP_TAGS = [
    "script",
    "style",
    "noscript",
    "nav",
    "footer",
    "header",
    "aside",
    "iframe",
    "svg",
]
ALLOWED_CONTENT_TYPES = ("text/html", "application/xhtml+xml", "text/plain")


def build_user_agent() -> str:
    load_dotenv(override=False)
    contact = os.getenv("DICE_CONTACT_INFO", "").strip()
    if not contact:
        logger.warning(
            "DICE_CONTACT_INFO is not set in .env; Wikimedia/Wikipedia requests may return HTTP 403 without maintainer contact info."
        )
        return "DICE-Research-Assistant/0.3"
    return f"DICE-Research-Assistant/0.3 ({contact})"


def resolve_wikipedia_rest_url(url: str) -> Optional[tuple[str, str, str]]:
    """
    If `url` is a Wikipedia article URL, return:
      (rest_api_html_url, canonical_article_url, article_title)
    using https://<host>/w/rest.php/v1/page/{title}/html
    """
    try:
        parsed = urlparse(url)
    except Exception:
        return None

    host = (parsed.hostname or "").lower()
    if not host.endswith(".wikipedia.org"):
        return None

    if not parsed.path.startswith("/wiki/"):
        return None

    raw_slug = parsed.path[len("/wiki/") :].strip("/")
    if not raw_slug or ":" in raw_slug:
        return None

    decoded_slug = unquote(raw_slug)
    encoded_title = quote(decoded_slug, safe="")
    rest_url = f"{parsed.scheme}://{host}/w/rest.php/v1/page/{encoded_title}/html"
    canonical_url = f"{parsed.scheme}://{host}/wiki/{raw_slug}"
    article_title = decoded_slug.replace("_", " ")
    return rest_url, canonical_url, article_title


def extract_readable_text(
    html_or_text: str, content_type: str = "text/html"
) -> tuple[str, str]:
    if "text/plain" in content_type:
        cleaned = " ".join(html_or_text.split())
        return "", cleaned[:MAX_CONTENT_CHARS]

    soup = BeautifulSoup(html_or_text, "html.parser")
    title = soup.title.string.strip() if soup.title and soup.title.string else ""

    for tag_name in STRIP_TAGS:
        for tag in soup.find_all(tag_name):
            tag.decompose()

    raw_text = soup.get_text(separator="\n", strip=True)
    lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
    cleaned_text = "\n".join(lines)[:MAX_CONTENT_CHARS]
    return title, cleaned_text


async def _fetch_single_source(
    client: httpx.AsyncClient,
    source_id: str,
    url: str,
    fallback_title: str,
    wiki_semaphore: asyncio.Semaphore,
) -> SourceResult:
    wiki_info = resolve_wikipedia_rest_url(url)
    fetch_url = wiki_info[0] if wiki_info else url
    canonical_url = wiki_info[1] if wiki_info else url
    wiki_title = wiki_info[2] if wiki_info else ""

    headers = {
        "User-Agent": build_user_agent(),
        "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9",
        "Accept-Language": "en-US,en;q=0.8",
    }

    async def do_get() -> httpx.Response:
        if wiki_info:
            async with wiki_semaphore:
                return await client.get(fetch_url, headers=headers)
        return await client.get(fetch_url, headers=headers)

    try:
        resp = await do_get()

        if resp.status_code == 429:
            retry_after_raw = resp.headers.get("Retry-After", "").strip()
            try:
                delay = min(float(retry_after_raw), MAX_RETRY_AFTER_SECONDS)
            except ValueError:
                delay = 1.0
            if delay > 0:
                await asyncio.sleep(delay)
            resp = await do_get()

        if resp.status_code == 403:
            return SourceResult(
                source_id=source_id,
                title=fallback_title or wiki_title or canonical_url,
                url=canonical_url,
                content="",
                status="ERROR",
                error="HTTP 403 Forbidden: source denied automated access (check DICE_CONTACT_INFO in backend/.env).",
            )

        final_url = str(resp.url)
        ok, reason = validate_public_url(final_url)
        if not ok:
            return SourceResult(
                source_id=source_id,
                title=fallback_title or wiki_title or canonical_url,
                url=canonical_url,
                content="",
                status="ERROR",
                error=f"Redirect destination blocked by security policy: {reason}",
            )

        resp.raise_for_status()
        content_type = resp.headers.get("content-type", "").lower()
        if content_type and not any(ct in content_type for ct in ALLOWED_CONTENT_TYPES):
            return SourceResult(
                source_id=source_id,
                title=fallback_title or wiki_title or canonical_url,
                url=canonical_url,
                content="",
                status="ERROR",
                error=f"Unsupported content-type '{content_type}'.",
            )

        parsed_title, content = extract_readable_text(resp.text, content_type)
        if not content:
            return SourceResult(
                source_id=source_id,
                title=parsed_title or fallback_title or wiki_title or canonical_url,
                url=canonical_url,
                content="",
                status="ERROR",
                error="No readable text extracted from page.",
            )

        display_url = canonical_url if wiki_info else final_url
        display_title = parsed_title or fallback_title or wiki_title or display_url

        return SourceResult(
            source_id=source_id,
            title=display_title,
            url=display_url,
            content=content,
            status="COMPLETED",
        )
    except Exception as exc:
        return SourceResult(
            source_id=source_id,
            title=fallback_title or wiki_title or canonical_url,
            url=canonical_url,
            content="",
            status="ERROR",
            error=str(exc),
        )


def collect_candidate_urls(
    tabs: list[TabInput],
    current_page: Optional[PageContextInput],
) -> list[tuple[str, str]]:
    seen: set[str] = set()
    candidates: list[tuple[str, str]] = []

    def add_candidate(url: str, title: str) -> None:
        clean = url.strip()
        if not clean or clean in seen:
            return
        seen.add(clean)
        candidates.append((clean, title.strip()))

    if current_page and current_page.url:
        add_candidate(current_page.url, current_page.title)

    for tab in tabs:
        add_candidate(tab.url, tab.title)

    return candidates


async def run_scout_swarm(
    permitted_urls: list[tuple[str, str]],
    on_source_fetched: Optional[Callable[[SourceResult], None]] = None,
) -> list[SourceResult]:
    targets = permitted_urls[:MAX_CONCURRENT_SOURCES]
    if not targets:
        return []

    wiki_semaphore = asyncio.Semaphore(MAX_WIKIMEDIA_CONCURRENCY)
    results: list[SourceResult] = []
    async with httpx.AsyncClient(
        timeout=REQUEST_TIMEOUT_SECONDS,
        follow_redirects=True,
        max_redirects=5,
    ) as client:
        tasks = [
            _fetch_single_source(client, f"src_{idx:02d}", url, title, wiki_semaphore)
            for idx, (url, title) in enumerate(targets, start=1)
        ]
        for coro in asyncio.as_completed(tasks):
            res = await coro
            results.append(res)
            if on_source_fetched:
                on_source_fetched(res)

    results.sort(key=lambda r: r.source_id)
    return results
