from packaging.version import Version
from pymobiledevice3.exceptions import AlreadyMountedError, TunneldConnectionError
from pymobiledevice3.lockdown import UsbmuxLockdownClient, create_using_usbmux
from pymobiledevice3.remote.remote_service_discovery import RemoteServiceDiscoveryService
from pymobiledevice3.services.mobile_image_mounter import auto_mount
from pymobiledevice3.tunneld.api import get_tunneld_device_by_udid
from pymobiledevice3.usbmux import list_devices as usbmux_list_devices

from models.schemas import DeviceInfo

IOS_17 = Version("17.0")


async def list_devices() -> list[DeviceInfo]:
    devices: list[DeviceInfo] = []
    for mux_device in await usbmux_list_devices():
        udid = mux_device.serial
        try:
            devices.append(await _describe_device(udid))
        except Exception as e:  # noqa: BLE001 - surface any pairing/lockdown failure to the UI
            devices.append(
                DeviceInfo(
                    udid=udid,
                    name=udid,
                    ios_version="unknown",
                    transport="lockdown",
                    status="error",
                    detail=str(e),
                )
            )
    return devices


async def _describe_device(udid: str) -> DeviceInfo:
    lockdown = await create_using_usbmux(serial=udid)
    name = lockdown.all_values.get("DeviceName", udid)
    ios_version = lockdown.product_version

    if Version(ios_version) < IOS_17:
        return DeviceInfo(udid=udid, name=name, ios_version=ios_version, transport="lockdown", status="ready")

    try:
        rsd = await get_tunneld_device_by_udid(udid)
    except TunneldConnectionError:
        rsd = None

    if rsd is None:
        return DeviceInfo(
            udid=udid,
            name=name,
            ios_version=ios_version,
            transport="rsd",
            status="tunnel_required",
            detail="Run 'sudo python3 -m pymobiledevice3 remote tunneld' and reconnect the device.",
        )

    return DeviceInfo(udid=udid, name=name, ios_version=ios_version, transport="rsd", status="ready")


async def get_device(udid: str) -> DeviceInfo:
    for device in await list_devices():
        if device.udid == udid:
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
