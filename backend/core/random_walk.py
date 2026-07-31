import random

from config import NAV_MODE_SPEED_MPS, NAVIGATE_TICK_SECONDS
from core import device_manager, simulation_engine
from models.schemas import NavMode
from services import route_service
from services.interpolator import interpolate, random_point_in_radius


async def start_random_walk(
    udid: str,
    nav_mode: NavMode,
    center: tuple[float, float],
    radius_m: float,
    pause_enabled: bool = False,
    pause_min: float = 5.0,
    pause_max: float = 20.0,
    custom_speed_kmh: float | None = None,
    straight_line: bool = True,
) -> None:
    await device_manager.get_device(udid)  # raises ValueError before we schedule anything
    await simulation_engine.ensure_stopped(udid)
    speed_mps = (custom_speed_kmh / 3.6) if custom_speed_kmh else NAV_MODE_SPEED_MPS[nav_mode]

    async def next_leg(current: tuple[float, float] | None):
        origin = current or center
        dest = random_point_in_radius(*center, radius_m)
        if straight_line:
            leg_route = [origin, dest]
        else:
            try:
                leg_route = await route_service.fetch_route(nav_mode, origin, dest)
            except Exception:
                leg_route = [origin, dest]
        leg_playback = interpolate(leg_route, speed_mps, NAVIGATE_TICK_SECONDS)
        pause_seconds = random.uniform(pause_min, pause_max) if pause_enabled else 0.0
        return leg_playback, pause_seconds

    simulation_engine.start_dynamic(udid, next_leg, NAVIGATE_TICK_SECONDS, speed_mps)


def stop_random_walk(udid: str) -> bool:
    return simulation_engine.stop(udid)


async def pause_random_walk(udid: str) -> bool:
    return await simulation_engine.pause(udid)


async def resume_random_walk(udid: str) -> bool:
    return await simulation_engine.resume(udid)
