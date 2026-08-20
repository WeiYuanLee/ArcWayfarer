import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from api.navigate import post_preview
from models.schemas import LatLng, NavigatePreviewRequest
from services import route_service


class RoutePreviewApiTests(unittest.IsolatedAsyncioTestCase):
    async def test_preview_returns_route_without_a_device_id(self) -> None:
        plan = route_service.RoutePlan(
            points=((25.0, 121.0), (25.01, 121.02)),
            distance_m=2450.5,
        )
        body = NavigatePreviewRequest(
            nav_mode="walk",
            start=LatLng(lat=25.0, lng=121.0),
            end=LatLng(lat=25.01, lng=121.02),
        )

        with patch.object(route_service, "fetch_route_plan", AsyncMock(return_value=plan)) as fetch:
            result = await post_preview(body)

        fetch.assert_awaited_once_with("walk", (25.0, 121.0), (25.01, 121.02))
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["distance_m"], 2450.5)
        self.assertEqual(result["route"], [
            {"lat": 25.0, "lng": 121.0},
            {"lat": 25.01, "lng": 121.02},
        ])

    async def test_preview_surfaces_routing_failure(self) -> None:
        body = NavigatePreviewRequest(
            nav_mode="drive",
            start=LatLng(lat=25.0, lng=121.0),
            end=LatLng(lat=25.01, lng=121.02),
        )

        with patch.object(route_service, "fetch_route_plan", AsyncMock(side_effect=RuntimeError("route unavailable"))):
            with self.assertRaises(HTTPException) as raised:
                await post_preview(body)

        self.assertEqual(raised.exception.status_code, 400)
        self.assertEqual(raised.exception.detail, "route unavailable")


class RouteCacheTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        route_service.clear_route_cache()
        route_service._route_inflight.clear()

    async def test_successful_route_is_reused(self) -> None:
        plan = route_service.RoutePlan(
            points=((25.0, 121.0), (25.01, 121.02)),
            distance_m=2450.5,
        )
        fetch = AsyncMock(return_value=plan)

        with patch.object(route_service, "_fetch_route_plan_uncached", fetch):
            first = await route_service.fetch_route_plan("walk", (25.0, 121.0), (25.01, 121.02))
            await asyncio.sleep(0)
            second = await route_service.fetch_route_plan("walk", (25.0, 121.0), (25.01, 121.02))

        self.assertIs(first, second)
        self.assertEqual(fetch.await_count, 1)

    async def test_failed_route_is_not_cached(self) -> None:
        plan = route_service.RoutePlan(
            points=((25.0, 121.0), (25.01, 121.02)),
            distance_m=2450.5,
        )
        fetch = AsyncMock(side_effect=[RuntimeError("temporary failure"), plan])

        with patch.object(route_service, "_fetch_route_plan_uncached", fetch):
            with self.assertRaises(RuntimeError):
                await route_service.fetch_route_plan("bike", (25.0, 121.0), (25.01, 121.02))
            await asyncio.sleep(0)
            result = await route_service.fetch_route_plan("bike", (25.0, 121.0), (25.01, 121.02))

        self.assertEqual(result, plan)
        self.assertEqual(fetch.await_count, 2)


if __name__ == "__main__":
    unittest.main()
