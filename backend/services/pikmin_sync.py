from __future__ import annotations

import asyncio
import base64
import gzip
import html
import json
import re
import uuid
from datetime import UTC, datetime
from urllib.parse import urljoin, urlparse

import httpx

from config import PIKMIN_SYNC_METADATA_FILE
from core.pikmin import pikmin_repository
from models.schemas import PikminPostcard, PikminPureSpot
from services.storage import safe_load_json, safe_write_json


SOURCE_ORIGIN = "https://pikmin.talllkai.com"
POSTCARD_URL = f"{SOURCE_ORIGIN}/Postcard"
PURESPOT_URL = f"{SOURCE_ORIGIN}/PureSpot/Map"
USER_AGENT = "ArcWayfarer/0.1 (+https://github.com/WeiYuanLee/ArcWayfarer)"
POSTCARD_IMAGE_MAX_BYTES = 6 * 1024 * 1024
POSTCARD_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


def is_allowed_postcard_image_url(url: str) -> bool:
    """Accept only TalllKai's postcard upload directory, never an arbitrary URL."""
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    return (
        parsed.scheme == "https"
        and parsed.hostname == "pikmin.talllkai.com"
        and parsed.username is None
        and parsed.password is None
        and parsed.path.startswith("/uploads/postcards/")
        and not parsed.path.endswith("/")
    )


async def fetch_postcard_image(url: str) -> tuple[bytes, str]:
    if not is_allowed_postcard_image_url(url):
        raise ValueError("Postcard image URL is not allowed.")

    timeout = httpx.Timeout(12.0, connect=5.0)
    headers = {"User-Agent": USER_AGENT, "Accept": "image/jpeg,image/png,image/webp,image/gif"}
    async with httpx.AsyncClient(timeout=timeout, headers=headers, follow_redirects=False) as client:
        async with client.stream("GET", url) as response:
            response.raise_for_status()
            content_type = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
            if content_type not in POSTCARD_IMAGE_TYPES:
                raise ValueError("Postcard image response has an unsupported content type.")
            declared_size = response.headers.get("content-length")
            if declared_size and int(declared_size) > POSTCARD_IMAGE_MAX_BYTES:
                raise ValueError("Postcard image is too large.")

            chunks: list[bytes] = []
            size = 0
            async for chunk in response.aiter_bytes():
                size += len(chunk)
                if size > POSTCARD_IMAGE_MAX_BYTES:
                    raise ValueError("Postcard image is too large.")
                chunks.append(chunk)
    return b"".join(chunks), content_type


def _plain_text(value: str) -> str:
    without_tags = re.sub(r"<[^>]+>", " ", value)
    return " ".join(html.unescape(without_tags).split())


def parse_postcards(page_html: str) -> list[PikminPostcard]:
    starts = list(re.finditer(r'<div\s+class="pc-card"\s+id="pc-(\d+)"[^>]*>', page_html, re.I))
    results: list[PikminPostcard] = []
    for index, start in enumerate(starts):
        block = page_html[start.start(): starts[index + 1].start() if index + 1 < len(starts) else len(page_html)]

        def find(pattern: str, default: str = "") -> str:
            match = re.search(pattern, block, re.I | re.S)
            return _plain_text(match.group(1)) if match else default

        image_match = re.search(r'<img[^>]+src="([^"]+)"', block, re.I)
        coord_match = re.search(r'data-lat="([^"]+)"\s+data-lon="([^"]+)"', block, re.I)
        if not coord_match:
            continue
        badge_match = re.search(r'pc-type-(mushroom|flower|hidden)', block, re.I)
        if not badge_match:
            continue
        date_row = find(r'<div[^>]+class="pc-date-row"[^>]*>(.*?)</div>')
        date_match = re.search(r"📅\s*(.*?)\s*👤\s*(.*)", date_row)
        country = find(r'<span[^>]+class="pc-country"[^>]*>(.*?)</span>')
        likes_text = find(r'<span[^>]+class="like-count"[^>]*>(.*?)</span>', "0")
        results.append(PikminPostcard(
            id=int(start.group(1)),
            name=find(r"<h6[^>]*>(.*?)</h6>"),
            type=badge_match.group(1).lower(),
            image_url=urljoin(SOURCE_ORIGIN, html.unescape(image_match.group(1))) if image_match else "",
            description=find(r'<p[^>]+class="pc-desc"[^>]*>(.*?)</p>'),
            country=country.removeprefix("🌏").strip(),
            lat=float(coord_match.group(1)),
            lng=float(coord_match.group(2)),
            date=date_match.group(1).strip() if date_match else "",
            submitter=date_match.group(2).strip() if date_match else "",
            likes=int(likes_text) if likes_text.isdigit() else 0,
        ))
    return results


def postcard_page_count(page_html: str) -> int:
    pages = [int(value) for value in re.findall(r'(?:\?|&amp;|&)page=(\d+)', page_html, re.I)]
    explicit = re.search(r"第\s*\d+\s*/\s*(\d+)\s*頁", page_html)
    if explicit:
        pages.append(int(explicit.group(1)))
    return max(pages, default=1)


def parse_purespots(page_html: str) -> list[PikminPureSpot]:
    payload_match = re.search(r'atob\(("(?:[^"\\]|\\.)*")\)', page_html, re.S)
    if not payload_match:
        raise ValueError("PureSpot payload was not found.")
    encoded = json.loads(payload_match.group(1))
    raw_items = json.loads(gzip.decompress(base64.b64decode(encoded)))
    return [
        PikminPureSpot(
            id=item["Id"],
            name=item["Name"],
            lat=item["Lat"],
            lng=item["Lon"],
            type=item["Type"],
            icon=item.get("Icon") or "📍",
            city=item.get("City") or "",
            district=item.get("District") or "",
            good=item.get("Good") or 0,
            user_name=item.get("UserName") or "",
            update_date=item.get("UpdateDate"),
            ext=item.get("Ext"),
        )
        for item in raw_items
    ]


class PikminSyncService:
    def __init__(self) -> None:
        metadata = safe_load_json(PIKMIN_SYNC_METADATA_FILE, {})
        self._lock = asyncio.Lock()
        self._task: asyncio.Task | None = None
        self._state = {
            "status": "idle",
            "job_id": None,
            "started_at": None,
            "completed_at": metadata.get("last_successful_sync_at"),
            "last_successful_sync_at": metadata.get("last_successful_sync_at"),
            "counts": pikmin_repository.counts(),
            "error": None,
        }

    def status(self) -> dict:
        return dict(self._state)

    def start(self) -> dict:
        if self._task and not self._task.done():
            return self.status()
        job_id = uuid.uuid4().hex
        self._state.update({
            "status": "running",
            "job_id": job_id,
            "started_at": datetime.now(UTC).isoformat(),
            "completed_at": None,
            "error": None,
        })
        self._task = asyncio.create_task(self._run(job_id))
        return self.status()

    async def _get(self, client: httpx.AsyncClient, url: str) -> str:
        last_error: Exception | None = None
        for attempt in range(3):
            try:
                response = await client.get(url)
                response.raise_for_status()
                return response.text
            except httpx.HTTPError as exc:
                last_error = exc
                if attempt < 2:
                    await asyncio.sleep(0.5 * (attempt + 1))
        raise RuntimeError(f"Unable to fetch {url}") from last_error

    async def _run(self, job_id: str) -> None:
        async with self._lock:
            try:
                timeout = httpx.Timeout(20.0, connect=10.0)
                async with httpx.AsyncClient(timeout=timeout, headers={"User-Agent": USER_AGENT}, follow_redirects=True) as client:
                    first_page = await self._get(client, POSTCARD_URL)
                    postcards_by_id = {item.id: item for item in parse_postcards(first_page)}
                    for page in range(2, postcard_page_count(first_page) + 1):
                        await asyncio.sleep(0.15)
                        page_html = await self._get(client, f"{POSTCARD_URL}?page={page}")
                        postcards_by_id.update((item.id, item) for item in parse_postcards(page_html))
                    purespot_html = await self._get(client, PURESPOT_URL)
                    purespots = parse_purespots(purespot_html)

                postcards = sorted(postcards_by_id.values(), key=lambda item: item.id, reverse=True)
                if not postcards:
                    raise ValueError("Postcard sync returned no records.")
                if not purespots:
                    raise ValueError("PureSpot sync returned no records.")
                pikmin_repository.replace(postcards, purespots)
                completed_at = datetime.now(UTC).isoformat()
                counts = pikmin_repository.counts()
                safe_write_json(PIKMIN_SYNC_METADATA_FILE, {
                    "last_successful_sync_at": completed_at,
                    "counts": counts,
                    "source": SOURCE_ORIGIN,
                })
                self._state.update({
                    "status": "success",
                    "job_id": job_id,
                    "completed_at": completed_at,
                    "last_successful_sync_at": completed_at,
                    "counts": counts,
                    "error": None,
                })
            except Exception as exc:
                self._state.update({
                    "status": "error",
                    "job_id": job_id,
                    "completed_at": datetime.now(UTC).isoformat(),
                    "counts": pikmin_repository.counts(),
                    "error": str(exc)[:300],
                })


pikmin_sync_service = PikminSyncService()
