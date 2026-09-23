import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from core import device_manager, device_session
from core.device_session_store import DeviceSessionStore, device_session_store
from models.schemas import DeviceInfo


class AsyncContext:
    def __init__(self, value) -> None:
        self.value = value
        self.exited = 0

    async def __aenter__(self):
        return self.value

    async def __aexit__(self, *_args):
        self.exited += 1


class FailingAsyncContext(AsyncContext):
    async def __aenter__(self):
        raise ConnectionError("location channel initialization failed")


def runtime_for(device: DeviceInfo, *, rsd=None) -> device_session.DeviceSessionRuntime:
    return device_session.DeviceSessionRuntime(
        get_device=AsyncMock(return_value=device),
        get_lockdown=AsyncMock(),
        get_rsd=AsyncMock(return_value=rsd or object()),
        ensure_mounted=AsyncMock(),
        cleanup_failed_direct=AsyncMock(return_value=1),
        apply_policy_effects=AsyncMock(),
    )


class DeviceSessionBindingTests(unittest.IsolatedAsyncioTestCase):
    async def asyncTearDown(self) -> None:
        for udid in ("PHONE-WIFI", "PHONE-OLD", "PHONE-NEW"):
            session = device_session_store.pop(udid)
            if session is not None:
                await session.close()

    async def test_active_wifi_session_keeps_same_route_and_rsd_handle(self) -> None:
        udid = "PHONE-WIFI"
        rsd = object()
        device = DeviceInfo(
            udid=udid,
            name=udid,
            ios_version="18.0",
            transport="rsd",
            connection_type="wifi",
            status="ready",
            revision=4,
        )
        runtime = runtime_for(device, rsd=rsd)
        device_session.configure_session_runtime(runtime)
        dvt_context = AsyncContext(object())
        location_context = AsyncContext(AsyncMock())

        with (
            patch.object(device_session, "DvtProvider", return_value=dvt_context),
            patch.object(device_session, "LocationSimulation", return_value=location_context),
        ):
            first = await device_session.get_session(udid)
            # Discovery could now prefer USB, but an existing session must not
            # ask for a new device or transport until it is closed.
            runtime.get_device.return_value = device.model_copy(update={"connection_type": "usb"})
            second = await device_session.get_session(udid)

        self.assertIs(first, second)
        self.assertEqual(first.bound_route, "wifi")
        self.assertEqual(first.transport_identity, f"rsd:wifi:{id(rsd)}")
        runtime.get_device.assert_awaited_once_with(udid)
        runtime.get_rsd.assert_awaited_once_with(udid, "wifi")

    async def test_bound_direct_rsd_does_not_fall_back_to_system_wifi(self) -> None:
        udid = "PHONE-DIRECT"
        system_rsd = object()
        with (
            patch.object(device_manager._direct_transport_adapter, "rsd_tunnels", {}),
            patch.object(
                device_manager,
                "get_tunneld_device_by_udid",
                AsyncMock(return_value=system_rsd),
            ) as tunneld,
        ):
            with self.assertRaisesRegex(RuntimeError, "bound Wireless Direct"):
                await device_manager.get_rsd(udid, "wireless_direct")

        tunneld.assert_not_awaited()

    async def test_bound_wifi_rsd_ignores_available_direct_runtime(self) -> None:
        udid = "PHONE-WIFI"
        direct_rsd = object()
        system_rsd = object()
        with (
            patch.object(
                device_manager._direct_transport_adapter,
                "rsd_tunnels",
                {udid.lower(): SimpleNamespace(rsd=direct_rsd)},
            ),
            patch.object(
                device_manager,
                "get_tunneld_device_by_udid",
                AsyncMock(return_value=system_rsd),
            ) as tunneld,
        ):
            self.assertIs(await device_manager.get_rsd(udid, "wifi"), system_rsd)

        tunneld.assert_awaited_once_with(udid)

    async def test_late_failure_from_old_session_cannot_remove_new_handle(self) -> None:
        store = DeviceSessionStore()
        old = SimpleNamespace(udid="PHONE-OLD", bound_route="wifi", transport_identity="old", close=AsyncMock())
        new = SimpleNamespace(udid="PHONE-OLD", bound_route="usb", transport_identity="new", close=AsyncMock())
        store.register(old)
        store.register(new)

        self.assertIsNone(store.pop("phone-old", expected=old))
        self.assertIs(store.get("PHONE-OLD"), new)

    async def test_late_device_error_cannot_cleanup_new_direct_session(self) -> None:
        udid = "PHONE-NEW"
        cleanup = AsyncMock()
        old = device_session.DeviceSession(
            udid,
            "rsd",
            SimpleNamespace(set=AsyncMock(side_effect=ConnectionError("old tunnel closed"))),
            "wireless_direct",
            transport_identity="old-handle",
            cleanup_failed_direct=cleanup,
        )
        new = device_session.DeviceSession(
            udid,
            "rsd",
            SimpleNamespace(set=AsyncMock()),
            "wireless_direct",
            transport_identity="new-handle",
            cleanup_failed_direct=cleanup,
        )
        device_session_store.register(new)

        with self.assertRaises(ConnectionError):
            await old.set(25.0, 121.0)

        self.assertIs(device_session_store.get(udid), new)
        cleanup.assert_not_awaited()

    async def test_lockdown_commands_keep_the_bound_route(self) -> None:
        lockdown = AsyncMock()
        lockdown.__aenter__.return_value = lockdown
        service = AsyncMock()
        service.__aenter__.return_value = service
        lockdown.start_lockdown_developer_service.return_value = service
        get_lockdown = AsyncMock(return_value=lockdown)
        wrapper = device_session.LockdownSimulateLocationWrapper("PHONE-WIFI", "wifi", get_lockdown)

        await wrapper.set(25.0, 121.0)

        get_lockdown.assert_awaited_once_with("PHONE-WIFI", "wifi")

    async def test_partial_rsd_session_releases_dvt_context(self) -> None:
        udid = "PHONE-PARTIAL"
        device = DeviceInfo(
            udid=udid,
            name=udid,
            ios_version="18.0",
            transport="rsd",
            connection_type="wifi",
            status="ready",
        )
        device_session.configure_session_runtime(runtime_for(device))
        dvt_context = AsyncContext(object())
        location_context = FailingAsyncContext(object())

        with (
            patch.object(device_session, "DvtProvider", return_value=dvt_context),
            patch.object(device_session, "LocationSimulation", return_value=location_context),
        ):
            with self.assertRaisesRegex(ConnectionError, "initialization failed"):
                await device_session.get_session(udid)

        self.assertEqual(location_context.exited, 1)
        self.assertEqual(dvt_context.exited, 1)
        self.assertFalse(device_session_store.has(udid))


if __name__ == "__main__":
    unittest.main()
