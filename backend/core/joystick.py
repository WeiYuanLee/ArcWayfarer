from config import NAV_MODE_SPEED_MPS
from core import device_manager, simulation_engine
from models.schemas import NavMode

JOYSTICK_TICK_SECONDS = 0.2


async def start_joystick(
    udid: str, nav_mode: NavMode, lat: float, lng: float, custom_speed_kmh: float | None = None
) -> None:
    await device_manager.get_device(udid)  # raises ValueError before we schedule anything
    speed_mps = (custom_speed_kmh / 3.6) if custom_speed_kmh else NAV_MODE_SPEED_MPS[nav_mode]
    simulation_engine.joystick_start(udid, lat, lng, speed_mps, JOYSTICK_TICK_SECONDS)


def move_joystick(udid: str, direction: float, intensity: float) -> None:
    simulation_engine.joystick_move(udid, direction, intensity)


async def stop_joystick(udid: str) -> bool:
    return await simulation_engine.joystick_stop(udid)
