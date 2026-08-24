import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from core import device_manager
from models.schemas import DeviceInfo


class _MuxDevice:
    def __init__(self, serial: str, connection_type: str) -> None:
        self.serial = serial
        self.connection_type = connection_type


def _device(udid: str, connection_type: str = "unknown") -> DeviceInfo:
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
        # A finished task is deliberately retained for callers that joined a
        # scan; reset it here so each test starts a new discovery operation.
        device_manager._device_scan_task = None
        device_manager._last_usb_discovery_diagnostic = None

    def test_connection_type_is_distinct_from_service_transport(self) -> None:
        self.assertEqual(device_manager._connection_type_from_mux(_MuxDevice("a", "USB")), "usb")
        self.assertEqual(device_manager._connection_type_from_mux(_MuxDevice("a", "Network")), "wifi")
        self.assertEqual(device_manager._connection_type_from_mux(_MuxDevice("a", "other")), "unknown")

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

    async def test_usb_only_result_excludes_known_wifi_devices(self) -> None:
        with patch.object(
            device_manager,
            "_scan_devices",
            AsyncMock(return_value=[_device("usb", "usb"), _device("wifi", "wifi"), _device("rsd")]),
        ):
            devices = await device_manager.list_devices(include_wifi=False)

        self.assertEqual([device.udid for device in devices], ["usb", "rsd"])

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
