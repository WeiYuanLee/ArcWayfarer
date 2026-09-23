"""Physical USB transport access."""

from collections.abc import Awaitable, Callable
from typing import Any

from core.discovery.usb_scanner import UsbScanner


class UsbTransportAdapter:
    def __init__(
        self,
        scanner: UsbScanner,
        create_lockdown: Callable[..., Awaitable[Any]],
        get_rsd: Callable[[str], Awaitable[Any]],
    ) -> None:
        self._scanner = scanner
        self._create_lockdown = create_lockdown
        self._get_rsd = get_rsd

    async def lockdown(self, udid: str) -> Any:
        return await self._create_lockdown(serial=udid, connection_type="USB")

    async def rsd(self, udid: str) -> Any:
        if not self._scanner.is_present(udid):
            raise RuntimeError("The bound USB RSD runtime is no longer available.")
        rsd = await self._get_rsd(udid)
        if rsd is None:
            raise RuntimeError("The bound USB RSD runtime is no longer available.")
        return rsd
