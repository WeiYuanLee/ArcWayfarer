from config import NAV_MODE_SPEED_MPS, NAVIGATE_TICK_SECONDS
from core import device_manager, simulation_engine
from models.schemas import NavMode
from services import route_service
from services.interpolator import interpolate


async def _build_loop_playback(
    nav_mode: NavMode,
    waypoints: list[tuple[float, float]],
    speed_mps: float,
    tick_seconds: float,
    straight_line: bool = False,
) -> tuple[list[tuple[float, float]], frozenset[int], dict[int, int]]:
    """Route + interpolate each leg separately so we know which tick index lands on each waypoint."""
    playback: list[tuple[float, float]] = []
    station_indices: set[int] = set()
    stop_at: dict[int, int] = {0: 1}  # tick 0 = arrived at stop 1 (starting waypoint)
    n = len(waypoints)
    for i in range(n):
        start = waypoints[i]
        end = waypoints[(i + 1) % n]
        if straight_line:
            leg_route = [start, end]
        else:
            try:
                leg_route = await route_service.fetch_route(nav_mode, start, end)
            except Exception:
                leg_route = [start, end]
        leg_playback = interpolate(leg_route, speed_mps, tick_seconds)
        if playback and leg_playback:
            leg_playback = leg_playback[1:]  # drop the point shared with the previous leg's end
        playback.extend(leg_playback)
        is_last_leg = i == n - 1
        if playback:
            stop_at[len(playback) - 1] = 1 if is_last_leg else i + 2
            station_indices.add(len(playback) - 1)
    return playback, frozenset(station_indices), stop_at


async def start_route_loop(
    udid: str,
    nav_mode: NavMode,
    waypoints: list[tuple[float, float]],
    pause_enabled: bool = False,
    pause_min: float = 5.0,
    pause_max: float = 20.0,
    straight_line: bool = False,
    custom_speed_kmh: float | None = None,
) -> list[tuple[float, float]]:
    if len(waypoints) < 2:
        raise RuntimeError("Route Loop needs at least 2 waypoints.")

    await device_manager.get_device(udid)  # raises ValueError before we schedule anything
    await simulation_engine.ensure_stopped(udid)
    speed_mps = (custom_speed_kmh / 3.6) if custom_speed_kmh else NAV_MODE_SPEED_MPS[nav_mode]
    playback_points, station_indices, stop_at = await _build_loop_playback(
        nav_mode, waypoints, speed_mps, NAVIGATE_TICK_SECONDS, straight_line
    )
    pause_range = (pause_min, pause_max) if pause_enabled else (0.0, 0.0)
    simulation_engine.start(
        udid,
        playback_points,
        NAVIGATE_TICK_SECONDS,
        speed_mps,
        loop=True,
        station_indices=station_indices,
        station_pause_range=pause_range,
        stop_at=stop_at,
    )
    return playback_points


def stop_route_loop(udid: str) -> bool:
    return simulation_engine.stop(udid)


async def pause_route_loop(udid: str) -> bool:
    return await simulation_engine.pause(udid)


async def resume_route_loop(udid: str) -> bool:
    return await simulation_engine.resume(udid)
