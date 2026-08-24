import unittest
from unittest.mock import AsyncMock, patch

from api import multi_stop as multi_stop_api
from models.schemas import FlowerMultiStopStartRequest, MultiStopStartRequest
from pydantic import TypeAdapter


class MultiStopModeIsolationTests(unittest.IsolatedAsyncioTestCase):
    def test_missing_mode_resolves_to_basic_request(self) -> None:
        adapter = TypeAdapter(FlowerMultiStopStartRequest | MultiStopStartRequest)
        parsed = adapter.validate_python({
            "udid": "device-1", "nav_mode": "walk",
            "waypoints": [{"lat": 25.0, "lng": 121.0}, {"lat": 25.1, "lng": 121.1}],
        })
        self.assertIs(type(parsed), MultiStopStartRequest)
        self.assertEqual(parsed.mode, "basic")

    async def test_basic_request_never_starts_flower_runner(self) -> None:
        request = MultiStopStartRequest(
            udid="device-1", nav_mode="walk",
            waypoints=[{"lat": 25.0, "lng": 121.0}, {"lat": 25.1, "lng": 121.1}],
        )
        with patch.object(multi_stop_api.multi_stop, "start_multi_stop", new=AsyncMock(return_value=([(25.0, 121.0)], []))) as basic, \
             patch.object(multi_stop_api.flower, "start_flower", new=AsyncMock()) as flower:
            await multi_stop_api.post_start(request)

        basic.assert_awaited_once()
        flower.assert_not_awaited()

    async def test_flower_request_never_starts_basic_runner(self) -> None:
        request = FlowerMultiStopStartRequest(
            udid="device-1", nav_mode="walk", mode="flower",
            waypoints=[{"lat": 25.0, "lng": 121.0}],
        )
        with patch.object(multi_stop_api.multi_stop, "start_multi_stop", new=AsyncMock()) as basic, \
             patch.object(multi_stop_api.flower, "start_flower", new=AsyncMock(return_value=[(25.0, 121.0)])) as flower:
            await multi_stop_api.post_start(request)

        flower.assert_awaited_once()
        basic.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
