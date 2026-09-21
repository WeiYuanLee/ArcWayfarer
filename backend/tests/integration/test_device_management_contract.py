import asyncio
import unittest

from core.device_ports import DiscoverySnapshot, DiscoverySourceResult
from core.device_service import DeviceManagementService
from models.schemas import DeviceInfo
from tests.fakes.device_ports import ControlledDiscoveryPort


def _device(udid: str, connection_type: str) -> DeviceInfo:
    return DeviceInfo(
        udid=udid,
        name=udid,
        ios_version="17.4",
        transport="rsd" if connection_type != "usb" else "lockdown",
        connection_type=connection_type,
        status="ready",
    )


class DeviceManagementContractTests(unittest.IsolatedAsyncioTestCase):
    async def test_concurrent_public_reads_share_one_discovery(self) -> None:
        port = ControlledDiscoveryPort([
            DiscoverySnapshot(
                devices=(_device("PHONE-A", "usb"),),
                sources={"usb": DiscoverySourceResult("success")},
            )
        ])
        service = DeviceManagementService(port)

        first = asyncio.create_task(service.list_devices())
        await port.started.wait()
        second = asyncio.create_task(service.list_devices())
        await asyncio.sleep(0)
        self.assertEqual(port.calls, 1)

        port.release.set()
        self.assertEqual((await first)[0].udid, "PHONE-A")
        self.assertEqual((await second)[0].udid, "PHONE-A")

    async def test_public_projection_filters_wifi_and_deduplicates_udid(self) -> None:
        port = ControlledDiscoveryPort([
            DiscoverySnapshot(
                devices=(
                    _device("PHONE-A", "usb"),
                    _device("phone-a", "wifi"),
                    _device("PHONE-B", "wifi"),
                ),
                sources={
                    "usb": DiscoverySourceResult("success"),
                    "system_wifi": DiscoverySourceResult("success"),
                },
            )
        ])
        service = DeviceManagementService(port)
        port.release.set()

        devices = await service.list_devices(include_wifi=False)
        self.assertEqual([(item.udid, item.connection_type) for item in devices], [("PHONE-A", "usb")])

    async def test_source_failure_remains_distinct_from_successful_empty_scan(self) -> None:
        failed = DiscoverySnapshot(
            devices=(),
            sources={"usb": DiscoverySourceResult("failed", "service unavailable")},
        )
        port = ControlledDiscoveryPort([failed])
        service = DeviceManagementService(port)
        port.release.set()

        snapshot = await service.snapshot()
        self.assertEqual(snapshot.devices, ())
        self.assertEqual(snapshot.sources["usb"].status, "failed")
        self.assertEqual(snapshot.sources["usb"].detail, "service unavailable")


if __name__ == "__main__":
    unittest.main()
