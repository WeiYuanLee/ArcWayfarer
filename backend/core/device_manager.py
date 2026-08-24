import asyncio
import logging
import platform
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from importlib.metadata import PackageNotFoundError, version

from packaging.version import Version
from pymobiledevice3.exceptions import AlreadyMountedError, TunneldConnectionError
from pymobiledevice3.lockdown import UsbmuxLockdownClient, create_using_usbmux
from pymobiledevice3.remote.remote_service_discovery import RemoteServiceDiscoveryService
from pymobiledevice3.services.mobile_image_mounter import auto_mount
from pymobiledevice3.tunneld.api import _list_tunnels, get_tunneld_device_by_udid
from pymobiledevice3.usbmux import list_devices as usbmux_list_devices

from models.schemas import DeviceConnectionType, DeviceInfo

logger = logging.getLogger(__name__)

IOS_17 = Version("17.0")
DEVICE_LIST_TIMEOUT_SECONDS = 5.0
DEVICE_DESCRIBE_TIMEOUT_SECONDS = 10.0

# All callers in a polling interval share one discovery operation. In
# particular, do not let a slow Network lockdown lookup start a second scan.
_device_scan_lock = asyncio.Lock()
_device_scan_task: asyncio.Task[list[DeviceInfo]] | None = None


@dataclass(frozen=True)
class DeviceDiscoveryDiagnostic:
    """A support-safe snapshot of the most recent USB discovery failure."""

    code: str
    occurred_at: str
    error_type: str
    message: str
    python_version: str
    platform: str
    pymobiledevice3_version: str


_last_usb_discovery_diagnostic: DeviceDiscoveryDiagnostic | None = None


def _pymobiledevice3_version() -> str:
    try:
        return version("pymobiledevice3")
    except PackageNotFoundError:
        return "unknown"


def _record_usb_discovery_failure(exc: Exception) -> None:
    """Keep a bounded, non-sensitive diagnostic users can copy for support."""
    global _last_usb_discovery_diagnostic

    # Do not include UDIDs or arbitrary unbounded exception output in a value
    # that is exposed to the UI. The full traceback remains in the local log.
    message = " ".join(str(exc).split())[:500] or "No error message was provided."
    _last_usb_discovery_diagnostic = DeviceDiscoveryDiagnostic(
        code="usb_discovery_failed",
        occurred_at=datetime.now(timezone.utc).isoformat(),
        error_type=exc.__class__.__name__,
        message=message,
        python_version=platform.python_version(),
        platform=f"{platform.system()} {platform.release()} ({platform.machine()})",
        pymobiledevice3_version=_pymobiledevice3_version(),
    )


def get_usb_discovery_diagnostic() -> dict[str, str] | None:
    """Return the latest USB discovery failure without starting another scan."""
    if _last_usb_discovery_diagnostic is None:
        return None
    return asdict(_last_usb_discovery_diagnostic)


async def list_devices(include_wifi: bool = True) -> list[DeviceInfo]:
    global _device_scan_task

    async with _device_scan_lock:
        if _device_scan_task is None or _device_scan_task.done():
            _device_scan_task = asyncio.create_task(_scan_devices())
        scan_task = _device_scan_task

    # Shielding means cancellation of one HTTP request cannot cancel the
    # shared discovery work needed by other callers.
    devices = await asyncio.shield(scan_task)
    # Keep one physical discovery task for all callers. Filtering its stable
    # result here avoids a USB-only refresh racing a Wi-Fi-enabled refresh.
    # ``unknown`` remains visible because tunneld cannot always report whether
    # its RSD originated from USB or Wi-Fi.
    if include_wifi:
        return devices
    return [device for device in devices if device.connection_type != "wifi"]


def _connection_type_from_mux(mux_device: object) -> DeviceConnectionType:
    """Translate usbmux's physical connection names into API values."""
    connection_type = str(getattr(mux_device, "connection_type", "")).upper()
    if connection_type == "USB":
        return "usb"
    if connection_type in {"NETWORK", "WIFI", "WI-FI"}:
        # usbmux calls an iPhone paired with "Connect over Wi-Fi" a Network
        # device. It is the Wi-Fi connection surfaced to this application.
        return "wifi"
    return "unknown"


async def _scan_devices() -> list[DeviceInfo]:
    global _last_usb_discovery_diagnostic
    devices: list[DeviceInfo] = []
    seen_udids: set[str] = set()

    # Do not use get_tunneld_devices() for discovery. It opens an RSD connection
    # for every tunnel it finds; a periodic scan would therefore leave extra
    # iOS 17 developer-service connections alive and can interfere with the
    # single RSD connection that owns location simulation.
    tunnel_udids = await _list_tunnel_udids()

    try:
        mux_devices = await asyncio.wait_for(usbmux_list_devices(), timeout=DEVICE_LIST_TIMEOUT_SECONDS)
    except Exception as exc:  # noqa: BLE001 - surfaced through the diagnostics endpoint
        _record_usb_discovery_failure(exc)
        logger.exception("USB device discovery failed; returning tunnel-only results")
        mux_devices = []
    else:
        # A successful usbmux call is definitive: do not show an obsolete
        # support warning after the cable/service has recovered.
        _last_usb_discovery_diagnostic = None

    # Sort USB connections before Network connections so USB is preferred if both exist.
    mux_devices = sorted(mux_devices, key=lambda d: 0 if _connection_type_from_mux(d) == "usb" else 1)

    for mux_device in mux_devices:
        udid = mux_device.serial
        if not udid or udid.lower() in seen_udids:
            continue
        seen_udids.add(udid.lower())
        connection_type = _connection_type_from_mux(mux_device)
        try:
            devices.append(
                await asyncio.wait_for(
                    _describe_device(udid, connection_type, tunnel_udids), timeout=DEVICE_DESCRIBE_TIMEOUT_SECONDS
                )
            )
        except Exception as e:  # noqa: BLE001 - surface any pairing/lockdown failure to the UI
            if tunnel_udids and udid.lower() in {known_udid.lower() for known_udid in tunnel_udids}:
                devices.append(
                    DeviceInfo(
                        udid=udid,
                        name=udid,
                        ios_version="unknown",
                        transport="rsd",
                        connection_type=connection_type,
                        status="ready",
                    )
                )
            else:
                devices.append(
                    DeviceInfo(
                        udid=udid,
                        name=udid,
                        ios_version="unknown",
                        transport="lockdown",
                        connection_type=connection_type,
                        status="error",
                        detail=str(e),
                    )
                )

    # Tunneld can also report devices that are not currently listed by usbmux.
    # Its HTTP listing has no device metadata, so expose a safe minimal row;
    # the real RSD is opened later, only when an operation requires it.
    for udid in tunnel_udids:
        if udid.lower() not in seen_udids:
            seen_udids.add(udid.lower())
            devices.append(
                DeviceInfo(
                    udid=udid,
                    name=udid,
                    ios_version="unknown",
                    transport="rsd",
                    connection_type="unknown",
                    status="ready",
                )
            )

    return devices


async def _list_tunnel_udids() -> set[str]:
    """Read tunneld's HTTP listing without opening any RSD connections."""
    try:
        tunnels = await asyncio.wait_for(asyncio.to_thread(_list_tunnels), timeout=DEVICE_LIST_TIMEOUT_SECONDS)
    except (TunneldConnectionError, TimeoutError, OSError):
        return set()
    except Exception:
        return set()
    return {str(udid) for udid in tunnels if udid}


async def _describe_device(
    udid: str,
    connection_type: DeviceConnectionType = "unknown",
    tunnel_udids: set[str] | None = None,
) -> DeviceInfo:
    lockdown = await create_using_usbmux(serial=udid)
    name = lockdown.all_values.get("DeviceName", udid)
    ios_version = lockdown.product_version

    if Version(ios_version) < IOS_17:
        return DeviceInfo(
            udid=udid,
            name=name,
            ios_version=ios_version,
            transport="lockdown",
            connection_type=connection_type,
            status="ready",
        )

    if not tunnel_udids or udid.lower() not in {known_udid.lower() for known_udid in tunnel_udids}:
        return DeviceInfo(
            udid=udid,
            name=name,
            ios_version=ios_version,
            transport="rsd",
            connection_type=connection_type,
            status="tunnel_required",
            detail="Run 'sudo python3 -m pymobiledevice3 remote tunneld' and reconnect the device.",
        )

    return DeviceInfo(
        udid=udid,
        name=name,
        ios_version=ios_version,
        transport="rsd",
        connection_type=connection_type,
        status="ready",
    )


async def get_device(udid: str) -> DeviceInfo:
    for device in await list_devices():
        if device.udid.lower() == udid.lower():
            return device
    raise ValueError(f"Device not found: {udid}")


async def get_lockdown(udid: str) -> UsbmuxLockdownClient:
    return await create_using_usbmux(serial=udid)


async def get_rsd(udid: str) -> RemoteServiceDiscoveryService:
    rsd = await get_tunneld_device_by_udid(udid)
    if rsd is None:
        raise RuntimeError(
            "No active tunnel for this device. Run 'sudo python3 -m pymobiledevice3 remote tunneld' first."
        )
    return rsd


async def ensure_mounted(lockdown: UsbmuxLockdownClient) -> None:
    try:
        await auto_mount(lockdown)
    except AlreadyMountedError:
        pass
