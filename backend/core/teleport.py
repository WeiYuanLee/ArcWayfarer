import asyncio

from core import device_session, events, simulation_engine
from core.simulation_engine import SimulationState

GOLD_DITTO_HOLD_SECONDS = 3.5


async def set_location(udid: str, lat: float, lng: float) -> None:
    await simulation_engine.ensure_stopped(udid)
    await simulation_engine.set_state(udid, SimulationState.TELEPORTING)
    try:
        session = await device_session.get_session(udid)
        await session.set(lat, lng)
        await events.emit_position(udid, lat, lng)
    finally:
        await simulation_engine.set_state(udid, SimulationState.IDLE)


async def clear_location(udid: str) -> None:
    await simulation_engine.ensure_stopped(udid)
    if device_session.has_session(udid):
        session = await device_session.get_session(udid)
        try:
            await session.clear()
        finally:
            await device_session.close_session(udid)
    else:
        await device_session.close_session(udid)
    await events.emit_position(udid, None, None)


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
        await events.emit_position(udid, lat, lng)
        await asyncio.sleep(GOLD_DITTO_HOLD_SECONDS)
        try:
            await session.clear()
        finally:
            await device_session.close_session(udid)
        await events.emit_position(udid, None, None)
    finally:
        await simulation_engine.set_state(udid, SimulationState.IDLE)
