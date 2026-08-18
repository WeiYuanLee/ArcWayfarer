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


@router.get("/tiles/{z}/{x}/{y}.png", include_in_schema=False)
async def openstreetmap_tile(z: int, x: int, y: int) -> Response:
    """Fetch one validated OSM standard tile with an identifiable User-Agent."""
    if not 0 <= z <= 19 or not 0 <= x < 2**z or not 0 <= y < 2**z:
        raise HTTPException(status_code=404, detail="Invalid map tile coordinates.")

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            upstream = await client.get(
                _OSM_TILE_URL.format(z=z, x=x, y=y),
                headers={"User-Agent": _OSM_USER_AGENT},
            )
            upstream.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail="Map tile unavailable.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Unable to reach the map tile service.") from exc

    headers = {"Cache-Control": upstream.headers.get("cache-control", "public, max-age=86400")}
    if content_type := upstream.headers.get("content-type"):
        headers["Content-Type"] = content_type
    return Response(content=upstream.content, headers=headers)
