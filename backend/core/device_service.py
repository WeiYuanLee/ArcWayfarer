"""Public, side-effect-free read service for device discovery."""

import asyncio

from core.device_ports import DeviceDiscoveryPort, DiscoverySnapshot
from models.schemas import DeviceInfo


class DeviceManagementService:
    """Coordinate discovery reads while keeping transport ownership elsewhere."""

    def __init__(self, discovery: DeviceDiscoveryPort) -> None:
        self._discovery = discovery
        self._scan_lock = asyncio.Lock()
        self._scan_task: asyncio.Task[DiscoverySnapshot] | None = None

    def invalidate(self) -> None:
        """Make the next caller start a fresh scan without cancelling readers."""
        self._scan_task = None

    async def snapshot(self) -> DiscoverySnapshot:
        async with self._scan_lock:
            if self._scan_task is None or self._scan_task.done():
                self._scan_task = asyncio.create_task(self._discovery.discover())
            scan_task = self._scan_task

        # One cancelled HTTP request must not cancel discovery shared by other
        # callers.  Command-triggered invalidation also leaves current readers
        # alive; revision ordering will be added in P1-C.
        return await asyncio.shield(scan_task)

    async def list_devices(self, include_wifi: bool = True) -> list[DeviceInfo]:
        snapshot = await self.snapshot()
        devices = snapshot.devices if include_wifi else tuple(
            device for device in snapshot.devices if device.connection_type != "wifi"
        )

        # The public list contract exposes one selected row per UDID.  Preserve
        # discovery order because the legacy adapter already applies routing
        # priority before producing its immutable snapshot.
        unique: list[DeviceInfo] = []
        seen: set[str] = set()
        for device in devices:
            key = device.udid.lower()
            if key in seen:
                continue
            seen.add(key)
            unique.append(device)
        return unique

    async def get_device(self, udid: str) -> DeviceInfo:
        for device in await self.list_devices(include_wifi=True):
            if device.udid.lower() == udid.lower():
                return device
        raise ValueError(f"Device not found: {udid}")
