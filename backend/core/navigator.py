from config import NAV_MODE_SPEED_MPS, NAVIGATE_TICK_SECONDS
from core import device_manager, simulation_engine
from models.schemas import NavMode
from services import route_service
from services.interpolator import interpolate


async def start_navigate(
    udid: str,
    nav_mode: NavMode,
    start: tuple[float, float],
    end: tuple[float, float],
    custom_speed_kmh: float | None = None,
) -> list[tuple[float, float]]:
    await device_manager.get_device(udid)  # raises ValueError before we schedule anything
    await simulation_engine.ensure_stopped(udid)
    route_points = await route_service.fetch_route(nav_mode, start, end)
    speed_mps = (custom_speed_kmh / 3.6) if custom_speed_kmh else NAV_MODE_SPEED_MPS[nav_mode]
    playback_points = interpolate(route_points, speed_mps, NAVIGATE_TICK_SECONDS)
    simulation_engine.start(udid, playback_points, NAVIGATE_TICK_SECONDS, speed_mps)
    return playback_points


def stop_navigate(udid: str) -> bool:
    return simulation_engine.stop(udid)


async def pause_navigate(udid: str) -> bool:
    return await simulation_engine.pause(udid)


async def resume_navigate(udid: str) -> bool:
    return await simulation_engine.resume(udid)
