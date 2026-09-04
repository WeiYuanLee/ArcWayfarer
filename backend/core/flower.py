"""Flower-mode runner, deliberately isolated from the legacy multi-stop playback."""
import asyncio
import itertools
import logging
from typing import Optional

from config import NAV_MODE_SPEED_MPS, NAVIGATE_TICK_SECONDS
from core import device_manager, device_session, events, simulation_engine
from core.flower_geometry import flower_perimeter_path, flower_spiral_path, offset_coordinate
from models.schemas import FlowerOptions, NavMode
from services import route_service
from services.interpolator import interpolate

logger = logging.getLogger(__name__)
_flower_sessions: set[str] = set()


def _playback_seconds(points: list[tuple[float, float]], speed: float) -> float:
    """Match the runner's tick-based duration, including the final position tick."""
    return len(interpolate(points, speed, NAVIGATE_TICK_SECONDS) or points) * NAVIGATE_TICK_SECONDS


def _circle_seconds(geometry: list[tuple[float, float]], speed: float) -> float:
    # The approach point is emitted by the preceding leg, so the circle runner
    # deliberately omits its duplicate first tick.
    playback = interpolate([geometry[0], *geometry[1:]], speed, NAVIGATE_TICK_SECONDS) or geometry
    return max(0, len(playback) - 1) * NAVIGATE_TICK_SECONDS


def _estimate_seconds(
    flowers: list[tuple[float, float]], options: FlowerOptions, speed: float, *,
    rounds: int, jump_mode: bool, initial_position: tuple[float, float] | None = None,
    seed_prefix: str = "estimate",
) -> float:
    """Estimate finite Flower playback using the same generated geometry as the runner.

    Inter-flower legs deliberately use straight-line playback here.  Road routes
    are fetched lazily while the run is active, so this is an estimate rather
    than a promise; flower circles and waits are exact tick-for-tick.
    """
    total = 0.0
    staging = offset_coordinate(flowers[0], 50.0, 0.0)
    previous = initial_position
    first = True
    for round_no in range(rounds):
        for flower_no, center in enumerate(flowers):
            geometry = _flower_geometry(center, options, f"{seed_prefix}:{flower_no}:{round_no}")
            approach = center if options.path_strategy == "center_spiral" else geometry[0]
            if first:
                total += _playback_seconds([previous or staging, approach], speed)
                first = False
            elif jump_mode:
                total += NAVIGATE_TICK_SECONDS
            elif previous is not None:
                total += _playback_seconds([previous, approach], speed)
            total += options.pre_wait_seconds + _circle_seconds([approach, *geometry[1:]], speed) + options.post_wait_seconds
            previous = geometry[-1]
        if options.route_type == "return_to_start":
            first_geometry = _flower_geometry(flowers[0], options, f"{seed_prefix}:0:{round_no}")
            first_entry = first_geometry[1] if len(first_geometry) > 1 else first_geometry[0]
            total += NAVIGATE_TICK_SECONDS if jump_mode else _playback_seconds([previous or first_entry, first_entry], speed)
    return total


def _flower_geometry(center: tuple[float, float], options: FlowerOptions, seed: str) -> list[tuple[float, float]]:
    if options.path_strategy == "perimeter":
        return flower_perimeter_path(center, options.radius_m, options.circles, options.segments)
    return flower_spiral_path(
        center,
        options.radius_m,
        options.circles,
        options.segments,
        inner_radius_m=options.inner_radius_m,
        jitter_m=options.jitter_m,
        seed=seed,
    )


async def _route(nav_mode: NavMode, start, end, speed: float, straight: bool) -> list[tuple[float, float]]:
    if straight:
        raw = [start, end]
    else:
        try:
            raw = await route_service.fetch_route(nav_mode, start, end)
        except Exception:
            raw = [start, end]
    return interpolate(raw, speed, NAVIGATE_TICK_SECONDS) or [start, end]


async def start_flower(udid: str, nav_mode: NavMode, flowers: list[tuple[float, float]], options: FlowerOptions,
                       straight_line: bool = False, jump_mode: bool = False,
                       custom_speed_kmh: Optional[float] = None) -> list[tuple[float, float]]:
    if not flowers:
        raise RuntimeError("Flower mode needs at least 1 flower.")
    await device_manager.get_device(udid)
    await simulation_engine.ensure_stopped(udid)
    speed = custom_speed_kmh / 3.6 if custom_speed_kmh else NAV_MODE_SPEED_MPS[nav_mode]
    session = simulation_engine.get_navigation_session(udid)
    session.flower_skip_event = asyncio.Event()
    expected = session.command_generation
    # A finite route counts down to the end of the whole itinerary. Infinite
    # mode instead presents the remaining time in the current circuit.
    finite_rounds = options.rounds if isinstance(options.rounds, int) else 1
    session.flower_eta_scope = "round" if options.route_type == "loop_forever" else "total"
    estimated_rounds = finite_rounds if options.route_type == "return_to_start" else 1
    session.flower_eta_remaining = _estimate_seconds(
        flowers, options, speed, rounds=1 if session.flower_eta_scope == "round" else estimated_rounds,
        jump_mode=jump_mode, seed_prefix=f"{udid}:{expected}",
    )
    _flower_sessions.add(udid)
    # Return a useful preview immediately; route execution is generated by the runner.
    staging = offset_coordinate(flowers[0], 50.0, 0.0)
    preview = [staging]
    for flower_no, flower in enumerate(flowers):
        preview.extend(_flower_geometry(flower, options, f"{udid}:{expected}:{flower_no}:0"))
    session.active_path = preview
    session.task_kind = "flower"
    async def run() -> None:
        await simulation_engine.set_state(udid, simulation_engine.SimulationState.NAVIGATING)
        try:
            rounds = range(finite_rounds) if options.route_type != "loop_forever" else itertools.count()
            round_no = 0
            first = True
            last_position: tuple[float, float] | None = None
            for round_no in rounds:
                if round_no and options.route_type == "loop_forever":
                    # Subsequent infinite circuits do not repeat the 50m staging leg.
                    session.flower_eta_remaining = _estimate_seconds(
                        flowers, options, speed, rounds=1, jump_mode=jump_mode,
                        initial_position=last_position, seed_prefix=f"{udid}:{expected}",
                    )
                for flower_no, center in enumerate(flowers):
                    session.flower_skip_event.clear()
                    geometry = _flower_geometry(center, options, f"{udid}:{expected}:{flower_no}:{round_no}")
                    approach_point = center if options.path_strategy == "center_spiral" else geometry[0]
                    if first:
                        start = staging
                        first = False
                        await _move_phase(session, await _route(nav_mode, start, approach_point, speed, straight_line), speed,
                                          round_no, flower_no, len(flowers), "approach")
                    else:
                        previous = last_position or approach_point
                        travel = [approach_point] if jump_mode else await _route(nav_mode, previous, approach_point, speed, straight_line)
                        await _move_phase(session, travel, speed,
                                          round_no, flower_no, len(flowers), "approach")
                    if await _wait_phase(session, options.pre_wait_seconds, round_no, flower_no, len(flowers), "pre_wait"):
                        continue
                    # `approach_point` has already been emitted.  Keep it as the
                    # interpolation origin, then omit that duplicate first tick.
                    # This is important for the center → outer-ring leg: without
                    # it, the first perimeter vertex would be a visible teleport.
                    circle_geometry = [approach_point, *geometry[1:]]
                    circle_playback = interpolate(circle_geometry, speed, NAVIGATE_TICK_SECONDS) or circle_geometry
                    circle_playback = circle_playback[1:]
                    await _move_phase(session, circle_playback, speed, round_no, flower_no, len(flowers), "circle")
                    last_position = geometry[-1]
                    if await _wait_phase(session, options.post_wait_seconds, round_no, flower_no, len(flowers), "post_wait"):
                        continue
                if options.route_type == "return_to_start":
                    # A finite itinerary explicitly ends at its first flower.
                    # The 50m staging point is never repeated.
                    first_geometry = _flower_geometry(flowers[0], options, f"{udid}:{expected}:0:{round_no}")
                    first_entry = first_geometry[1] if len(first_geometry) > 1 else first_geometry[0]
                    travel = [first_entry] if jump_mode else await _route(nav_mode, last_position or first_entry, first_entry, speed, straight_line)
                    await _move_phase(session, travel, speed,
                                      round_no, 0, len(flowers), "returning")
                    if round_no == finite_rounds - 1:
                        break
                    continue
                if options.route_type != "loop_forever":
                    break
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.exception("Flower simulation for %s stopped unexpectedly", udid)
        finally:
            _flower_sessions.discard(udid)
            session.flower_eta_remaining = 0.0
            await simulation_engine.set_state(udid, simulation_engine.SimulationState.IDLE)
            if session.task is asyncio.current_task():
                session.task = None
            session.active_path = []
            session.task_kind = None
    session.task = asyncio.create_task(run())
    return preview


async def _progress(udid, flower_no, total, round_no, phase, arc=0.0, position=None):
    payload = {"flower_index": flower_no + 1, "flower_total": total,
        "round": round_no + 1, "phase": phase, "arc_progress": arc,
        "eta_seconds": max(0.0, getattr(simulation_engine.get_navigation_session(udid), "flower_eta_remaining", 0.0)),
        "eta_scope": getattr(simulation_engine.get_navigation_session(udid), "flower_eta_scope", "total")}
    if position is not None:
        payload.update({"lat": position[0], "lng": position[1]})
    await events.emit_flower_progress(udid, payload)


async def _move_phase(session, points, speed, round_no, flower_no, total, phase):
    for i, (lat, lng) in enumerate(points):
        await session.pause_event.wait()
        if session.flower_skip_event.is_set():
            return
        await device_session.set_location(session.udid, lat, lng)
        # Keep the standard live-position channel in sync so the map marker
        # follows Flower movement as it does for every other navigation mode.
        await events.emit_position(session.udid, lat, lng, speed, 0.0, flower_no + 1)
        await _progress(
            session.udid, flower_no, total, round_no, phase,
            i / max(1, len(points) - 1), position=(lat, lng),
        )
        await asyncio.sleep(NAVIGATE_TICK_SECONDS)
        session.flower_eta_remaining = max(0.0, session.flower_eta_remaining - NAVIGATE_TICK_SECONDS)


async def _wait_phase(session, duration, round_no, flower_no, total, phase) -> bool:
    if duration <= 0:
        return session.flower_skip_event.is_set()
    await _progress(session.udid, flower_no, total, round_no, phase)
    try:
        await asyncio.wait_for(session.flower_skip_event.wait(), timeout=duration)
        return True
    except asyncio.TimeoutError:
        session.flower_eta_remaining = max(0.0, session.flower_eta_remaining - duration)
        return False


def is_flower(udid: str) -> bool:
    return udid in _flower_sessions


def skip_flower(udid: str) -> bool:
    session = simulation_engine.get_navigation_session(udid)
    event = getattr(session, "flower_skip_event", None)
    if not is_flower(udid) or event is None:
        return False
    event.set()
    return True
