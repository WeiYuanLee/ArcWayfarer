import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from core import device_session, events, flower, simulation_engine, teleport
from core.device_session_store import device_session_store


class LocationRestoreTests(unittest.IsolatedAsyncioTestCase):
    async def test_all_simulation_runners_write_through_device_session(self) -> None:
        writes: list[tuple[str, float, float]] = []
        joystick_write = asyncio.Event()

        async def record(udid: str, lat: float, lng: float, **_kwargs) -> None:
            writes.append((udid, lat, lng))
            if udid == "mode-joystick":
                joystick_write.set()

        async def one_leg(current):
            return ([(2.0, 2.0)], 0.0) if current is None else None

        with (
            patch.object(device_session, "set_location", side_effect=record),
            patch.object(simulation_engine, "set_state", AsyncMock()),
            patch.object(simulation_engine.events, "emit_position", AsyncMock()),
            patch.object(flower.events, "emit_position", AsyncMock()),
            patch.object(flower, "_progress", AsyncMock()),
            patch.object(flower, "NAVIGATE_TICK_SECONDS", 0),
        ):
            await simulation_engine._run(
                simulation_engine.NavigationSession("mode-route"),
                [(1.0, 1.0)],
                tick_seconds=0,
                speed_mps=1.0,
                loop=False,
                active_state=simulation_engine.SimulationState.NAVIGATING,
                station_indices=frozenset(),
                station_pause_range=(0.0, 0.0),
            )
            await simulation_engine._run_dynamic(
                simulation_engine.NavigationSession("mode-random"), one_leg, tick_seconds=0, speed_mps=1.0
            )
            await simulation_engine._run_jump(
                simulation_engine.NavigationSession("mode-jump"), [(3.0, 3.0)], pre_delay=0, post_delay=0
            )

            joystick_session = simulation_engine.NavigationSession("mode-joystick")
            joystick_session.joystick_position = (4.0, 4.0)
            joystick_session.joystick_input = {"direction": 90.0, "intensity": 1.0}
            joystick_task = asyncio.create_task(simulation_engine._run_joystick(joystick_session, 1.0, 0.01))
            await asyncio.wait_for(joystick_write.wait(), timeout=1)
            joystick_task.cancel()
            await joystick_task

            flower_session = simulation_engine.NavigationSession("mode-flower")
            flower_session.flower_skip_event = asyncio.Event()
            flower_session.flower_eta_remaining = 0.0
            await flower._move_phase(
                flower_session,
                [(5.0, 5.0)],
                speed=1.0,
                round_no=0,
                flower_no=0,
                total=1,
                phase="circle",
            )

        self.assertEqual([write[0] for write in writes], [
            "mode-route",
            "mode-random",
            "mode-jump",
            "mode-joystick",
            "mode-flower",
        ])

    async def test_direct_io_failure_releases_only_its_runtime(self) -> None:
        backend = type("Backend", (), {"set": AsyncMock(side_effect=ConnectionError("network changed"))})()
        disconnect = AsyncMock()
        session = device_session.DeviceSession(
            "device-direct",
            transport="rsd",
            backend=backend,
            bound_route="wireless_direct",
            cleanup_failed_direct=disconnect,
        )
        device_session_store.register(session)

        with self.assertRaises(ConnectionError):
            await session.set(25.0, 121.0)

        disconnect.assert_awaited_once_with("device-direct")

    async def test_system_wifi_io_failure_does_not_enable_or_clear_direct(self) -> None:
        backend = type("Backend", (), {"set": AsyncMock(side_effect=ConnectionError("wifi lost"))})()
        disconnect = AsyncMock()
        session = device_session.DeviceSession(
            "device-wifi",
            transport="rsd",
            backend=backend,
            bound_route="wifi",
            cleanup_failed_direct=disconnect,
        )
        device_session_store.register(session)

        with self.assertRaises(ConnectionError):
            await session.set(25.0, 121.0)

        disconnect.assert_not_awaited()

    async def test_usb_io_failure_does_not_enable_or_clear_direct(self) -> None:
        backend = type("Backend", (), {"set": AsyncMock(side_effect=ConnectionError("usb lost"))})()
        disconnect = AsyncMock()
        session = device_session.DeviceSession(
            "device-usb",
            transport="lockdown",
            backend=backend,
            bound_route="usb",
            cleanup_failed_direct=disconnect,
        )
        device_session_store.register(session)

        with self.assertRaises(ConnectionError):
            await session.set(25.0, 121.0)

        disconnect.assert_not_awaited()

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

    async def test_restore_broadcasts_terminal_state_position_and_confirmation(self) -> None:
        async def run_now(_udid: str, operation):
            return await operation()

        with (
            patch.object(simulation_engine, "run_exclusive", side_effect=run_now),
            patch.object(simulation_engine, "set_state", AsyncMock()) as set_state,
            patch.object(device_session, "clear_location", AsyncMock()) as clear_location,
            patch.object(events, "emit_position", AsyncMock()) as emit_position,
            patch.object(events, "emit_restored", AsyncMock()) as emit_restored,
        ):
            await teleport.clear_location("device-4")

        clear_location.assert_awaited_once_with("device-4")
        set_state.assert_awaited_once_with("device-4", simulation_engine.SimulationState.IDLE)
        emit_position.assert_awaited_once_with("device-4", None, None)
        emit_restored.assert_awaited_once_with("device-4")


if __name__ == "__main__":
    unittest.main()
