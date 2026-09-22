"""Low-level ownership of Wireless Direct tunnel resources.

This adapter is deliberately free of route policy and command semantics.  The
TransportController decides when these operations are allowed; this module is
the only place that opens or closes a WiFiRsdTunnel.
"""

import asyncio
from collections.abc import Callable

from core.wireless_rsd import WiFiRsdTunnel
from models.schemas import DeviceInfo


class DirectTransportAdapter:
    def __init__(self, tunnel_factory: Callable[..., WiFiRsdTunnel] = WiFiRsdTunnel) -> None:
        self.addresses: dict[str, str] = {}
        self.rsd_tunnels: dict[str, WiFiRsdTunnel] = {}
        self.rsd_devices: dict[str, DeviceInfo] = {}
        self._tunnel_factory = tunnel_factory

    @staticmethod
    def _key(udid: str) -> str:
        return udid.strip().lower()

    async def open_rsd(
        self,
        udid: str,
        *,
        ip: str | None,
        fallback_bonjour: bool,
        port: int,
        timeout: float = 25,
    ) -> tuple[WiFiRsdTunnel, object]:
        tunnel = self._tunnel_factory(
            serial=udid,
            ip=ip,
            autopair=False,
            fallback_bonjour=fallback_bonjour,
            port=port,
        )
        try:
            rsd = await asyncio.wait_for(tunnel.aopen(), timeout=timeout)
            return tunnel, rsd
        except BaseException:
            await tunnel.aclose()
            raise

    async def close_candidate(self, tunnel: WiFiRsdTunnel) -> None:
        await tunnel.aclose()

    async def clear_runtime(self, udid: str) -> None:
        key = self._key(udid)
        self.addresses.pop(key, None)
        self.rsd_devices.pop(key, None)
        tunnel = self.rsd_tunnels.pop(key, None)
        if tunnel is not None:
            await tunnel.aclose()

    async def clear_all(self) -> None:
        for key in tuple(set(self.addresses) | set(self.rsd_devices) | set(self.rsd_tunnels)):
            await self.clear_runtime(key)

    def install_rsd(self, udid: str, tunnel: WiFiRsdTunnel, device: DeviceInfo) -> None:
        key = self._key(udid)
        self.rsd_tunnels[key] = tunnel
        self.rsd_devices[key] = device

    def install_address(self, udid: str, address: str) -> None:
        self.addresses[self._key(udid)] = address

    def runtime_udids(self) -> tuple[str, ...]:
        return tuple(set(self.addresses) | set(self.rsd_devices) | set(self.rsd_tunnels))
