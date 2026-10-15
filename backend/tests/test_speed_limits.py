import unittest

from models.schemas import (
    FlowerMultiStopStartRequest,
    JoystickStartRequest,
    MultiStopStartRequest,
    NavigateStartRequest,
    RandomWalkStartRequest,
    RouteLoopStartRequest,
)
from pydantic import ValidationError


class SpeedLimitTests(unittest.TestCase):
    two_points = [{"lat": 25.0, "lng": 121.0}, {"lat": 25.1, "lng": 121.1}]

    def test_turbo_is_accepted_by_route_loop_and_basic_multi_stop(self) -> None:
        loop = RouteLoopStartRequest(
            udid="device-1", nav_mode="drive", waypoints=self.two_points, custom_speed_kmh=1000,
        )
        patrol = MultiStopStartRequest(
            udid="device-1", nav_mode="drive", waypoints=self.two_points, custom_speed_kmh=1000,
        )
        self.assertEqual(loop.custom_speed_kmh, 1000)
        self.assertEqual(patrol.custom_speed_kmh, 1000)

    def test_turbo_is_rejected_by_other_movement_modes(self) -> None:
        unsupported_requests = [
            lambda: NavigateStartRequest(
                udid="device-1", nav_mode="drive", start=self.two_points[0], end=self.two_points[1],
                custom_speed_kmh=100,
            ),
            lambda: RandomWalkStartRequest(
                udid="device-1", nav_mode="drive", center=self.two_points[0], radius_m=100,
                custom_speed_kmh=100,
            ),
            lambda: JoystickStartRequest(
                udid="device-1", nav_mode="drive", lat=25.0, lng=121.0, custom_speed_kmh=100,
            ),
            lambda: FlowerMultiStopStartRequest(
                udid="device-1", nav_mode="walk", mode="flower", waypoints=[self.two_points[0]],
                custom_speed_kmh=100,
            ),
        ]
        for create_request in unsupported_requests:
            with self.subTest(create_request=create_request), self.assertRaises(ValidationError):
                create_request()


if __name__ == "__main__":
    unittest.main()
