import asyncio
import math
import time
from dataclasses import dataclass

import httpx

from config import NAV_MODE_PROFILE, OSRM_FOSSGIS_BASE_URL, ROUTE_CACHE_MAX_ENTRIES, ROUTE_CACHE_TTL_SECONDS
from models.schemas import NavMode


@dataclass(frozen=True)
class RoutePlan:
    points: tuple[tuple[float, float], ...]
    distance_m: float


RouteCacheKey = tuple[NavMode, float, float, float, float]
_route_cache: dict[RouteCacheKey, tuple[float, RoutePlan]] = {}
_route_inflight: dict[RouteCacheKey, asyncio.Task[RoutePlan]] = {}


def wrap_longitude(lng: float) -> float:
    """Normalize longitude to [-180.0, 180.0] degrees."""
    wrapped = ((lng + 180.0) % 360.0 + 360.0) % 360.0 - 180.0
    if wrapped == -180.0 and lng > 0:
        return 180.0
    return wrapped


def clamp_latitude(lat: float) -> float:
    """Clamp latitude to [-90.0, 90.0] degrees."""
    return max(-90.0, min(90.0, lat))


def normalize_coordinate(lat: float, lng: float) -> tuple[float, float]:
    return clamp_latitude(lat), wrap_longitude(lng)


def _cache_key(nav_mode: NavMode, start: tuple[float, float], end: tuple[float, float]) -> RouteCacheKey:
    start_lat, start_lng = normalize_coordinate(*start)
    end_lat, end_lng = normalize_coordinate(*end)
    return nav_mode, round(start_lat, 6), round(start_lng, 6), round(end_lat, 6), round(end_lng, 6)


def _prune_route_cache(now: float) -> None:
    for key, (expires_at, _) in list(_route_cache.items()):
        if expires_at <= now:
            _route_cache.pop(key, None)
    while len(_route_cache) >= ROUTE_CACHE_MAX_ENTRIES:
        _route_cache.pop(next(iter(_route_cache)))


def _finish_route_request(key: RouteCacheKey, task: asyncio.Task[RoutePlan]) -> None:
    if _route_inflight.get(key) is not task:
        return
    _route_inflight.pop(key, None)
    if task.cancelled() or task.exception() is not None:
        return
    now = time.monotonic()
    _prune_route_cache(now)
    _route_cache[key] = (now + ROUTE_CACHE_TTL_SECONDS, task.result())


def _route_distance_m(points: list[tuple[float, float]]) -> float:
    earth_radius_m = 6_371_000.0
    total = 0.0
    for (start_lat, start_lng), (end_lat, end_lng) in zip(points, points[1:]):
        lat1 = math.radians(start_lat)
        lat2 = math.radians(end_lat)
        delta_lat = lat2 - lat1
        delta_lng = math.radians(end_lng - start_lng)
        haversine = math.sin(delta_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lng / 2) ** 2
        total += 2 * earth_radius_m * math.asin(math.sqrt(haversine))
    return total


async def _fetch_route_plan_uncached(nav_mode: NavMode, start: tuple[float, float], end: tuple[float, float]) -> RoutePlan:
    profile = NAV_MODE_PROFILE[nav_mode]
    start_lat, start_lng = normalize_coordinate(*start)
    end_lat, end_lng = normalize_coordinate(*end)
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

    selected_route = routes[0]
    coordinates = selected_route["geometry"]["coordinates"]
    points = [(lat, lng) for lng, lat in coordinates]
    if len(points) < 2:
        raise RuntimeError("The routing service returned an incomplete route.")
    distance = selected_route.get("distance")
    distance_m = float(distance) if isinstance(distance, (int, float)) else _route_distance_m(points)
    return RoutePlan(points=tuple(points), distance_m=distance_m)


async def fetch_route_plan(nav_mode: NavMode, start: tuple[float, float], end: tuple[float, float]) -> RoutePlan:
    key = _cache_key(nav_mode, start, end)
    now = time.monotonic()
    cached = _route_cache.get(key)
    if cached and cached[0] > now:
        return cached[1]
    if cached:
        _route_cache.pop(key, None)

    task = _route_inflight.get(key)
    if task is None:
        task = asyncio.create_task(_fetch_route_plan_uncached(nav_mode, start, end))
        _route_inflight[key] = task
        task.add_done_callback(lambda completed, cache_key=key: _finish_route_request(cache_key, completed))
    return await asyncio.shield(task)


async def fetch_route(nav_mode: NavMode, start: tuple[float, float], end: tuple[float, float]) -> list[tuple[float, float]]:
    plan = await fetch_route_plan(nav_mode, start, end)
    return list(plan.points)


def clear_route_cache() -> None:
    """Clear cached route previews; primarily useful for deterministic tests."""
    _route_cache.clear()
