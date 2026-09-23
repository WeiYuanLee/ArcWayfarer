import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from core.discovery.system_wifi_scanner import SystemWifiScanner
from core.discovery.usb_scanner import UsbScanner
from core.pairing_manager import PairingManager
from core.transport.direct_tcp_adapter import DirectTcpAdapter
from core.transport.system_wifi_adapter import SystemWifiTransportAdapter
from core.transport.usb_adapter import UsbTransportAdapter


class DiscoveryAdapterTests(unittest.IsolatedAsyncioTestCase):
    async def test_usb_failure_preserves_last_successful_presence(self) -> None:
        scanner = UsbScanner()
        phone = SimpleNamespace(serial="PHONE-A", connection_type="USB")
        devices, source = await scanner.scan(AsyncMock(return_value=[phone]), timeout=0.1)

        self.assertEqual(devices, [phone])
        self.assertEqual(source.status, "success")
        self.assertTrue(scanner.is_present("phone-a"))

        devices, source = await scanner.scan(AsyncMock(side_effect=OSError("AMDS stopped")), timeout=0.1)

        self.assertEqual(devices, [])
        self.assertEqual(source.status, "failed")
        self.assertTrue(scanner.is_present("PHONE-A"))
        self.assertEqual(scanner.diagnostic()["error_type"], "OSError")

    async def test_tunneld_failure_is_not_an_empty_success(self) -> None:
        scanner = SystemWifiScanner()

        self.assertEqual(await scanner.scan(lambda: ["PHONE-A"], timeout=0.1), {"PHONE-A"})
        self.assertEqual(scanner.last_result.status, "success")
        self.assertEqual(await scanner.scan(lambda: (_ for _ in ()).throw(OSError("down")), timeout=0.1), set())
        self.assertEqual(scanner.last_result.status, "failed")


class RouteTransportAdapterTests(unittest.IsolatedAsyncioTestCase):
    async def test_usb_and_wifi_lockdown_request_explicit_routes(self) -> None:
        create = AsyncMock(return_value=object())
        scanner = UsbScanner()
        await scanner.scan(
            AsyncMock(return_value=[SimpleNamespace(serial="PHONE-A", connection_type="USB")]), timeout=0.1
        )
        usb = UsbTransportAdapter(scanner, create, AsyncMock(return_value=object()))
        wifi = SystemWifiTransportAdapter(create, AsyncMock(return_value=object()))

        await usb.lockdown("PHONE-A")
        await wifi.lockdown("PHONE-A")

        self.assertEqual(create.await_args_list[0].kwargs["connection_type"], "USB")
        self.assertEqual(create.await_args_list[1].kwargs["connection_type"], "Network")

    async def test_direct_tcp_rejects_and_closes_wrong_phone(self) -> None:
        pairing = PairingManager()
        pairing.load = lambda _udid: {"HostID": "test"}
        lockdown = SimpleNamespace(paired=True, udid="PHONE-B", close=AsyncMock())
        adapter = DirectTcpAdapter(pairing, AsyncMock(return_value=lockdown))

        with self.assertRaisesRegex(ValueError, "裝置不符"):
            await adapter.connect("PHONE-A", "192.168.1.20")

        lockdown.close.assert_awaited_once_with()


if __name__ == "__main__":
    unittest.main()
