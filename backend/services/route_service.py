import httpx

from config import NAV_MODE_PROFILE, OSRM_FOSSGIS_BASE_URL
from models.schemas import NavMode


async def fetch_route(nav_mode: NavMode, start: tuple[float, float], end: tuple[float, float]) -> list[tuple[float, float]]:
    profile = NAV_MODE_PROFILE[nav_mode]
    start_lat, start_lng = start
    end_lat, end_lng = end
    url = (
        f"{OSRM_FOSSGIS_BASE_URL}/routed-{profile}/route/v1/{profile}/"
        f"{start_lng},{start_lat};{end_lng},{end_lat}"
    )

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            response = await client.get(url, params={"overview": "full", "geometries": "geojson"})
            response.raise_for_status()
        except httpx.HTTPError as e:
            raise RuntimeError(f"Failed to fetch route: {e}") from e

    payload = response.json()
    routes = payload.get("routes") or []
    if not routes:
        raise RuntimeError("No route found between the selected points.")

    coordinates = routes[0]["geometry"]["coordinates"]
    return [(lat, lng) for lng, lat in coordinates]
