import asyncio
import logging
import random
import time
from enum import Enum
from typing import Awaitable, Callable, Optional, TypeVar

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
T = TypeVar("T")


class NavigationSession:
    """Manages simulation navigation state machine and task lifecycle per device (udid)."""

    def __init__(self, udid: str):
        self.udid = udid
        self.state: SimulationState = SimulationState.IDLE
        self.lock: asyncio.Lock = asyncio.Lock()
        self.task: Optional[asyncio.Task] = None
        self.stopping_task: Optional[asyncio.Task] = None
        self.pause_event: asyncio.Event = asyncio.Event()
        self.pause_event.set()
        self.paused_from: Optional[SimulationState] = None
        self.joystick_input: Optional[dict] = None
        self.joystick_position: Optional[tuple[float, float]] = None
        # A mobile controller may connect after a task has already started.
        # Keep a display-only task snapshot so it can show the active route.
        self.active_path: list[tuple[float, float]] = []
        self.task_kind: str | None = None
        # Invalidate deferred starts (route planning happens before a task can be
        # created) whenever a newer stop/restore command wins.
        self.command_generation = 0

    def stop_task(self) -> bool:
        """Cancels and clears any active simulation task, returning True if a task was canceled."""
        self.command_generation += 1
        self.pause_event.set()
        self.paused_from = None
        self.joystick_input = None
        self.joystick_position = None
        self.active_path = []
        self.task_kind = None
        if self.task is None or self.task.done():
            self.task = None
            return False
        self.stopping_task = self.task
        self.task.cancel()
        self.task = None
        return True


_sessions: dict[str, NavigationSession] = {}


def get_navigation_session(udid: str) -> NavigationSession:
    if udid not in _sessions:
        _sessions[udid] = NavigationSession(udid)
    return _sessions[udid]


_ACTIVE_STATES = (
    SimulationState.NAVIGATING,
    SimulationState.LOOPING,
    SimulationState.RANDOM_WALK,
    SimulationState.JOYSTICK,
)


def get_state(udid: str) -> SimulationState:
    return get_navigation_session(udid).state


def get_active_task_snapshots() -> list[dict]:
    """Return display-only active task data for newly connected controllers."""
    snapshots = []
    for session in _sessions.values():
        if session.state == SimulationState.IDLE:
            continue
        state = session.state.value
        if session.state == SimulationState.PAUSED and session.paused_from:
            state = f"paused:{session.paused_from.value}"
        snapshots.append({
            "udid": session.udid,
            "state": state,
            "kind": (session.task_kind or session.paused_from.value) if session.paused_from else (session.task_kind or state),
            "path": [{"lat": lat, "lng": lng} for lat, lng in session.active_path],
        })
    return snapshots


async def set_state(udid: str, state: SimulationState) -> None:
    session = get_navigation_session(udid)
    session.state = state
    state_str = state.value
    if state == SimulationState.PAUSED and session.paused_from:
        state_str = f"paused:{session.paused_from.value}"
    await events.emit_state_change(udid, state_str)


def is_running(udid: str) -> bool:
    session = get_navigation_session(udid)
    return session.task is not None and not session.task.done()


def stop(udid: str) -> bool:
    session = get_navigation_session(udid)
    return session.stop_task()


async def _stop_task_and_wait(session: NavigationSession) -> None:
    """Cancel the current task and wait for its cleanup before replacing it."""
    task = session.task or session.stopping_task
    session.stop_task()
    if task is not None and not task.done():
        try:
            await task
        except asyncio.CancelledError:
            pass
    if session.stopping_task is task:
        session.stopping_task = None


async def _start_async(
    udid: str,
    points: list[tuple[float, float]],
    tick_seconds: float,
    speed_mps: float,
    loop: bool,
    station_indices: frozenset[int],
    station_pause_range: tuple[float, float],
    stop_at: dict[int, int] | None,
    task_kind: str,
    expected_generation: int,
) -> None:
    session = get_navigation_session(udid)
    async with session.lock:
        if expected_generation != session.command_generation:
            return
        await _stop_task_and_wait(session)
        session.active_path = list(points)
        session.task_kind = task_kind
        active_state = SimulationState.LOOPING if loop else SimulationState.NAVIGATING
        session.task = asyncio.create_task(
            _run(
                session,
                points,
                tick_seconds,
                speed_mps,
                loop,
                active_state,
                station_indices,
                station_pause_range,
                stop_at,
            )
        )


def start(
    udid: str,
    points: list[tuple[float, float]],
    tick_seconds: float,
    speed_mps: float,
    loop: bool = False,
    station_indices: frozenset[int] = frozenset(),
    station_pause_range: tuple[float, float] = (0.0, 0.0),
    stop_at: dict[int, int] | None = None,
    task_kind: str = "navigate",
) -> None:
    session = get_navigation_session(udid)
    expected_generation = session.command_generation
    asyncio.create_task(
        _start_async(
            udid,
            points,
            tick_seconds,
            speed_mps,
            loop,
            station_indices,
            station_pause_range,
            stop_at,
            task_kind,
            expected_generation,
        )
    )


async def _start_jump_async(
    udid: str,
    points: list[tuple[float, float]],
    pre_delay: float,
    post_delay: float,
    expected_generation: int,
    task_kind: str,
) -> None:
    session = get_navigation_session(udid)
    async with session.lock:
        if expected_generation != session.command_generation:
            return
        await _stop_task_and_wait(session)
        session.active_path = list(points)
        session.task_kind = task_kind
        session.task = asyncio.create_task(_run_jump(session, points, pre_delay, post_delay))


def start_jump(udid: str, points: list[tuple[float, float]], pre_delay: float, post_delay: float, task_kind: str = "multi_stop") -> None:
    """Teleport directly to each point in sequence, with configurable delays before/after each stop."""
    expected_generation = get_navigation_session(udid).command_generation
    asyncio.create_task(_start_jump_async(udid, points, pre_delay, post_delay, expected_generation, task_kind))


async def _start_dynamic_async(
    udid: str,
    next_leg_fn: NextLegFn,
    tick_seconds: float,
    speed_mps: float,
    expected_generation: int,
) -> None:
    session = get_navigation_session(udid)
    async with session.lock:
        if expected_generation != session.command_generation:
            return
        await _stop_task_and_wait(session)
        session.task = asyncio.create_task(_run_dynamic(session, next_leg_fn, tick_seconds, speed_mps))


def start_dynamic(udid: str, next_leg_fn: NextLegFn, tick_seconds: float, speed_mps: float) -> None:
    """Like start(), but legs are generated on demand instead of known upfront."""
    expected_generation = get_navigation_session(udid).command_generation
    asyncio.create_task(_start_dynamic_async(udid, next_leg_fn, tick_seconds, speed_mps, expected_generation))


async def _joystick_start_async(
    udid: str,
    lat: float,
    lng: float,
    speed_mps: float,
    tick_seconds: float,
    expected_generation: int,
) -> None:
    session = get_navigation_session(udid)
    async with session.lock:
        if expected_generation != session.command_generation:
            return
        await _stop_task_and_wait(session)
        session.joystick_position = (lat, lng)
        session.joystick_input = {"direction": 0.0, "intensity": 0.0}
        session.task = asyncio.create_task(_run_joystick(session, speed_mps, tick_seconds))


def joystick_start(udid: str, lat: float, lng: float, speed_mps: float, tick_seconds: float) -> None:
    expected_generation = get_navigation_session(udid).command_generation
    asyncio.create_task(_joystick_start_async(udid, lat, lng, speed_mps, tick_seconds, expected_generation))


def joystick_move(udid: str, direction: float, intensity: float) -> None:
    session = get_navigation_session(udid)
    if session.joystick_input is not None:
        session.joystick_input = {"direction": direction, "intensity": intensity}


async def joystick_stop(udid: str) -> bool:
    session = get_navigation_session(udid)
    async with session.lock:
        task = session.task
        stopped = session.stop_task()
        if task is not None and not task.done():
            try:
                await task
            except asyncio.CancelledError:
                pass
        if session.state != SimulationState.IDLE:
            await set_state(udid, SimulationState.IDLE)
        return stopped


async def pause(udid: str) -> bool:
    session = get_navigation_session(udid)
    if session.state not in _ACTIVE_STATES:
        return False
    session.pause_event.clear()
    session.paused_from = session.state
    await set_state(udid, SimulationState.PAUSED)
    return True


async def resume(udid: str) -> bool:
    session = get_navigation_session(udid)
    if session.state != SimulationState.PAUSED:
        return False
    session.pause_event.set()
    restore_state = session.paused_from or SimulationState.NAVIGATING
    session.paused_from = None
    await set_state(udid, restore_state)
    return True


async def ensure_stopped(udid: str) -> None:
    """Cancel and *wait for* the active task before another location command.

    Cancellation alone is not sufficient: a route task may already be writing a
    coordinate through the device session when a restore command arrives.
    """
    session = get_navigation_session(udid)
    async with session.lock:
        await _stop_task_and_wait(session)
        if session.state != SimulationState.IDLE:
            await set_state(udid, SimulationState.IDLE)


async def run_exclusive(udid: str, operation: Callable[[], Awaitable[T]]) -> T:
    """Run a location-changing command after the previous simulation is gone.

    Holding the navigation lock through the operation prevents a newly scheduled
    route from starting between task cancellation and a teleport/restore command.
    """
    session = get_navigation_session(udid)
    async with session.lock:
        await _stop_task_and_wait(session)
        if session.state != SimulationState.IDLE:
            await set_state(udid, SimulationState.IDLE)
        return await operation()


async def _run(
    session: NavigationSession,
    points: list[tuple[float, float]],
    tick_seconds: float,
    speed_mps: float,
    loop: bool,
    active_state: SimulationState,
    station_indices: frozenset[int],
    station_pause_range: tuple[float, float],
    stop_at: dict[int, int] | None = None,
) -> None:
    await set_state(session.udid, active_state)
    pause_lo, pause_hi = sorted(station_pause_range)
    current_stop = stop_at.get(0) if stop_at else None
    try:
        total_ticks = len(points)
        while True:
            for idx, (lat, lng) in enumerate(points):
                await session.pause_event.wait()
                await device_session.set_location(session.udid, lat, lng)
                if stop_at is not None and idx in stop_at:
                    current_stop = stop_at[idx]
                eta_seconds = (total_ticks - 1 - idx) * tick_seconds
                await events.emit_position(session.udid, lat, lng, speed_mps, eta_seconds, current_stop)
                await asyncio.sleep(tick_seconds)
                if idx in station_indices and pause_hi > 0:
                    await asyncio.sleep(random.uniform(pause_lo, pause_hi))
            if not loop:
                break
    except asyncio.CancelledError:
        pass
    except Exception:
        logger.exception("Simulation for %s stopped unexpectedly", session.udid)
    finally:
        await set_state(session.udid, SimulationState.IDLE)
        session.task = None
        session.active_path = []
        session.task_kind = None
        session.active_path = []
        session.task_kind = None


async def _run_dynamic(
    session: NavigationSession,
    next_leg_fn: NextLegFn,
    tick_seconds: float,
    speed_mps: float,
) -> None:
    await set_state(session.udid, SimulationState.RANDOM_WALK)
    try:
        current: Optional[tuple[float, float]] = None
        while True:
            leg = await next_leg_fn(current)
            if not leg:
                break
            points, pause_seconds = leg
            for lat, lng in points:
                await session.pause_event.wait()
                await device_session.set_location(session.udid, lat, lng)
                current = (lat, lng)
                await events.emit_position(session.udid, lat, lng, speed_mps, 0.0)
                await asyncio.sleep(tick_seconds)
            if pause_seconds > 0:
                await session.pause_event.wait()
                await asyncio.sleep(pause_seconds)
    except asyncio.CancelledError:
        pass
    except Exception:
        logger.exception("Simulation for %s stopped unexpectedly", session.udid)
    finally:
        await set_state(session.udid, SimulationState.IDLE)
        session.task = None
        session.active_path = []
        session.task_kind = None


async def _sleep_with_eta_countdown(
    session: NavigationSession,
    lat: float,
    lng: float,
    stop_idx: int,
    total_eta: float,
    sleep_duration: float,
) -> float:
    """Sleeps for sleep_duration while broadcasting updated ETA every second."""
    elapsed = 0.0
    remaining_eta = total_eta
    while elapsed < sleep_duration:
        await session.pause_event.wait()
        step = min(1.0, sleep_duration - elapsed)
        await asyncio.sleep(step)
        elapsed += step
        remaining_eta = max(0.0, remaining_eta - step)
        await events.emit_position(session.udid, lat, lng, 0.0, remaining_eta, stop_idx)
    return remaining_eta


async def _run_jump(
    session: NavigationSession,
    points: list[tuple[float, float]],
    pre_delay: float,
    post_delay: float,
) -> None:
    await set_state(session.udid, SimulationState.NAVIGATING)
    total_points = len(points)
    try:
        for idx, (lat, lng) in enumerate(points):
            remaining_stops = total_points - 1 - idx
            current_eta = remaining_stops * pre_delay + max(0, remaining_stops - 1) * post_delay

            await session.pause_event.wait()
            if pre_delay > 0:
                current_eta = await _sleep_with_eta_countdown(
                    session, lat, lng, idx + 1, current_eta + pre_delay, pre_delay
                )
            await session.pause_event.wait()
            await device_session.set_location(session.udid, lat, lng)
            await events.emit_position(session.udid, lat, lng, 0.0, current_eta, idx + 1)
            if idx < total_points - 1 and post_delay > 0:
                await session.pause_event.wait()
                current_eta = await _sleep_with_eta_countdown(
                    session, lat, lng, idx + 1, current_eta, post_delay
                )
    except asyncio.CancelledError:
        pass
    except Exception:
        logger.exception("Jump simulation for %s stopped unexpectedly", session.udid)
    finally:
        await set_state(session.udid, SimulationState.IDLE)
        session.task = None
        session.active_path = []
        session.task_kind = None


async def _run_joystick(
    session: NavigationSession,
    speed_mps: float,
    tick_seconds: float,
) -> None:
    await set_state(session.udid, SimulationState.JOYSTICK)
    try:
        while True:
            tick_start = time.monotonic()
            await session.pause_event.wait()
            inp = session.joystick_input
            if inp and inp["intensity"] > 0 and session.joystick_position is not None:
                lat, lng = session.joystick_position
                distance = speed_mps * inp["intensity"] * tick_seconds
                lat, lng = move_point(lat, lng, inp["direction"], distance)
                session.joystick_position = (lat, lng)
                await device_session.set_location(session.udid, lat, lng)
                await events.emit_position(session.udid, lat, lng, speed_mps * inp["intensity"], 0.0)
            elapsed = time.monotonic() - tick_start
            await asyncio.sleep(max(tick_seconds - elapsed, 0.0))
    except asyncio.CancelledError:
        pass
    except Exception:
        logger.exception("Joystick simulation for %s stopped unexpectedly", session.udid)
    finally:
        await set_state(session.udid, SimulationState.IDLE)
        if session.task is asyncio.current_task():
            session.task = None
