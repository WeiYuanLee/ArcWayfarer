from ipaddress import IPv4Address
import platform
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field
from pymobiledevice3.exceptions import DeviceNotFoundError

from core import device_manager, device_session, pairing_store
from core.device_revision import device_revision_ledger
from core.device_ports import DiscoverySnapshot
from core.keyed_async_lock import device_command_locks
from models.schemas import DeviceInfo

router = APIRouter(prefix="/api")


class DirectConnectRequest(BaseModel):
    ip: str | None = None
    port: int = Field(default=49152, ge=1, le=65535)
    fallback_bonjour: bool = True


class DiscoverySourceResponse(BaseModel):
    status: Literal["success", "failed", "not_requested"]
    detail: str | None = None


class DeviceSnapshotResponse(BaseModel):
    snapshot_revision: int
    sources: dict[str, DiscoverySourceResponse]
    devices: list[DeviceInfo]


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
        )
    except (ValueError, OSError, TimeoutError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/devices/{udid}/wireless-direct/disconnect")
async def disconnect_wireless_direct(udid: str, request: Request) -> dict:
    _require_desktop(request)
    async with device_command_locks.hold(f"device:{udid}"):
        if device_session.has_session(udid):
            raise HTTPException(status_code=409, detail="請先停止並還原目前的定位，再切換連線方式。")
        await device_manager.disconnect_direct(udid)
        return {"status": "disconnected", "revision": device_revision_ledger.revision_for(udid)}


@router.post("/devices/{udid}/wireless-direct/remove-pairing")
async def remove_wireless_direct_pairing(udid: str, request: Request) -> dict:
    _require_desktop(request)
    async with device_command_locks.hold(f"device:{udid}"):
        if device_session.has_session(udid):
            raise HTTPException(status_code=409, detail="請先停止並還原目前的定位，再移除授權。")
        await device_manager.disconnect_direct(udid)
        pairing_store.remove(udid)
        revision = device_manager.record_direct_pairing_removed(udid)
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
    """Explicitly request one observation, then return the Registry projection."""
    await device_manager.refresh_device_discovery()
    return _snapshot_response(await device_manager.get_device_snapshot(include_wifi=include_wifi))


@router.get("/devices/diagnostics")
async def get_device_diagnostics() -> dict:
    """Return the latest USB discovery failure without triggering a rescan."""
    return {"usb_discovery": device_manager.get_usb_discovery_diagnostic()}


@router.post("/devices/{udid}/amfi/reveal-developer-mode")
async def amfi_reveal_developer_mode(udid: str) -> dict:
    """Make iOS's "Developer Mode" option appear in Settings → Privacy &
    Security, without side-loading a developer-signed IPA. This is action 0
    (REVEAL) of the com.apple.amfi.lockdown service — it just creates the
    AMFIShowOverridePath marker file on the device (no reboot, no passcode
    prompt). The user still has to open Settings and toggle Developer Mode
    on themselves. iOS 16+ only.
    """
    try:
        device = await device_manager.get_device(udid)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

    if device.status != "ready":
        raise HTTPException(
            status_code=400,
            detail={"code": "device_not_ready", "message": device.detail or f"Device is not ready (status: {device.status})."},
        )

    try:
        major = int((device.ios_version or "0.0").split(".")[0])
    except Exception:
        major = 0
    if major < 16:
        raise HTTPException(
            status_code=400,
            detail={"code": "ios_too_old", "message": f"iOS {device.ios_version} has no Developer Mode concept."},
        )

    try:
        from pymobiledevice3.services.amfi import AmfiService
    except ImportError as exc:
        raise HTTPException(
            status_code=500,
            detail={"code": "amfi_not_available", "message": f"Failed to load AMFI service: {exc}"},
        )

    try:
        lockdown = await device_manager.get_lockdown(udid)
        await AmfiService(lockdown).reveal_developer_mode_option_in_ui()
    except DeviceNotFoundError:
        raise HTTPException(
            status_code=400,
            detail={"code": "device_not_found_usbmux", "message": "Device must be connected via USB for AMFI reveal."},
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={"code": "amfi_reveal_failed", "message": f"AMFI reveal failed: {exc.__class__.__name__}: {exc}"},
        )

    return {"status": "ok"}
