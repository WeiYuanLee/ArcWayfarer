"""Pairing authorization lifecycle and private record access."""

import logging

from collections.abc import Awaitable, Callable, Iterable
from pathlib import Path
from typing import Any

from packaging.version import Version
from pymobiledevice3.exceptions import RemotePairingCompletedError

from core import pairing_store

IOS_17 = Version("17.0")
logger = logging.getLogger(__name__)


class PairingManager:
    """Own pairing capability; a stored record never means a live route."""

    def exists(self, udid: str) -> bool:
        return pairing_store.exists(udid)

    def list_udids(self) -> list[str]:
        return pairing_store.list_udids()

    def load(self, udid: str) -> dict | None:
        return pairing_store.load(udid)

    def load_address(self, udid: str) -> str | None:
        return pairing_store.load_address(udid)

    def load_port(self, udid: str) -> int | None:
        return pairing_store.load_port(udid)

    def load_version(self, udid: str) -> str | None:
        return pairing_store.load_version(udid)

    def save_address(self, udid: str, address: str) -> None:
        pairing_store.save_address(udid, address)

    def save_port(self, udid: str, port: int) -> None:
        pairing_store.save_port(udid, port)

    def save_version(self, udid: str, ios_version: str) -> None:
        pairing_store.save_version(udid, ios_version)

    def address_modified_at(self, udid: str) -> str | None:
        return pairing_store.address_modified_at(udid)

    def remove(self, udid: str) -> None:
        pairing_store.remove(udid)

    async def enable(
        self,
        udid: str,
        *,
        create_usb_lockdown: Callable[..., Awaitable[Any]],
        create_remote_service: Callable[[Any], Awaitable[Any]],
        remote_pair_records: Callable[[], Iterable[tuple[str, Path, dict[str, Any]]]],
        ensure_mounted: Callable[[Any], Awaitable[None]],
        announce_wifi_change: Callable[[Any], Awaitable[None]],
    ) -> str:
        """Create or refresh authorization through the trusted USB route."""
        async with await create_usb_lockdown(serial=udid, connection_type="USB", autopair=False) as lockdown:
            if not lockdown.paired or lockdown.pair_record is None or lockdown.udid.lower() != udid.lower():
                raise ValueError("請用 USB 接上手機、解鎖並選擇信任此電腦。")

            modern = Version(lockdown.product_version) >= IOS_17
            if modern:
                current_records = [
                    (path, record)
                    for identifier, path, record in remote_pair_records()
                    if identifier.lower() == udid.lower()
                ]
                if current_records and not any(record.get("peer_alt_irk") for _path, record in current_records):
                    # pymobiledevice3 11.16+ authenticates privacy-preserving
                    # Bonjour adverts with peer_alt_irk. An older record can
                    # still complete pair verification over USB but can never
                    # identify the phone after unplugging, so rebuild only the
                    # selected phone's stale record while USB is trusted.
                    for path, _record in current_records:
                        path.unlink(missing_ok=True)
                try:
                    service = await create_remote_service(lockdown)
                    try:
                        try:
                            await service.connect(autopair=True)
                        except RemotePairingCompletedError:
                            await service.close()
                            service = await create_remote_service(lockdown)
                            await service.connect(autopair=False)
                    finally:
                        await service.close()
                except Exception as exc:
                    raise ValueError(
                        "無法透過 USB 完成無線 RSD 授權。請解鎖手機、確認已信任此電腦後重試。"
                    ) from exc
                refreshed_records = [
                    record
                    for identifier, _path, record in remote_pair_records()
                    if identifier.lower() == udid.lower()
                ]
                if not any(record.get("peer_alt_irk") for record in refreshed_records):
                    raise ValueError("USB 無線 RSD 授權未產生可辨識 Wi-Fi 廣播的新配對紀錄。請保持接線後重試。")

            if not await lockdown.get_enable_wifi_connections():
                await lockdown.set_enable_wifi_connections(True)
                if not await lockdown.get_enable_wifi_connections():
                    raise RuntimeError("手機未啟用無線連線，請保持 USB 連接後重試。")

            # A phone that already had Wi-Fi connections enabled may keep its
            # previous Bonjour advertisement after this Mac creates a new
            # RemotePairing record. Ask lockdownd to publish again so the new
            # host-specific authTag becomes visible without toggling Wi-Fi.
            try:
                await announce_wifi_change(lockdown)
            except Exception as exc:
                # The authorization and Wi-Fi setting are already durable.
                # Keep them even when this best-effort reannounce nudge fails;
                # a later scan or Wi-Fi reconnect can still expose the phone.
                logger.warning("Could not request Bonjour reannouncement for %s: %s", udid, exc)

            if not modern:
                await ensure_mounted(lockdown)

            pairing_store.save(udid, lockdown.pair_record)
            pairing_store.save_version(udid, lockdown.product_version)
            return lockdown.product_version


pairing_manager = PairingManager()
