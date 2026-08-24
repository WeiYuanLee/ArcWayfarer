from typing import Awaitable, Callable, Optional

OnPosition = Callable[[str, Optional[float], Optional[float], float, float, Optional[int]], Awaitable[None]]
OnStateChange = Callable[[str, str], Awaitable[None]]
OnRestored = Callable[[str], Awaitable[None]]
OnFlowerProgress = Callable[[str, dict], Awaitable[None]]

on_position: Optional[OnPosition] = None
on_state_change: Optional[OnStateChange] = None
on_restored: Optional[OnRestored] = None
on_flower_progress: Optional[OnFlowerProgress] = None


async def emit_position(
    udid: str,
    lat: Optional[float],
    lng: Optional[float],
    speed_mps: float = 0.0,
    eta_seconds: float = 0.0,
    stop_index: Optional[int] = None,
) -> None:
    if on_position is not None:
        await on_position(udid, lat, lng, speed_mps, eta_seconds, stop_index)


async def emit_state_change(udid: str, state: str) -> None:
    if on_state_change is not None:
        await on_state_change(udid, state)


async def emit_restored(udid: str) -> None:
    """Notify clients that iOS accepted a request to release simulated location."""
    if on_restored is not None:
        await on_restored(udid)


async def emit_flower_progress(udid: str, progress: dict) -> None:
    if on_flower_progress is not None:
        await on_flower_progress(udid, progress)
