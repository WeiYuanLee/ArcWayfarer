"""tunneld source discovery without opening RSD service connections."""

import asyncio
from typing import Callable

from core.device_ports import DiscoverySourceResult


class SystemWifiScanner:
    """Own the latest tunneld source outcome, distinct from an empty result."""

    def __init__(self) -> None:
        self._last_result = DiscoverySourceResult("not_requested")

    @property
    def last_result(self) -> DiscoverySourceResult:
        return self._last_result

    async def scan(self, list_tunnels: Callable[[], list[str]], *, timeout: float) -> set[str]:
        try:
            tunnels = await asyncio.wait_for(asyncio.to_thread(list_tunnels), timeout=timeout)
        except Exception as exc:  # noqa: BLE001 - source failure belongs in the snapshot
            message = " ".join(str(exc).split())[:300]
            self._last_result = DiscoverySourceResult("failed", f"{type(exc).__name__}: {message}")
            return set()

        self._last_result = DiscoverySourceResult("success")
        return {str(udid) for udid in tunnels if udid}


system_wifi_scanner = SystemWifiScanner()
