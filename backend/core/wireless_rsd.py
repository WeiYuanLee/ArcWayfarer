"""Wi-Fi RemotePairing RSD tunnel for pymobiledevice3 11.3.1.

The upstream UserspaceRsdTunnel always tries usbmux first. This subclass
selects an already paired RemotePairing service directly, then uses the same
PyTCP lifecycle and cleanup as the upstream implementation.
"""

import asyncio
from contextlib import AsyncExitStack

from pymobiledevice3.remote import tunnel_service, userspace_tunnel
from pymobiledevice3.remote.remote_service_discovery import RemoteServiceDiscoveryService
from pymobiledevice3.remote.userspace_tunnel import UserspaceDialPlane, UserspaceRsdTunnel


class WiFiRsdTunnel(UserspaceRsdTunnel):
    def __init__(self, serial: str, ip: str | None = None, autopair: bool = False, fallback_bonjour: bool = True, port: int = 49152):
        super().__init__(serial=serial, autopair=autopair)
        self.ip = ip
        self.fallback_bonjour = fallback_bonjour
        self.port = port
        self.peer_ip: str | None = None

    async def _aopen_locked(self) -> RemoteServiceDiscoveryService:
        if userspace_tunnel._active_tunnel is not None:
            raise RuntimeError("目前只能同時使用一台 iOS 17+ 無線直連裝置。")

        tunnel_service.USE_USERSPACE_TUNNEL = True
        stack = AsyncExitStack()
        try:
            canonical_udid = next(
                (i for i in tunnel_service.iter_remote_paired_identifiers() if i.lower() == self.serial.lower()),
                self.serial,
            )

            provider = None
            if self.ip:
                # Keep the selected DNS-SD port with its IP. It is not always
                # the historical RemotePairing default of 49152.
                provider = await tunnel_service.create_core_device_tunnel_service_using_remotepairing(
                    canonical_udid, self.ip, self.port
                )
            elif self.fallback_bonjour:
                services = await tunnel_service.get_remote_pairing_tunnel_services(udid=canonical_udid, bonjour_timeout=4)
                if not services:
                    raise ValueError("找不到這台手機的無線 RSD 配對。請確認同一個 Wi-Fi、手機已解鎖，並先用 USB 完成信任。")
                services.sort(key=lambda s: 0 if ":" not in getattr(s, "hostname", "") else 1)
                provider = services[0]
                await asyncio.gather(*(extra.close() for extra in services[1:]), return_exceptions=True)
            else:
                raise ValueError("未指定 IP 位址且未啟用 Bonjour 搜尋。")

            self.peer_ip = getattr(provider, "hostname", None) or self.ip

            stack.push_async_callback(provider.close)

            result = await stack.enter_async_context(provider.start_tcp_tunnel())
            self.tun = result.client.tun
            self.tun.set_peer(result.address)
            dial_plane = await stack.enter_async_context(UserspaceDialPlane(self.tun, result.address))
            rsd = RemoteServiceDiscoveryService(
                (result.address, result.port),
                open_connection=dial_plane.dial,
                auxiliary_metadata=result.auxiliary_metadata,
            )
            stack.push_async_callback(rsd.close)
            await rsd.connect()
            rsd.peer_ip = self.peer_ip
        except BaseException:
            await stack.aclose()
            tunnel_service.USE_USERSPACE_TUNNEL = False
            self.tun = None
            raise

        self._exit_stack = stack
        self.rsd = rsd
        userspace_tunnel._active_tunnel = self
        userspace_tunnel.USERSPACE_ACTIVE = True
        self._transport_watcher = asyncio.create_task(self._watch_transport_closed(result.client))
        return rsd
