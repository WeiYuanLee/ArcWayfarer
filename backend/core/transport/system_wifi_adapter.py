"""Apple usbmux Network and tunneld transport access."""

from collections.abc import Awaitable, Callable
from typing import Any


class SystemWifiTransportAdapter:
    def __init__(
        self,
        create_lockdown: Callable[..., Awaitable[Any]],
        get_rsd: Callable[[str], Awaitable[Any]],
    ) -> None:
        self._create_lockdown = create_lockdown
        self._get_rsd = get_rsd

    async def lockdown(self, udid: str) -> Any:
        return await self._create_lockdown(serial=udid, connection_type="Network")

    async def rsd(self, udid: str) -> Any:
        rsd = await self._get_rsd(udid)
        if rsd is None:
            raise RuntimeError("The bound system Wi-Fi RSD runtime is no longer available.")
        return rsd
