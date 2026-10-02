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
        on_published: Callable[[], Awaitable[None]] | None = None,
    ) -> None:
        self._discover = discover
        self._registry = registry
        self._interval_seconds = interval_seconds
        self._on_published = on_published
        self._task: asyncio.Task[None] | None = None
        self._ready = asyncio.Event()
        self._refresh_lock = asyncio.Lock()
        self._refresh_task: asyncio.Task[DiscoverySnapshot] | None = None

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
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        refresh_task, self._refresh_task = self._refresh_task, None
        if refresh_task is not None and not refresh_task.done():
            refresh_task.cancel()
            try:
                await refresh_task
            except asyncio.CancelledError:
                pass

    async def wait_ready(self, timeout: float = 15.0) -> None:
        await asyncio.wait_for(self._ready.wait(), timeout=timeout)

    async def refresh_once(self) -> DiscoverySnapshot:
        """Return one shared refresh instead of queueing duplicate scans.

        A manual refresh commonly arrives while the periodic loop is already
        discovering devices.  Serializing both callers with one broad lock
        made the manual request wait for that scan and then run a second full
        scan.  Keep the lock only around task creation and shield the shared
        work so an HTTP timeout cannot cancel discovery for every caller.
        """
        refresh_task = await self.request_refresh()
        return await asyncio.shield(refresh_task)

    async def request_refresh(self) -> asyncio.Task[DiscoverySnapshot]:
        """Start or join a refresh without waiting for its slow enrichment."""
        async with self._refresh_lock:
            if self._refresh_task is None or self._refresh_task.done():
                self._refresh_task = asyncio.create_task(self._perform_refresh())
            return self._refresh_task

    async def _perform_refresh(self) -> DiscoverySnapshot:
        snapshot = await self._discover()
        self._registry.publish_discovery(snapshot)
        if self._on_published is not None:
            await self._on_published()
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
