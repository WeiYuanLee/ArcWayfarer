"""Map tile endpoints used by the desktop client."""

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response


router = APIRouter(prefix="/api/map")

_OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
# OSM's public tile service requires clients to identify themselves.  The
# desktop renderer cannot reliably set a User-Agent for image/fetch requests,
# so the loopback backend makes the request on its behalf.
_OSM_USER_AGENT = "ArcWayfarer/0.1 (+https://github.com/WeiYuanLee/ArcWayfarer)"

# Shared persistent connection pool with keep-alive to eliminate TCP/TLS handshake overhead per tile
_http_client = httpx.AsyncClient(
    timeout=10.0,
    limits=httpx.Limits(max_keepalive_connections=2, max_connections=2, keepalive_expiry=30.0),
    headers={"User-Agent": _OSM_USER_AGENT},
)


@router.get("/tiles/{z}/{x}/{y}.png", include_in_schema=False)
async def openstreetmap_tile(z: int, x: int, y: int) -> Response:
    """Fetch one validated OSM standard tile with an identifiable User-Agent via shared connection pool."""
    if not 0 <= z <= 19 or not 0 <= x < 2**z or not 0 <= y < 2**z:
        raise HTTPException(status_code=404, detail="Invalid map tile coordinates.")

    try:
        upstream = await _http_client.get(_OSM_TILE_URL.format(z=z, x=x, y=y))
        upstream.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail="Map tile unavailable.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Unable to reach the map tile service.") from exc

    headers = {"Cache-Control": upstream.headers.get("cache-control", "public, max-age=86400")}
    if content_type := upstream.headers.get("content-type"):
        headers["Content-Type"] = content_type
    return Response(content=upstream.content, headers=headers)
