"""Background discovery publisher kept separate from HTTP read paths."""

import asyncio
import logging
from collections.abc import Awaitable, Callable

from core.device_ports import DiscoverySnapshot
from core.device_registry import DeviceRegistry

logger = logging.getLogger(__name__)


class DeviceDiscoveryCoordinator:
    def __init__(
        self,
        discover: Callable[[], Awaitable[DiscoverySnapshot]],
        registry: DeviceRegistry,
        *,
        interval_seconds: float = 5.0,
    ) -> None:
        self._discover = discover
        self._registry = registry
        self._interval_seconds = interval_seconds
        self._task: asyncio.Task[None] | None = None
        self._ready = asyncio.Event()
        self._refresh_lock = asyncio.Lock()

    @property
    def started(self) -> bool:
        return self._task is not None and not self._task.done()

    async def start(self) -> None:
        if self.started:
            return
        self._ready.clear()
        self._task = asyncio.create_task(self._run(), name="device-discovery-coordinator")

    async def stop(self) -> None:
        task, self._task = self._task, None
        if task is None:
            return
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    async def wait_ready(self, timeout: float = 15.0) -> None:
        await asyncio.wait_for(self._ready.wait(), timeout=timeout)

    async def refresh_once(self) -> DiscoverySnapshot:
        async with self._refresh_lock:
            snapshot = await self._discover()
            self._registry.publish_discovery(snapshot)
            self._ready.set()
            return snapshot

    async def _run(self) -> None:
        while True:
            try:
                await self.refresh_once()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Background device discovery failed")
                self._ready.set()
            await asyncio.sleep(self._interval_seconds)
