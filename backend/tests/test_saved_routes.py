import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from core import saved_routes as saved_routes_module
from models.schemas import SavedRouteCreateRequest
from pydantic import ValidationError


class SavedRouteManagerTests(unittest.TestCase):
    def test_saves_mode_coordinates_and_runtime_config(self) -> None:
        with tempfile.TemporaryDirectory() as root, patch.object(
            saved_routes_module,
            "ROUTES_FILE",
            Path(root) / "routes.json",
        ):
            manager = saved_routes_module.SavedRouteManager()
            route = manager.add(SavedRouteCreateRequest(
                name="大安森林公園",
                source_mode="multi_stop",
                waypoints=[
                    {"lat": 25.033, "lng": 121.535},
                    {"lat": 25.034, "lng": 121.536},
                ],
                runtime_config={"speed_kmh": 5, "pause_enabled": True},
            ))

            restored = saved_routes_module.SavedRouteManager().list()

        self.assertEqual(restored, [route])
        self.assertEqual(restored[0].source_mode, "multi_stop")
        self.assertEqual(restored[0].runtime_config.speed_kmh, 5)

    def test_delete_removes_route(self) -> None:
        with tempfile.TemporaryDirectory() as root, patch.object(
            saved_routes_module,
            "ROUTES_FILE",
            Path(root) / "routes.json",
        ):
            manager = saved_routes_module.SavedRouteManager()
            route = manager.add(SavedRouteCreateRequest(
                name="Loop",
                source_mode="route_loop",
                waypoints=[{"lat": 25.033, "lng": 121.535}],
            ))
            manager.delete(route.id)
            self.assertEqual(manager.list(), [])

            with self.assertRaisesRegex(ValueError, "not found"):
                manager.delete(route.id)

    def test_turbo_speed_is_saved_only_for_supported_modes(self) -> None:
        route = SavedRouteCreateRequest(
            name="Turbo loop",
            source_mode="route_loop",
            waypoints=[{"lat": 25.033, "lng": 121.535}],
            runtime_config={"speed_kmh": 1000},
        )
        self.assertEqual(route.runtime_config.speed_kmh, 1000)

        with self.assertRaises(ValidationError):
            SavedRouteCreateRequest(
                name="Too-fast flower",
                source_mode="flower",
                waypoints=[{"lat": 25.033, "lng": 121.535}],
                runtime_config={"speed_kmh": 100},
            )


if __name__ == "__main__":
    unittest.main()
