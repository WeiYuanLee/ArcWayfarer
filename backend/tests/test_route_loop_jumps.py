import unittest
from unittest.mock import AsyncMock, patch

from core import route_loop
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

    async def test_active_task_snapshot_keeps_per_device_loop_configuration(self) -> None:
        waypoints = [(25.0, 121.0), (25.01, 121.01)]
        playback = [waypoints[0], waypoints[1], waypoints[0]]
        with patch.object(route_loop.device_manager, "get_device", AsyncMock()), \
             patch.object(route_loop.simulation_engine, "ensure_stopped", AsyncMock()), \
             patch.object(route_loop, "_build_loop_playback", AsyncMock(return_value=(playback, frozenset(), {0: 1}, []))), \
             patch.object(route_loop.simulation_engine, "start") as start:
            await route_loop.start_route_loop(
                "device-a", "bike", waypoints, pause_enabled=True, pause_min=3, pause_max=7,
                straight_line=True, jump_leg_indices=[1], custom_speed_kmh=18,
            )

        self.assertEqual(start.call_args.args[0], "device-a")
        self.assertEqual(start.call_args.kwargs["task_kind"], "route_loop")
        self.assertEqual(start.call_args.kwargs["task_config"], {
            "waypoints": [{"lat": 25.0, "lng": 121.0}, {"lat": 25.01, "lng": 121.01}],
            "nav_mode": "bike",
            "pause_enabled": True,
            "pause_min": 3,
            "pause_max": 7,
            "straight_line": True,
            "jump_leg_indices": [1],
            "custom_speed_kmh": 18,
        })


if __name__ == "__main__":
    unittest.main()
