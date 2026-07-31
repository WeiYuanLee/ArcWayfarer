import asyncio
import logging
import random
import time
from enum import Enum
from typing import Awaitable, Callable, Optional

from core import device_session, events
from services.interpolator import move_point

logger = logging.getLogger(__name__)


class SimulationState(str, Enum):
    IDLE = "idle"
    TELEPORTING = "teleporting"
    NAVIGATING = "navigating"
    LOOPING = "looping"
    RANDOM_WALK = "random_walk"
    JOYSTICK = "joystick"
    PAUSED = "paused"


NextLegFn = Callable[[Optional[tuple[float, float]]], Awaitable[Optional[tuple[list[tuple[float, float]], float]]]]

_states: dict[str, SimulationState] = {}
_tasks: dict[str, asyncio.Task] = {}
_pause_events: dict[str, asyncio.Event] = {}
_paused_from: dict[str, SimulationState] = {}

_joystick_inputs: dict[str, dict] = {}
_joystick_positions: dict[str, tuple[float, float]] = {}

_ACTIVE_STATES = (
    SimulationState.NAVIGATING,
    SimulationState.LOOPING,
    SimulationState.RANDOM_WALK,
    SimulationState.JOYSTICK,
)


def get_state(udid: str) -> SimulationState:
    return _states.get(udid, SimulationState.IDLE)


async def set_state(udid: str, state: SimulationState) -> None:
    _states[udid] = state
    await events.emit_state_change(udid, state.value)


def is_running(udid: str) -> bool:
    task = _tasks.get(udid)
    return task is not None and not task.done()


def start(
    udid: str,
    points: list[tuple[float, float]],
    tick_seconds: float,
    speed_mps: float,
    loop: bool = False,
    station_indices: frozenset[int] = frozenset(),
    station_pause_range: tuple[float, float] = (0.0, 0.0),
    stop_at: dict[int, int] | None = None,
) -> None:
    stop(udid)
    pause_event = asyncio.Event()
    pause_event.set()
    _pause_events[udid] = pause_event
    active_state = SimulationState.LOOPING if loop else SimulationState.NAVIGATING
    _tasks[udid] = asyncio.create_task(
        _run(
            udid,
            points,
            tick_seconds,
            speed_mps,
            pause_event,
            loop,
            active_state,
            station_indices,
            station_pause_range,
            stop_at,
        )
    )


def start_jump(udid: str, points: list[tuple[float, float]], pre_delay: float, post_delay: float) -> None:
    """Teleport directly to each point in sequence, with configurable delays before/after each stop."""
    stop(udid)
    pause_event = asyncio.Event()
    pause_event.set()
    _pause_events[udid] = pause_event
    _tasks[udid] = asyncio.create_task(_run_jump(udid, points, pre_delay, post_delay, pause_event))


def start_dynamic(udid: str, next_leg_fn: NextLegFn, tick_seconds: float, speed_mps: float) -> None:
    """Like start(), but legs are generated on demand instead of known upfront.

    next_leg_fn(current_position) is awaited whenever the previous leg (and its
    post-arrival pause) finishes; it returns (points, pause_seconds_after_arrival)
    for the next leg, or None to end the run.
    """
    stop(udid)
    pause_event = asyncio.Event()
    pause_event.set()
    _pause_events[udid] = pause_event
    _tasks[udid] = asyncio.create_task(_run_dynamic(udid, next_leg_fn, tick_seconds, speed_mps, pause_event))


def stop(udid: str) -> bool:
    _pause_events.pop(udid, None)
    _paused_from.pop(udid, None)
    _joystick_inputs.pop(udid, None)
    _joystick_positions.pop(udid, None)
    task = _tasks.pop(udid, None)
    if task is None or task.done():
        return False
    task.cancel()
    return True


def joystick_start(udid: str, lat: float, lng: float, speed_mps: float, tick_seconds: float) -> None:
    stop(udid)
    pause_event = asyncio.Event()
    pause_event.set()
    _pause_events[udid] = pause_event
    _joystick_positions[udid] = (lat, lng)
    _joystick_inputs[udid] = {"direction": 0.0, "intensity": 0.0}
    _tasks[udid] = asyncio.create_task(_run_joystick(udid, speed_mps, tick_seconds, pause_event))


def joystick_move(udid: str, direction: float, intensity: float) -> None:
    if udid in _joystick_inputs:
        _joystick_inputs[udid] = {"direction": direction, "intensity": intensity}


async def joystick_stop(udid: str) -> bool:
    return stop(udid)


async def pause(udid: str) -> bool:
    state = get_state(udid)
    if state not in _ACTIVE_STATES:
        return False
    pause_event = _pause_events.get(udid)
    if pause_event is None:
        return False
    pause_event.clear()
    _paused_from[udid] = state
    await set_state(udid, SimulationState.PAUSED)
    return True


async def resume(udid: str) -> bool:
    if get_state(udid) != SimulationState.PAUSED:
        return False
    pause_event = _pause_events.get(udid)
    if pause_event is None:
        return False
    pause_event.set()
    restore_state = _paused_from.pop(udid, SimulationState.NAVIGATING)
    await set_state(udid, restore_state)
    return True


async def ensure_stopped(udid: str) -> None:
    stop(udid)
    await set_state(udid, SimulationState.IDLE)


async def _run(
    udid: str,
    points: list[tuple[float, float]],
    tick_seconds: float,
    speed_mps: float,
    pause_event: asyncio.Event,
    loop: bool,
    active_state: SimulationState,
    station_indices: frozenset[int],
    station_pause_range: tuple[float, float],
    stop_at: dict[int, int] | None = None,
) -> None:
    await set_state(udid, active_state)
    pause_lo, pause_hi = sorted(station_pause_range)
    current_stop = stop_at.get(0) if stop_at else None
    try:
        session = await device_session.get_session(udid)
        total_ticks = len(points)
        while True:
            for idx, (lat, lng) in enumerate(points):
                await pause_event.wait()
                await session.set(lat, lng)
                if stop_at is not None and idx in stop_at:
                    current_stop = stop_at[idx]
                eta_seconds = (total_ticks - 1 - idx) * tick_seconds
                await events.emit_position(udid, lat, lng, speed_mps, eta_seconds, current_stop)
                await asyncio.sleep(tick_seconds)
                if idx in station_indices and pause_hi > 0:
                    await asyncio.sleep(random.uniform(pause_lo, pause_hi))
            if not loop:
                break
    except asyncio.CancelledError:
        pass
    except Exception:
        logger.exception("Simulation for %s stopped unexpectedly", udid)
    finally:
        await set_state(udid, SimulationState.IDLE)


async def _run_dynamic(
    udid: str,
    next_leg_fn: NextLegFn,
    tick_seconds: float,
    speed_mps: float,
    pause_event: asyncio.Event,
) -> None:
    await set_state(udid, SimulationState.RANDOM_WALK)
    try:
        session = await device_session.get_session(udid)
        current: Optional[tuple[float, float]] = None
        while True:
            leg = await next_leg_fn(current)
            if not leg:
                break
            points, pause_seconds = leg
            for lat, lng in points:
                await pause_event.wait()
                await session.set(lat, lng)
                current = (lat, lng)
                await events.emit_position(udid, lat, lng, speed_mps, 0.0)
                await asyncio.sleep(tick_seconds)
            if pause_seconds > 0:
                await pause_event.wait()
                await asyncio.sleep(pause_seconds)
    except asyncio.CancelledError:
        pass
    except Exception:
        logger.exception("Simulation for %s stopped unexpectedly", udid)
    finally:
        await set_state(udid, SimulationState.IDLE)


async def _run_jump(
    udid: str,
    points: list[tuple[float, float]],
    pre_delay: float,
    post_delay: float,
    pause_event: asyncio.Event,
) -> None:
    await set_state(udid, SimulationState.NAVIGATING)
    try:
        session = await device_session.get_session(udid)
        for idx, (lat, lng) in enumerate(points):
            await pause_event.wait()
            if pre_delay > 0:
                await asyncio.sleep(pre_delay)
            await pause_event.wait()
            await session.set(lat, lng)
            await events.emit_position(udid, lat, lng, 0.0, 0.0, idx + 1)
            if idx < len(points) - 1 and post_delay > 0:
                await pause_event.wait()
                await asyncio.sleep(post_delay)
    except asyncio.CancelledError:
        pass
    except Exception:
        logger.exception("Jump simulation for %s stopped unexpectedly", udid)
    finally:
        await set_state(udid, SimulationState.IDLE)


async def _run_joystick(
    udid: str,
    speed_mps: float,
    tick_seconds: float,
    pause_event: asyncio.Event,
) -> None:
    await set_state(udid, SimulationState.JOYSTICK)
    try:
        session = await device_session.get_session(udid)
        while True:
            tick_start = time.monotonic()
            await pause_event.wait()
            inp = _joystick_inputs.get(udid)
            if inp and inp["intensity"] > 0:
                lat, lng = _joystick_positions[udid]
                distance = speed_mps * inp["intensity"] * tick_seconds
                lat, lng = move_point(lat, lng, inp["direction"], distance)
                _joystick_positions[udid] = (lat, lng)
                await session.set(lat, lng)
                await events.emit_position(udid, lat, lng, speed_mps * inp["intensity"], 0.0)
            elapsed = time.monotonic() - tick_start
            await asyncio.sleep(max(tick_seconds - elapsed, 0.0))
    except asyncio.CancelledError:
        pass
    except Exception:
        logger.exception("Joystick simulation for %s stopped unexpectedly", udid)
    finally:
        await set_state(udid, SimulationState.IDLE)
