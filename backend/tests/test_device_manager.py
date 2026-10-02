import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from core import device_manager, pairing_store
from core.device_ports import DiscoverySnapshot
from models.schemas import DeviceInfo


class _MuxDevice:
    def __init__(self, serial: str, connection_type: str) -> None:
        self.serial = serial
        self.connection_type = connection_type


def _device(udid: str, connection_type: str = "wifi") -> DeviceInfo:
    return DeviceInfo(
        udid=udid,
        name=udid,
        ios_version="16.0",
        transport="lockdown",
        connection_type=connection_type,
        status="ready",
    )


class DeviceManagerTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        # A finished snapshot is deliberately retained for callers that joined
        # a scan; invalidate through the public service boundary between tests.
        device_manager._device_management_service.invalidate()
        device_manager.usb_scanner.reset()
        stored_records = patch.object(pairing_store, "list_udids", return_value=[])
        stored_records.start()
        self.addCleanup(stored_records.stop)

    def test_connection_type_is_distinct_from_service_transport(self) -> None:
        self.assertEqual(device_manager._connection_type_from_mux(_MuxDevice("a", "USB")), "usb")
        self.assertEqual(device_manager._connection_type_from_mux(_MuxDevice("a", "Network")), "wifi")
        self.assertIsNone(device_manager._connection_type_from_mux(_MuxDevice("a", "other")))

    async def test_concurrent_callers_share_one_scan(self) -> None:
        started = asyncio.Event()
        release = asyncio.Event()

        async def slow_scan() -> list[DeviceInfo]:
            started.set()
            await release.wait()
            return [_device("shared")]

        with patch.object(device_manager, "_scan_devices", AsyncMock(side_effect=slow_scan)) as scan:
            first = asyncio.create_task(device_manager.list_devices())
            await started.wait()
            second = asyncio.create_task(device_manager.list_devices())
            await asyncio.sleep(0)
            self.assertEqual(scan.await_count, 1)

            release.set()
            self.assertEqual((await first)[0].udid, "shared")
            self.assertEqual((await second)[0].udid, "shared")
            self.assertEqual(scan.await_count, 1)

    async def test_started_coordinator_makes_registry_the_public_read_model(self) -> None:
        registry_device = _device("registry", "usb")
        legacy_device = _device("legacy", "usb")
        registry_snapshot = DiscoverySnapshot(devices=(registry_device,), snapshot_revision=2)
        legacy_snapshot = DiscoverySnapshot(devices=(legacy_device,), snapshot_revision=1)
        coordinator = type("Coordinator", (), {
            "started": True,
            "wait_ready": AsyncMock(),
        })()

        with (
            patch.object(device_manager, "_device_discovery_coordinator", coordinator),
            patch.object(device_manager.device_registry, "projected_snapshot", return_value=registry_snapshot),
            patch.object(device_manager._device_management_service, "projected_snapshot", AsyncMock(return_value=legacy_snapshot)),
            patch.object(device_manager._device_management_service, "list_devices", AsyncMock(return_value=[legacy_device])),
        ):
            self.assertEqual((await device_manager.get_device_snapshot()).devices[0].udid, "registry")
            self.assertEqual((await device_manager.list_devices())[0].udid, "registry")
            self.assertEqual((await device_manager.get_device("REGISTRY")).udid, "registry")

    async def test_get_device_read_does_not_close_direct_runtime(self) -> None:
        """D7: public device reads cannot release a transport."""
        udid = "A1B2C3D4"
        direct = _device(udid, "wireless_direct")
        tunnel = type("Tunnel", (), {"rsd": object()})()
        with (
            patch.object(device_manager._direct_transport_adapter, "rsd_devices", {udid.lower(): direct}),
            patch.object(device_manager._direct_transport_adapter, "rsd_tunnels", {udid.lower(): tunnel}),
            patch.object(device_manager._direct_transport_adapter, "addresses", {udid.lower(): "192.168.1.20"}),
            patch.object(device_manager, "_list_tunnel_udids", AsyncMock(return_value=set())),
            patch.object(device_manager, "usbmux_list_devices", AsyncMock(return_value=[])),
            patch.object(device_manager._direct_transport_adapter, "clear_runtime", AsyncMock()) as clear,
        ):
            device_manager._device_management_service.invalidate()
            found = await device_manager.get_device(udid)

        self.assertEqual(found.connection_type, "wireless_direct")
        clear.assert_not_awaited()

    async def test_usb_is_preferred_and_connection_type_is_retained(self) -> None:
        described: list[tuple[str, str]] = []

        async def describe(udid: str, connection_type: str, tunnel_udids: set[str]) -> DeviceInfo:
            described.append((udid, connection_type))
            return _device(udid, connection_type)

        with (
            patch.object(
                device_manager,
                "usbmux_list_devices",
                AsyncMock(return_value=[_MuxDevice("same", "Network"), _MuxDevice("same", "USB")]),
            ),
            patch.object(device_manager, "_describe_device", AsyncMock(side_effect=describe)),
            patch.object(device_manager, "_list_tunnel_udids", AsyncMock(return_value=set())),
        ):
            devices = await device_manager._scan_devices()

        self.assertEqual(described, [("same", "usb")])
        self.assertEqual(devices[0].connection_type, "usb")

    async def test_device_descriptions_run_concurrently(self) -> None:
        both_started = asyncio.Event()
        started: set[str] = set()

        async def describe(udid: str, connection_type: str, _tunnels: set[str]) -> DeviceInfo:
            started.add(udid)
            if len(started) == 2:
                both_started.set()
            await asyncio.wait_for(both_started.wait(), timeout=0.1)
            return _device(udid, connection_type)

        with (
            patch.object(device_manager, "usbmux_list_devices", AsyncMock(return_value=[
                _MuxDevice("one", "USB"), _MuxDevice("two", "USB"),
            ])),
            patch.object(device_manager, "_describe_device", AsyncMock(side_effect=describe)),
            patch.object(device_manager, "_list_tunnel_udids", AsyncMock(return_value=set())),
        ):
            devices = await device_manager._scan_devices()

        self.assertEqual([item.udid for item in devices], ["one", "two"])

    async def test_usb_only_result_excludes_known_wifi_devices(self) -> None:
        with patch.object(
            device_manager,
            "_scan_devices",
            AsyncMock(return_value=[_device("usb", "usb"), _device("wifi", "wifi"), _device("rsd", "wifi")]),
        ):
            devices = await device_manager.list_devices(include_wifi=False)

        self.assertEqual([device.udid for device in devices], ["usb"])

    async def test_tunneld_only_device_without_physical_route_is_not_rendered(self) -> None:
        with (
            patch.object(device_manager, "usbmux_list_devices", AsyncMock(return_value=[])),
            patch.object(device_manager, "_list_tunnel_udids", AsyncMock(return_value={"wifi-rsd"})),
        ):
            devices = await device_manager._scan_devices()

        self.assertEqual(devices, [])

    async def test_unrecognized_mux_transport_is_not_rendered(self) -> None:
        with (
            patch.object(device_manager, "usbmux_list_devices", AsyncMock(return_value=[_MuxDevice("mystery", "Bluetooth")])),
            patch.object(device_manager, "_list_tunnel_udids", AsyncMock(return_value=set())),
        ):
            self.assertEqual(await device_manager._scan_devices(), [])

    async def test_usbmux_event_publishes_usb_placeholder_before_enrichment(self) -> None:
        publish = Mock(return_value=True)
        with (
            patch.object(device_manager.device_registry, "get", return_value=None),
            patch.object(device_manager.device_registry, "publish_usb_presence", publish),
            patch.object(device_manager, "_after_discovery_published", AsyncMock()) as after_publish,
            patch.object(device_manager._device_discovery_coordinator, "request_refresh", AsyncMock()) as enrich,
        ):
            await device_manager._publish_usbmux_presence((
                _MuxDevice("usb-phone", "USB"),
                _MuxDevice("wifi-phone", "Network"),
            ))

        rows = publish.call_args.args[0]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].udid, "usb-phone")
        self.assertEqual(rows[0].status, "discovering")
        after_publish.assert_awaited_once()
        enrich.assert_awaited_once()

    async def test_manual_refresh_returns_after_fast_presence_and_only_schedules_enrichment(self) -> None:
        monitor = SimpleNamespace(started=True, refresh=AsyncMock())
        coordinator = SimpleNamespace(started=True, request_refresh=AsyncMock())
        with (
            patch.object(device_manager, "_usbmux_event_monitor", monitor),
            patch.object(device_manager, "_device_discovery_coordinator", coordinator),
        ):
            await device_manager.refresh_device_discovery()

        monitor.refresh.assert_awaited_once()
        coordinator.request_refresh.assert_awaited_once()

    async def test_usb_discovery_never_triggers_pairing(self) -> None:
        lockdown = SimpleNamespace(
            all_values={"DeviceName": "New iPhone"}, product_version="18.0",
            paired=False,
        )
        create = AsyncMock(return_value=lockdown)
        with (
            patch.object(device_manager, "create_using_usbmux", create),
            patch.object(pairing_store, "exists", return_value=False),
        ):
            found = await device_manager._describe_device("PHONE-A", "usb", set())

        create.assert_awaited_once_with(
            serial="PHONE-A", connection_type="USB", autopair=False,
            pair_timeout=None,
        )
        self.assertFalse(found.trusted)
        self.assertEqual(found.status, "error")
        self.assertIn("首次設定", found.detail)

    async def test_network_discovery_never_triggers_pairing(self) -> None:
        lockdown = SimpleNamespace(
            all_values={"DeviceName": "Wi-Fi iPhone"}, product_version="16.7",
            paired=True,
        )
        create = AsyncMock(return_value=lockdown)
        with (
            patch.object(device_manager, "create_using_usbmux", create),
            patch.object(pairing_store, "exists", return_value=True),
        ):
            found = await device_manager._describe_device("PHONE-A", "wifi", set())

        create.assert_awaited_once_with(
            serial="PHONE-A", connection_type="Network", autopair=False,
            pair_timeout=None,
        )
        self.assertEqual(found.connection_type, "wifi")
        self.assertTrue(found.trusted)

    async def test_explicit_setup_triggers_trust_and_checks_developer_mode(self) -> None:
        class Lockdown:
            paired = True
            udid = "PHONE-A"
            product_version = "18.0"
            get_developer_mode_status = AsyncMock(return_value=False)

            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

        create = AsyncMock(return_value=Lockdown())
        with patch.object(device_manager, "create_using_usbmux", create):
            result = await device_manager.trust_usb_device("PHONE-A")

        create.assert_awaited_once_with(
            serial="PHONE-A", connection_type="USB", autopair=True,
            pair_timeout=device_manager.USB_PAIRING_TIMEOUT_SECONDS,
        )
        self.assertTrue(result["developer_mode_required"])
        self.assertFalse(result["developer_mode_enabled"])

    async def test_developer_mode_reveal_uses_trusted_usb_without_rsd(self) -> None:
        class Lockdown:
            paired = True
            udid = "PHONE-A"
            product_version = "18.0"
            get_developer_mode_status = AsyncMock(return_value=False)

            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

        create = AsyncMock(return_value=Lockdown())
        reveal = AsyncMock()
        amfi = SimpleNamespace(reveal_developer_mode_option_in_ui=reveal)
        with (
            patch.object(device_manager, "create_using_usbmux", create),
            patch("pymobiledevice3.services.amfi.AmfiService", return_value=amfi),
        ):
            await device_manager.reveal_developer_mode("PHONE-A")

        create.assert_awaited_once_with(
            serial="PHONE-A", connection_type="USB", autopair=False,
        )
        reveal.assert_awaited_once()

    async def test_usb_discovery_failure_keeps_a_support_diagnostic(self) -> None:
        with (
            patch.object(device_manager, "usbmux_list_devices", AsyncMock(side_effect=OSError("AMDevice service unavailable"))),
            patch.object(device_manager, "_list_tunnel_udids", AsyncMock(return_value=set())),
        ):
            devices = await device_manager._scan_devices()

        self.assertEqual(devices, [])
        diagnostic = device_manager.get_usb_discovery_diagnostic()
        self.assertIsNotNone(diagnostic)
        assert diagnostic is not None
        self.assertEqual(diagnostic["code"], "usb_discovery_failed")
        self.assertEqual(diagnostic["error_type"], "OSError")
        self.assertIn("AMDevice service unavailable", diagnostic["message"])

    async def test_tunneld_failure_is_reported_as_failed_source(self) -> None:
        with (
            patch.object(device_manager, "_list_tunnels", side_effect=OSError("tunneld unavailable")),
            patch.object(device_manager, "usbmux_list_devices", AsyncMock(return_value=[])),
        ):
            snapshot = await device_manager._legacy_discovery_snapshot()

        self.assertEqual(snapshot.devices, ())
        self.assertEqual(snapshot.sources["system_wifi"].status, "failed")
        self.assertIn("OSError", snapshot.sources["system_wifi"].detail)

    async def test_describe_failure_falls_back_to_rsd_when_tunnel_exists(self) -> None:
        with (
            patch.object(
                device_manager,
                "usbmux_list_devices",
                AsyncMock(return_value=[_MuxDevice("wifi-device-1", "Network")]),
            ),
            patch.object(
                device_manager,
                "_describe_device",
                AsyncMock(side_effect=RuntimeError("Lockdown handshake failed over Wi-Fi")),
            ),
            patch.object(
                device_manager,
                "_list_tunnel_udids",
                AsyncMock(return_value={"wifi-device-1"}),
            ),
        ):
            devices = await device_manager._scan_devices()

        self.assertEqual(len(devices), 1)
        self.assertEqual(devices[0].udid, "wifi-device-1")
        self.assertEqual(devices[0].transport, "rsd")
        self.assertEqual(devices[0].connection_type, "wifi")
        self.assertEqual(devices[0].status, "ready")

    async def test_get_device_matches_udid_case_insensitively(self) -> None:
        mock_device = _device("AbCd-EfGh-1234", "wifi")
        with patch.object(device_manager, "list_devices", AsyncMock(return_value=[mock_device])):
            found_lower = await device_manager.get_device("abcd-efgh-1234")
            found_upper = await device_manager.get_device("ABCD-EFGH-1234")
            self.assertEqual(found_lower.udid, "AbCd-EfGh-1234")
            self.assertEqual(found_upper.udid, "AbCd-EfGh-1234")

            with self.assertRaises(ValueError):
                await device_manager.get_device("non-existent-device")


if __name__ == "__main__":
    unittest.main()
