import asyncio

from core.device_ports import DiscoverySnapshot


class ControlledDiscoveryPort:
    """A discovery fake whose completion order is controlled by the test."""

    def __init__(self, snapshots: list[DiscoverySnapshot]) -> None:
        self._snapshots = list(snapshots)
        self.calls = 0
        self.started = asyncio.Event()
        self.release = asyncio.Event()

    async def discover(self) -> DiscoverySnapshot:
        self.calls += 1
        self.started.set()
        await self.release.wait()
        if not self._snapshots:
            raise AssertionError("No fake discovery snapshot remains")
        return self._snapshots.pop(0)
