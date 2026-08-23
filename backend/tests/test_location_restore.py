import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from core import device_session, simulation_engine


class LocationRestoreTests(unittest.IsolatedAsyncioTestCase):
    async def test_clear_flushes_the_stop_command_before_closing_its_session(self) -> None:
        session = type("Session", (), {"clear": AsyncMock()})()

        with (
            patch.object(device_session, "get_session", AsyncMock(return_value=session)),
            patch.object(device_session, "close_session", AsyncMock()) as close,
            patch.object(device_session.asyncio, "sleep", AsyncMock()) as sleep,
        ):
            await device_session.clear_location("device-1")

        session.clear.assert_awaited_once_with()
        self.assertEqual(sleep.await_count, 1)
        self.assertEqual(close.await_count, 1)
        close.assert_awaited_once_with("device-1")

    async def test_time_sensitive_clear_can_skip_the_map_refresh_wait(self) -> None:
        session = type("Session", (), {"clear": AsyncMock()})()

        with (
            patch.object(device_session, "get_session", AsyncMock(return_value=session)),
            patch.object(device_session, "close_session", AsyncMock()) as close,
            patch.object(device_session.asyncio, "sleep", AsyncMock()) as sleep,
        ):
            await device_session.clear_location("device-1", settle_seconds=0, delivery_attempts=1)

        session.clear.assert_awaited_once_with()
        sleep.assert_not_awaited()
        close.assert_awaited_once_with("device-1")

    async def test_exclusive_operation_waits_for_cancelled_navigation_task(self) -> None:
        udid = "device-2"
        simulation_engine._sessions.pop(udid, None)
        session = simulation_engine.get_navigation_session(udid)
        started = asyncio.Event()
        finished = asyncio.Event()

        async def running_route() -> None:
            started.set()
            try:
                await asyncio.sleep(60)
            finally:
                finished.set()

        task = asyncio.create_task(running_route())
        session.task = task
        await started.wait()

        observed = []

        async def restore() -> None:
            observed.append(finished.is_set())

        await simulation_engine.run_exclusive(udid, restore)

        self.assertTrue(task.done())
        self.assertEqual(observed, [True])
        simulation_engine._sessions.pop(udid, None)

    async def test_restore_invalidates_a_route_start_queued_before_it(self) -> None:
        udid = "device-3"
        simulation_engine._sessions.pop(udid, None)
        simulation_engine.start(udid, [(25.0, 121.0)], 1.0, 1.0)

        await simulation_engine.run_exclusive(udid, AsyncMock())
        await asyncio.sleep(0)

        self.assertFalse(simulation_engine.is_running(udid))
        simulation_engine._sessions.pop(udid, None)


if __name__ == "__main__":
    unittest.main()
