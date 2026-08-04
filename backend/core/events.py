from typing import Awaitable, Callable, Optional

OnPosition = Callable[[str, Optional[float], Optional[float], float, float, Optional[int]], Awaitable[None]]
OnStateChange = Callable[[str, str], Awaitable[None]]

on_position: Optional[OnPosition] = None
on_state_change: Optional[OnStateChange] = None


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
