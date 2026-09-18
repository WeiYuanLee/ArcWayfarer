"""Direct TCP lockdown transport with an unbound service socket for TLS.

pymobiledevice3 11.3.1 pre-binds asyncio streams when opening a TCP service.
Its SSL upgrade then takes the StreamWriter.start_tls path. On the tested
iOS 16.7.16 device, that path accepted a simulate-location command but did
not change the phone's location. Starting TLS on an unbound socket, as the
working usbmux Network path does, made Direct TCP location set/clear work.
"""

import asyncio
import socket

from pymobiledevice3.lockdown import TcpLockdownClient
from pymobiledevice3.osu.os_utils import get_os_utils
from pymobiledevice3.service_connection import ServiceConnection


class DirectTcpLockdownClient(TcpLockdownClient):
    async def create_service_connection(self, port: int) -> ServiceConnection:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.setblocking(False)
        try:
            await asyncio.wait_for(asyncio.get_running_loop().sock_connect(sock, (self.hostname, port)), timeout=5.0)
            if self._keep_alive:
                get_os_utils().set_keepalive(sock)
            # Leave reader/writer unset. ServiceConnection.ssl_start will bind
            # TLS-aware streams directly instead of upgrading plain streams.
            return ServiceConnection(sock)
        except BaseException:
            sock.close()
            raise

    async def start_lockdown_service(self, name: str, include_escrow_bag: bool = False) -> ServiceConnection:
        attr = await self.get_service_connection_attributes(name, include_escrow_bag=include_escrow_bag)
        service = await self.create_service_connection(attr["Port"])
        try:
            if attr.get("EnableServiceSSL", False):
                with self.ssl_file() as certfile:
                    await service.ssl_start(certfile)
            return service
        except BaseException:
            # The upstream method leaves this new socket open if TLS fails.
            try:
                await service.close()
            except Exception:
                pass
            raise


async def create_direct_lockdown(hostname: str, udid: str, pair_record: dict) -> DirectTcpLockdownClient:
    service = await ServiceConnection.create_using_tcp(hostname, 62078, keep_alive=True)
    try:
        return await DirectTcpLockdownClient.create(
            service,
            hostname=hostname,
            identifier=udid,
            pair_record=pair_record,
            autopair=False,
            keep_alive=True,
        )
    except BaseException:
        await service.close()
        raise
