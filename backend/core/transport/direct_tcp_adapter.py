"""iOS 16 Wireless Direct lockdown transport."""

from collections.abc import Awaitable, Callable
from typing import Any

from core.pairing_manager import PairingManager
from models.schemas import DeviceInfo


class DirectTcpAdapter:
    def __init__(self, pairing: PairingManager, create_lockdown: Callable[..., Awaitable[Any]]) -> None:
        self._pairing = pairing
        self._create_lockdown = create_lockdown

    async def connect(self, udid: str, address: str) -> Any:
        record = self._pairing.load(udid)
        if record is None:
            raise ValueError("這台手機尚未在此電腦完成無線授權。")
        lockdown = await self._create_lockdown(hostname=address, udid=udid, pair_record=record)
        if not lockdown.paired or lockdown.udid.lower() != udid.lower():
            await lockdown.close()
            raise ValueError("無線連線的手機與已授權裝置不符，或授權已失效。")
        return lockdown

    async def describe(self, udid: str, address: str) -> DeviceInfo:
        async with await self.connect(udid, address) as lockdown:
            return DeviceInfo(
                udid=lockdown.udid,
                name=lockdown.all_values.get("DeviceName", lockdown.udid),
                ios_version=lockdown.product_version,
                transport="lockdown",
                connection_type="wireless_direct",
                ip_address=address,
                direct_paired=True,
                status="ready",
                detail="Direct TCP 定位通道已就緒。",
            )
