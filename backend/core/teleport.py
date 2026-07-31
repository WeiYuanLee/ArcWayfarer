import asyncio

from core import device_session, simulation_engine
from core.simulation_engine import SimulationState

GOLD_DITTO_HOLD_SECONDS = 2.0


async def set_location(udid: str, lat: float, lng: float) -> None:
    await simulation_engine.ensure_stopped(udid)
    await simulation_engine.set_state(udid, SimulationState.TELEPORTING)
    try:
        session = await device_session.get_session(udid)
        await session.set(lat, lng)
    finally:
        await simulation_engine.set_state(udid, SimulationState.IDLE)


async def clear_location(udid: str) -> None:
    session = await device_session.get_session(udid)
    await session.clear()


async def gold_ditto(udid: str, lat: float, lng: float) -> None:
    """Briefly teleport to a point then clear back to the device's real GPS.

    Used to "check in" at a spot a game expects the player to visit without
    actually staying there — e.g. a Pikmin Bloom gold flower point.
    """
    await simulation_engine.ensure_stopped(udid)
    await simulation_engine.set_state(udid, SimulationState.TELEPORTING)
    try:
        session = await device_session.get_session(udid)
        await session.set(lat, lng)
        await asyncio.sleep(GOLD_DITTO_HOLD_SECONDS)
        await session.clear()
    finally:
        await simulation_engine.set_state(udid, SimulationState.IDLE)
