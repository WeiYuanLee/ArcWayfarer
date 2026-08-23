import asyncio

from core import device_session, events, simulation_engine
from core.simulation_engine import SimulationState

GOLD_DITTO_HOLD_SECONDS = 3.5


async def set_location(udid: str, lat: float, lng: float) -> None:
    async def operation() -> None:
        await simulation_engine.set_state(udid, SimulationState.TELEPORTING)
        try:
            await device_session.set_location(udid, lat, lng)
            await events.emit_position(udid, lat, lng)
        finally:
            await simulation_engine.set_state(udid, SimulationState.IDLE)

    await simulation_engine.run_exclusive(udid, operation)


async def clear_location(udid: str) -> None:
    async def operation() -> None:
        await device_session.clear_location(udid)
        await events.emit_position(udid, None, None)

    await simulation_engine.run_exclusive(udid, operation)


async def gold_ditto(udid: str, lat: float, lng: float) -> None:
    """Briefly teleport to a point then clear back to the device's real GPS.

    Used to "check in" at a spot a game expects the player to visit without
    actually staying there — e.g. a Pikmin Bloom gold flower point.
    """
    async def operation() -> None:
        await simulation_engine.set_state(udid, SimulationState.TELEPORTING)
        try:
            await device_session.set_location(udid, lat, lng)
            await events.emit_position(udid, lat, lng)
            await asyncio.sleep(GOLD_DITTO_HOLD_SECONDS)
            # Gold Ditto depends on the set-to-clear timing observed by the
            # game. Do not add the normal map-refresh settle window here.
            await device_session.clear_location(udid, settle_seconds=0, delivery_attempts=1)
            await events.emit_position(udid, None, None)
        finally:
            await simulation_engine.set_state(udid, SimulationState.IDLE)

    await simulation_engine.run_exclusive(udid, operation)
