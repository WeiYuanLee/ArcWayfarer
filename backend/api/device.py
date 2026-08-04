from fastapi import APIRouter, HTTPException
from pymobiledevice3.exceptions import DeviceNotFoundError

from core import device_manager
from models.schemas import DeviceInfo

router = APIRouter(prefix="/api")


@router.get("/devices")
async def get_devices() -> list[DeviceInfo]:
    return await device_manager.list_devices()


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
