from config import NAV_MODE_SPEED_MPS, NAVIGATE_TICK_SECONDS
from core import device_manager, simulation_engine
from models.schemas import NavMode
from services import route_service
from services.interpolator import interpolate


async def _build_multistop_playback(
    nav_mode: NavMode,
    waypoints: list[tuple[float, float]],
    speed_mps: float,
    tick_seconds: float,
    straight_line: bool = False,
) -> tuple[list[tuple[float, float]], frozenset[int], dict[int, int], list[list[tuple[float, float]]]]:
    """Route + interpolate each leg separately (no closing leg back to the first waypoint)."""
    playback: list[tuple[float, float]] = []
    leg_playbacks: list[list[tuple[float, float]]] = []
    station_indices: set[int] = set()
    stop_at: dict[int, int] = {0: 1}  # tick 0 = arrived at stop 1 (the starting waypoint)
    num_legs = len(waypoints) - 1
    for i in range(num_legs):
        start = route_service.normalize_coordinate(*waypoints[i])
        end = route_service.normalize_coordinate(*waypoints[i + 1])
        if straight_line:
            leg_route = [start, end]
        else:
            try:
                leg_route = await route_service.fetch_route(nav_mode, start, end)
            except Exception:
                leg_route = [start, end]
        leg_playback = interpolate(leg_route, speed_mps, tick_seconds)
        leg_geometry = leg_playback or [start, end]
        if playback and leg_playback:
            leg_playback = leg_playback[1:]  # drop the point shared with the previous leg's end
        if not leg_playback:
            leg_playback = [end]
        playback.extend(leg_playback)
        leg_playbacks.append(leg_geometry)
        is_last_leg = i == num_legs - 1
        if playback:
            stop_at[len(playback) - 1] = i + 2  # 1-based stop number for waypoints[i + 1]
        if playback and not is_last_leg:
            station_indices.add(len(playback) - 1)  # no pause at the final destination — nothing follows it
    return playback, frozenset(station_indices), stop_at, leg_playbacks


async def start_multi_stop(
    udid: str,
    nav_mode: NavMode,
    waypoints: list[tuple[float, float]],
    pause_enabled: bool = False,
    pause_min: float = 5.0,
    pause_max: float = 20.0,
    straight_line: bool = False,
    jump_mode: bool = False,
    jump_pre_delay: float = 0.0,
    jump_post_delay: float = 0.0,
    custom_speed_kmh: float | None = None,
) -> tuple[list[tuple[float, float]], list[list[tuple[float, float]]]]:
    if len(waypoints) < 2:
        raise RuntimeError("Multi-stop needs at least 2 waypoints.")

    await device_manager.get_device(udid)  # raises ValueError before we schedule anything
    await simulation_engine.ensure_stopped(udid)

    if jump_mode:
        simulation_engine.start_jump(udid, waypoints, jump_pre_delay, jump_post_delay, task_kind="multi_stop")
        return waypoints, []

    speed_mps = (custom_speed_kmh / 3.6) if custom_speed_kmh else NAV_MODE_SPEED_MPS[nav_mode]
    playback_points, station_indices, stop_at, leg_playbacks = await _build_multistop_playback(
        nav_mode, waypoints, speed_mps, NAVIGATE_TICK_SECONDS, straight_line
    )
    pause_range = (pause_min, pause_max) if pause_enabled else (0.0, 0.0)
    simulation_engine.start(
        udid,
        playback_points,
        NAVIGATE_TICK_SECONDS,
        speed_mps,
        loop=False,
        station_indices=station_indices,
        station_pause_range=pause_range,
        stop_at=stop_at,
        task_kind="multi_stop",
    )
    return playback_points, leg_playbacks


def stop_multi_stop(udid: str) -> bool:
    return simulation_engine.stop(udid)


async def pause_multi_stop(udid: str) -> bool:
    return await simulation_engine.pause(udid)


async def resume_multi_stop(udid: str) -> bool:
    return await simulation_engine.resume(udid)
