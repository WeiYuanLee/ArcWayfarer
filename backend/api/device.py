from ipaddress import IPv4Address
import logging
import platform
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field
from pymobiledevice3.exceptions import DeviceNotFoundError, PyMobileDevice3Exception

from core import device_manager, device_session, pairing_store
from core.device_revision import device_revision_ledger
from core.device_ports import DiscoverySnapshot
from core.keyed_async_lock import device_command_locks
from core.support_diagnostics import runtime_diagnostic
from models.schemas import DeviceInfo

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)


class DirectConnectRequest(BaseModel):
    ip: str | None = None
    # The client must carry the DNS-SD SRV port with the selected endpoint.
    # There is no universally valid iOS 17+ RemotePairing default.
    port: int = Field(ge=1, le=65535)
    fallback_bonjour: bool = True
    refresh_pairing: bool = False


class DiscoverySourceResponse(BaseModel):
    status: Literal["success", "failed", "not_requested"]
    detail: str | None = None


class DeviceSnapshotResponse(BaseModel):
    snapshot_revision: int
    sources: dict[str, DiscoverySourceResponse]
    devices: list[DeviceInfo]


class DeviceSetupResponse(BaseModel):
    status: Literal["trusted"]
    ios_version: str
    developer_mode_required: bool
    developer_mode_enabled: bool
    revision: int


def _snapshot_response(snapshot: DiscoverySnapshot) -> DeviceSnapshotResponse:
    return DeviceSnapshotResponse(
        snapshot_revision=snapshot.snapshot_revision,
        sources={
            name: DiscoverySourceResponse(status=value.status, detail=value.detail)
            for name, value in snapshot.sources.items()
        },
        devices=list(snapshot.devices),
    )


def _require_desktop(request: Request) -> None:
    # Wireless pairing changes credentials on this computer. Keep the loopback
    # boundary on both desktop platforms, including the Windows test build.
    if platform.system() not in {"Darwin", "Windows"}:
        raise HTTPException(status_code=501, detail="無線直連測試版目前只在 macOS 與 Windows 開放。")
    if request.client is None or request.client.host not in {"127.0.0.1", "::1", "localhost"}:
        raise HTTPException(status_code=403, detail="無線授權與連線設定只能在電腦端操作。")


@router.post("/devices/{udid}/wireless-direct/pair")
async def pair_wireless_direct(udid: str, request: Request) -> dict:
    _require_desktop(request)
    async with device_command_locks.hold(f"device:{udid}"):
        try:
            await device_manager.enable_direct_pairing(udid)
        except (ValueError, OSError, TimeoutError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {"status": "paired", "revision": device_revision_ledger.revision_for(udid)}


@router.post("/devices/{udid}/setup/trust", response_model=DeviceSetupResponse)
async def trust_device_for_setup(udid: str, request: Request) -> dict:
    """Start the user-authorized USB trust flow and inspect Developer Mode."""
    _require_desktop(request)
    async with device_command_locks.hold(f"device:{udid}"):
        try:
            return await device_manager.trust_usb_device(udid)
        except (ValueError, OSError, TimeoutError, PyMobileDevice3Exception) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/devices/{udid}/wireless-direct/connect")
async def connect_wireless_direct(udid: str, body: DirectConnectRequest, request: Request) -> DeviceInfo:
    _require_desktop(request)
    target_udid = "" if udid.lower() in {"auto", "unknown"} else udid
    # Lock ownership lives in the manager so auto resolution can release its
    # endpoint lock before entering the identified device's command lock.
    try:
        return await device_manager.connect_direct(
            target_udid,
            str(body.ip) if body.ip else None,
            fallback_bonjour=body.fallback_bonjour,
            port=body.port,
            refresh_pairing=body.refresh_pairing,
        )
    except (ValueError, OSError, TimeoutError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/devices/{udid}/wireless-direct/disconnect")
async def disconnect_wireless_direct(udid: str, request: Request) -> dict:
    _require_desktop(request)
    if device_session.has_session(udid):
        raise HTTPException(status_code=409, detail="請先停止並還原目前的定位，再切換連線方式。")
    await device_manager.disconnect_direct(udid)
    return {"status": "disconnected", "revision": device_revision_ledger.revision_for(udid)}


@router.post("/devices/{udid}/wireless-direct/remove-pairing")
async def remove_wireless_direct_pairing(udid: str, request: Request) -> dict:
    _require_desktop(request)
    if device_session.has_session(udid):
        raise HTTPException(status_code=409, detail="請先停止並還原目前的定位，再移除授權。")
    revision = await device_manager.remove_direct_pairing(udid)
    return {"status": "removed", "revision": revision}


@router.post("/devices/{udid}/wireless-direct/clear-address")
async def clear_wireless_direct_address(udid: str, request: Request) -> dict:
    _require_desktop(request)
    async with device_command_locks.hold(f"device:{udid}"):
        pairing_store.remove_address(udid)
        revision = device_revision_ledger.bump(udid)
        return {"status": "cleared", "revision": revision}


@router.get("/devices/wireless-direct/endpoints")
async def get_wireless_direct_endpoints(request: Request) -> list[dict]:
    _require_desktop(request)
    return await device_manager.list_direct_endpoints()


@router.get("/devices")
async def get_devices(include_wifi: bool = Query(default=False)) -> list[DeviceInfo]:
    """List USB devices and, when requested, devices discovered over Wi-Fi."""
    return await device_manager.list_devices(include_wifi=include_wifi)


@router.get("/devices/snapshot")
async def get_devices_snapshot(include_wifi: bool = Query(default=False)) -> DeviceSnapshotResponse:
    """Return one revisioned observation; this query never changes a transport."""
    snapshot = await device_manager.get_device_snapshot(include_wifi=include_wifi)
    return _snapshot_response(snapshot)


@router.post("/devices/snapshot/refresh")
async def refresh_devices_snapshot(include_wifi: bool = Query(default=False)) -> DeviceSnapshotResponse:
    """Resync fast USB presence and schedule shared background enrichment."""
    await device_manager.refresh_device_discovery()
    return _snapshot_response(await device_manager.get_device_snapshot(include_wifi=include_wifi))


@router.get("/devices/diagnostics")
async def get_device_diagnostics() -> dict:
    """Return support-safe runtime facts without triggering a rescan."""
    return {
        "usb_discovery": device_manager.get_usb_discovery_diagnostic(),
        "runtime": runtime_diagnostic(),
    }


@router.post("/devices/{udid}/amfi/reveal-developer-mode")
async def amfi_reveal_developer_mode(udid: str, request: Request) -> dict:
    """Make iOS's "Developer Mode" option appear in Settings → Privacy &
    Security, without side-loading a developer-signed IPA. This is action 0
    (REVEAL) of the com.apple.amfi.lockdown service — it just creates the
    AMFIShowOverridePath marker file on the device (no reboot, no passcode
    prompt). The user still has to open Settings and toggle Developer Mode
    on themselves. iOS 16+ only.
    """
    _require_desktop(request)
    async with device_command_locks.hold(f"device:{udid}"):
        try:
            revision = await device_manager.reveal_developer_mode(udid)
        except DeviceNotFoundError as exc:
            raise HTTPException(status_code=400, detail="請以 USB 接上這台 iPhone 後重試。") from exc
        except (ValueError, OSError, TimeoutError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            logger.exception("Failed to reveal Developer Mode for %s", udid)
            raise HTTPException(status_code=500, detail="暫時無法在 iPhone 上顯示開發者模式選項，請重新接線後再試一次。") from exc

    return {"status": "ok", "revision": revision}
