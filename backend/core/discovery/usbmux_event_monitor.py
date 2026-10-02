"""Resilient usbmux attach/detach observer with polling-compatible callbacks."""

import asyncio
import logging
from collections.abc import Awaitable, Callable

from pymobiledevice3.usbmux import create_mux, list_devices

logger = logging.getLogger(__name__)
PRESENCE_REFRESH_TIMEOUT_SECONDS = 1.0


class UsbmuxEventMonitor:
    def __init__(
        self,
        on_devices: Callable[[tuple[object, ...]], Awaitable[None]],
        *,
        reconnect_seconds: float = 1.0,
    ) -> None:
        self._on_devices = on_devices
        self._reconnect_seconds = reconnect_seconds
        self._task: asyncio.Task[None] | None = None

    @property
    def started(self) -> bool:
        return self._task is not None and not self._task.done()

    async def start(self) -> None:
        if self.started:
            return
        # Seed the Registry before opening the long-lived listener. The
        # periodic coordinator remains the fallback if either operation fails.
        try:
            await self.refresh()
        except Exception:  # noqa: BLE001 - coordinator polling remains active
            logger.exception("Initial usbmux presence refresh failed")
        self._task = asyncio.create_task(self._run(), name="usbmux-event-monitor")

    async def stop(self) -> None:
        task, self._task = self._task, None
        if task is None:
            return
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    async def refresh(self) -> None:
        devices = await asyncio.wait_for(
            list_devices(), timeout=PRESENCE_REFRESH_TIMEOUT_SECONDS,
        )
        await self._on_devices(tuple(devices))

    async def _run(self) -> None:
        while True:
            try:
                async with await create_mux() as mux:
                    await mux.listen()
                    while True:
                        await mux.receive_device_state_update()
                        # A new listener receives its initial Attached burst
                        # one device at a time. Re-list authoritatively so the
                        # first event cannot transiently remove other phones.
                        await self.refresh()
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001 - reconnect keeps discovery alive
                logger.exception("usbmux event listener disconnected")
                await asyncio.sleep(self._reconnect_seconds)
