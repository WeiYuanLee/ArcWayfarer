import unittest
from unittest.mock import AsyncMock, patch

from core.route_loop import _build_loop_playback
from services import route_service


class RouteLoopJumpTests(unittest.IsolatedAsyncioTestCase):
    async def test_jump_legs_skip_routing_and_only_emit_the_destination(self) -> None:
        waypoints = [(25.0, 121.0), (25.0, 121.001), (25.01, 121.0), (25.01, 121.001)]

        async def route(_mode: str, start: tuple[float, float], end: tuple[float, float]) -> list[tuple[float, float]]:
            return [start, end]

        with patch.object(route_service, "fetch_route", AsyncMock(side_effect=route)) as fetch:
            _, _, _, legs = await _build_loop_playback(
                "walk", waypoints, speed_mps=2, tick_seconds=1, jump_leg_indices=frozenset({1, 3})
            )

        self.assertEqual(fetch.await_count, 2)
        self.assertEqual(legs[1], [waypoints[2]])
        self.assertEqual(legs[3], [waypoints[0]])


if __name__ == "__main__":
    unittest.main()
