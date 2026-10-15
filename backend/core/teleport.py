from core import device_session, events, simulation_engine
from core.simulation_engine import SimulationState


async def set_location(udid: str, lat: float, lng: float) -> None:
    async def operation() -> None:
        session = simulation_engine.get_navigation_session(udid)
        session.gold_ditto_origin = None
        await simulation_engine.set_state(udid, SimulationState.TELEPORTING)
        try:
            await device_session.set_location(udid, lat, lng)
            await events.emit_position(udid, lat, lng)
        finally:
            await simulation_engine.set_state(udid, SimulationState.IDLE)

    await simulation_engine.run_exclusive(udid, operation)


async def clear_location(udid: str) -> None:
    async def operation() -> None:
        session = simulation_engine.get_navigation_session(udid)
        await device_session.clear_location(udid)
        # Always publish a terminal state for restore, including when the device
        # was already idle before this command.
        session.gold_ditto_origin = None
        await simulation_engine.set_state(udid, SimulationState.IDLE)
        await events.emit_position(udid, None, None)
        await events.emit_restored(udid)

    await simulation_engine.run_exclusive(udid, operation)


async def gold_ditto(
    udid: str,
    lat: float,
    lng: float,
    *,
    origin: tuple[float, float] | None = None,
) -> None:
    """Teleport to a point and hold until the user explicitly restores GPS.

    Pikmin Bloom can take an unpredictable amount of time to refresh its UI
    after iOS accepts a simulated location.  A fixed server-side delay races
    that refresh and may restore the real GPS before the relevant screen is
    open.  Keep a distinct state instead; ``finish_gold_ditto`` completes the
    second phase when the user confirms that the game screen is ready.
    """
    async def operation() -> None:
        session = simulation_engine.get_navigation_session(udid)
        await simulation_engine.set_state(udid, SimulationState.TELEPORTING)
        try:
            await device_session.set_location(udid, lat, lng)
            await events.emit_position(udid, lat, lng)
            session.gold_ditto_origin = origin
            await simulation_engine.set_state(udid, SimulationState.GOLD_DITTO)
        except Exception:
            session.gold_ditto_origin = None
            await simulation_engine.set_state(udid, SimulationState.IDLE)
            raise

    await simulation_engine.run_exclusive(udid, operation)


async def finish_gold_ditto(udid: str) -> None:
    """Immediately return toward the origin, then release simulated GPS.

    The client countdown runs over this handoff and tells the user to keep
    pulling while Pikmin processes the location change.  When an origin was
    supplied, write it through the already-open location channel before
    clearing that same channel.  This avoids opening a second simulator
    session during the timing-sensitive handoff to real Core Location.
    """
    session = simulation_engine.get_navigation_session(udid)

    async def operation() -> None:
        origin = session.gold_ditto_origin
        try:
            if origin is not None:
                await device_session.set_location(udid, origin[0], origin[1])
                await events.emit_position(udid, origin[0], origin[1])
            await device_session.clear_location(
                udid,
                settle_seconds=0,
                delivery_attempts=1,
            )
            await events.emit_position(udid, None, None)
            await events.emit_restored(udid)
        finally:
            session.gold_ditto_origin = None
            await simulation_engine.set_state(udid, SimulationState.IDLE)

    try:
        await simulation_engine.run_exclusive(
            udid,
            operation,
            required_state=SimulationState.GOLD_DITTO,
            reset_state=False,
        )
    except simulation_engine.SimulationStateError as exc:
        raise ValueError("Gold Ditto is not waiting for completion on this device.") from exc
