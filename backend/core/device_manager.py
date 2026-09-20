import asyncio
import ipaddress
import logging
import platform
import re
import socket
import subprocess
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from importlib.metadata import PackageNotFoundError, version

from packaging.version import Version
from pymobiledevice3.bonjour import browse_mobdev2, browse_remotepairing
from pymobiledevice3.exceptions import AlreadyMountedError, RemotePairingCompletedError, TunneldConnectionError
from pymobiledevice3.lockdown import LockdownClient, create_using_usbmux
from pymobiledevice3.remote import tunnel_service
from pymobiledevice3.remote.remote_service_discovery import RemoteServiceDiscoveryService
from pymobiledevice3.remote.tunnel_service import RemotePairingLockdownService, iter_remote_paired_identifiers
from pymobiledevice3.services.dvt.instruments.dvt_provider import DvtProvider
from pymobiledevice3.services.dvt.instruments.location_simulation import LocationSimulation
from pymobiledevice3.services.mobile_image_mounter import auto_mount
from pymobiledevice3.tunneld.api import _list_tunnels, get_tunneld_device_by_udid
from pymobiledevice3.usbmux import list_devices as usbmux_list_devices

from core import pairing_store
from core.direct_lockdown import create_direct_lockdown
from core.wireless_rsd import WiFiRsdTunnel
from models.schemas import DeviceConnectionType, DeviceInfo

logger = logging.getLogger(__name__)

IOS_17 = Version("17.0")
DEVICE_LIST_TIMEOUT_SECONDS = 5.0
DEVICE_DESCRIBE_TIMEOUT_SECONDS = 10.0

# All callers in a polling interval share one discovery operation. In
# particular, do not let a slow Network lockdown lookup start a second scan.
_device_scan_lock = asyncio.Lock()
_device_scan_task: asyncio.Task[list[DeviceInfo]] | None = None
_direct_addresses: dict[str, str] = {}
_direct_usb_present: set[str] = set()
_system_routes: set[str] = set()
_direct_rsd_tunnels: dict[str, WiFiRsdTunnel] = {}
_direct_rsd_devices: dict[str, DeviceInfo] = {}


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
    global _last_usb_discovery_diagnostic, _direct_usb_present, _system_routes
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
    _direct_usb_present = {
        device.serial.lower() for device in mux_devices
        if device.serial and _connection_type_from_mux(device) == "usb"
    }

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
                        direct_paired=pairing_store.exists(udid),
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
                        direct_paired=pairing_store.exists(udid),
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
                    direct_paired=pairing_store.exists(udid),
                )
            )

    _system_routes = {
        item.udid.lower() for item in devices
        if item.status == "ready" and item.connection_type != "wireless_direct"
    }

    # A healthy system USB or Wi-Fi route always has priority. Wireless Direct
    # is a fallback for phones that the system transport cannot currently use;
    # keeping it above a recovered Network route makes ordinary Wi-Fi location
    # commands reuse a stale Direct tunnel.
    for key in dict.fromkeys([*_direct_addresses, *_direct_rsd_devices]):
        ip = _direct_addresses.get(key)
        previous = next((item for item in devices if item.udid.lower() == key), None)
        if previous is not None and previous.status == "ready" and previous.connection_type != "wireless_direct":
            await _clear_direct_runtime(key)
            logger.info("System %s route available for %s; released Wireless Direct", previous.connection_type, key)
            continue
        try:
            if key in _direct_rsd_devices:
                direct = _direct_rsd_devices[key]
                if _direct_rsd_tunnels[key].rsd is None:
                    raise ConnectionError("Wi-Fi RSD tunnel closed")
            else:
                assert ip is not None
                direct = await asyncio.wait_for(_describe_direct(key, ip), timeout=DEVICE_DESCRIBE_TIMEOUT_SECONDS)
        except Exception:
            if previous is not None and previous.connection_type == "wifi" and previous.status == "ready":
                # A remembered Direct route must not replace a healthy system
                # Wi-Fi route after the phone changes networks. Keep pairing
                # credentials on disk, but release the dead runtime tunnel so
                # normal usbmux Wi-Fi remains immediately usable.
                await _clear_direct_runtime(key)
                logger.info("Wireless Direct unavailable for %s; using system Wi-Fi", key)
                continue
            direct = DeviceInfo(
                udid=previous.udid if previous else key,
                name=previous.name if previous else key,
                ios_version=previous.ios_version if previous else "unknown",
                transport="rsd" if key in _direct_rsd_devices else "lockdown",
                connection_type="wireless_direct",
                ip_address=ip,
                direct_paired=True,
                status="error",
                detail="無線直連已中斷。確認手機與電腦可互相連線後重試。",
            )
        devices = [item for item in devices if item.udid.lower() != key]
        devices.append(direct)

    known = {item.udid.lower() for item in devices}
    remote_paired = {identifier.lower(): identifier for identifier in iter_remote_paired_identifiers()}
    for udid in pairing_store.list_udids():
        if udid.lower() not in known:
            canonical_udid = remote_paired.get(udid.lower(), udid.upper() if "-" in udid else udid.upper())
            saved_ver = pairing_store.load_version(udid)
            is_rsd = (
                (saved_ver and Version(saved_ver) >= IOS_17)
                or (saved_ver is None and udid.lower() in remote_paired)
            )
            devices.append(DeviceInfo(
                udid=canonical_udid,
                name=canonical_udid,
                ios_version=saved_ver or "unknown",
                transport="rsd" if is_rsd else "lockdown",
                # Authorization is a stored capability, not an active route.
                # Do not make a disconnected USB/Wi-Fi phone appear to have
                # fallen back into Wireless Direct without an explicit connect.
                connection_type="unknown",
                direct_paired=True,
                status="error",
                detail="已授權，裝置目前離線",
            ))

    return devices


async def _describe_direct(udid: str, ip: str) -> DeviceInfo:
    async with await _connect_direct_tcp(udid, ip) as lockdown:
        return DeviceInfo(
            udid=lockdown.udid,
            name=lockdown.all_values.get("DeviceName", lockdown.udid),
            ios_version=lockdown.product_version,
            transport="lockdown",
            connection_type="wireless_direct",
            ip_address=ip,
            direct_paired=True,
            status="ready",
            detail="Direct TCP 定位通道已就緒。",
        )


async def _connect_direct_tcp(udid: str, ip: str) -> LockdownClient:
    record = pairing_store.load(udid)
    if record is None:
        raise ValueError("這台手機尚未在此電腦完成無線授權。")
    lockdown = await create_direct_lockdown(hostname=ip, udid=udid, pair_record=record)
    if not lockdown.paired or lockdown.udid.lower() != udid.lower():
        await lockdown.close()
        raise ValueError("無線連線的手機與已授權裝置不符，或授權已失效。")
    return lockdown


async def enable_direct_pairing(udid: str) -> None:
    global _device_scan_task
    async with await create_using_usbmux(serial=udid, connection_type="USB", autopair=False) as lockdown:
        if not lockdown.paired or lockdown.pair_record is None or lockdown.udid.lower() != udid.lower():
            raise ValueError("請用 USB 接上手機、解鎖並選擇信任此電腦。")
        modern = Version(lockdown.product_version) >= IOS_17
        if modern:
            # A RemotePairing file can still exist after the phone has rejected
            # its key. This happens, for example, after the phone restarts its
            # wireless pairing service while moving between networks. Merely
            # checking the filename then leaves the user permanently stuck.
            # Revalidate over the already trusted USB channel every time this
            # action is requested; autopair refreshes an invalid key in place.
            try:
                service = await RemotePairingLockdownService.create(lockdown)
                try:
                    try:
                        await service.connect(autopair=True)
                    except RemotePairingCompletedError:
                        # Pair setup closes the channel; reopen it to verify the
                        # record before exposing Wireless Direct as enabled.
                        await service.close()
                        service = await RemotePairingLockdownService.create(lockdown)
                        await service.connect(autopair=False)
                finally:
                    await service.close()
            except Exception as exc:
                raise ValueError("無法透過 USB 完成無線 RSD 授權。請解鎖手機、確認已信任此電腦後重試。") from exc
            if udid.lower() not in {identifier.lower() for identifier in iter_remote_paired_identifiers()}:
                raise ValueError("USB 無線 RSD 授權未產生可用的配對紀錄。請重新連接手機後重試。")
        if not await lockdown.get_enable_wifi_connections():
            await lockdown.set_enable_wifi_connections(True)
            if not await lockdown.get_enable_wifi_connections():
                raise RuntimeError("手機未啟用無線連線，請保持 USB 連接後重試。")
        # iOS 16's image mounter may close its service connection over Wi-Fi.
        # Prepare the Developer Disk Image while USB is available, then use
        # the already-mounted developer service over direct TCP.
        if not modern:
            await ensure_mounted(lockdown)
        pairing_store.save(udid, lockdown.pair_record)
        pairing_store.save_version(udid, lockdown.product_version)
        _device_scan_task = None


def _has_active_session(udid: str) -> bool:
    try:
        from core import device_session
        return device_session.has_session(udid)
    except Exception:
        return False


async def has_blocking_session(udid: str) -> bool:
    """Return whether a healthy location session must block transport changes.

    A network change closes the Wi-Fi RSD tunnel asynchronously. Its location
    session can remain in the registry until the next location command tries
    to use it. Treating that dead session as active prevents the same phone
    from being probed at its new IP, so release only this demonstrably stale
    state before reconnecting. Healthy sessions continue to block switching.
    """
    if not _has_active_session(udid):
        return False

    key = udid.lower()
    tunnel = _direct_rsd_tunnels.get(key)
    if tunnel is None or tunnel.rsd is not None:
        return True

    from core import device_session

    await device_session.close_session(udid)
    await disconnect_direct(udid)
    logger.info("Released stale Wireless Direct session for %s before reconnect", udid)
    return False


async def _connect_direct_rsd(udid: str, ip: str | None = None, fallback_bonjour: bool = True, port: int = 49152) -> DeviceInfo:
    global _device_scan_task
    if not pairing_store.exists(udid):
        raise ValueError("請先用 USB 在裝置管理設定無線授權。")
    if await has_blocking_session(udid):
        raise ValueError("請先停止並還原目前的定位，再切換連線方式。")

    await disconnect_direct(udid)
    tunnel = WiFiRsdTunnel(serial=udid, ip=ip, autopair=False, fallback_bonjour=fallback_bonjour, port=port)
    try:
        rsd = await asyncio.wait_for(tunnel.aopen(), timeout=25)
        if rsd.udid.lower() != udid.lower():
            raise ValueError("無線 RSD 通道連到不同的手機。")
        async with DvtProvider(rsd) as dvt:
            async with LocationSimulation(dvt):
                pass

        actual_ip = getattr(tunnel, "peer_ip", None) or ip
        device = DeviceInfo(
            udid=rsd.udid,
            name=rsd.name or rsd.udid,
            ios_version=rsd.product_version,
            transport="rsd",
            connection_type="wireless_direct",
            direct_paired=True,
            ip_address=actual_ip,
            status="ready",
            detail="無線 RSD 定位通道已就緒。",
        )
        pairing_store.save_version(udid, rsd.product_version)
        if actual_ip and not actual_ip.startswith("127."):
            try:
                pairing_store.save_address(udid, actual_ip)
                _direct_addresses[udid.lower()] = actual_ip
            except Exception as e:
                logger.warning("Failed to save direct address %s for %s: %s", actual_ip, udid, e)
        _direct_rsd_tunnels[udid.lower()] = tunnel
        _direct_rsd_devices[udid.lower()] = device
        _device_scan_task = None
        return device
    except ValueError:
        await tunnel.aclose()
        raise
    except Exception as exc:
        await tunnel.aclose()
        raise ValueError(f"無線 RSD 連線失敗：{type(exc).__name__}。請確認同一 Wi-Fi、手機已解鎖，然後重試。") from exc
    except BaseException:
        await tunnel.aclose()
        raise


async def connect_direct(udid: str, ip: str | None = None, fallback_bonjour: bool = True, port: int = 49152) -> DeviceInfo:
    global _device_scan_task

    # Handle auto / unspecified udid when ip is provided
    if not udid or udid.lower() == "auto":
        if not ip:
            raise ValueError("未指定目標裝置 UDID，請提供 IP 位址以進行配對搜尋。")

        matched_udid: str | None = None

        # 1. Non-destructively probe iOS 17+ paired devices
        # A healthy session protects ongoing navigation. A tunnel that the
        # watcher already marked closed is released so this phone can be
        # matched again after DHCP assigns it a new address.
        ios17_cands = list(iter_remote_paired_identifiers())
        ios17_cands.sort(key=lambda c: 0 if pairing_store.load_address(c) == ip else 1)

        async def probe_remote_pairing(cand: str):
            # Endpoint selection only verifies an existing authorization.
            # Pair setup belongs on the trusted USB channel so a failed Wi-Fi
            # probe cannot replace credentials behind the user's back.
            return await asyncio.wait_for(
                tunnel_service.create_core_device_tunnel_service_using_remotepairing(
                    cand, ip, port, autopair=False
                ),
                timeout=3.0,
            )

        for cand in ios17_cands:
            if await has_blocking_session(cand):
                logger.info("Candidate %s has an active navigation session, skipping probe", cand)
                continue
            try:
                provider = await probe_remote_pairing(cand)
                await provider.close()
                matched_udid = cand
                break
            except Exception:
                continue

        # A stale key can only be repaired over the trusted USB lockdown
        # channel. If exactly one USB phone is present, retry on the error
        # screen performs that repair automatically and verifies this IP again.
        if not matched_udid:
            try:
                mux_devices = await asyncio.wait_for(usbmux_list_devices(), timeout=DEVICE_LIST_TIMEOUT_SECONDS)
                usb_udids = [
                    device.serial for device in mux_devices
                    if device.serial and _connection_type_from_mux(device) == "usb"
                ]
            except Exception:
                usb_udids = []
            if len(usb_udids) == 1 and not await has_blocking_session(usb_udids[0]):
                usb_udid = usb_udids[0]
                try:
                    await enable_direct_pairing(usb_udid)
                    provider = await probe_remote_pairing(usb_udid)
                    await provider.close()
                    matched_udid = usb_udid
                except Exception:
                    logger.exception("USB RemotePairing refresh did not unlock endpoint %s", ip)

        # 2. Non-destructively probe iOS 16 paired devices
        if not matched_udid:
            ios16_cands = pairing_store.list_udids()
            ios16_cands.sort(key=lambda c: 0 if pairing_store.load_address(c) == ip else 1)
            for cand in ios16_cands:
                if await has_blocking_session(cand):
                    logger.info("iOS 16 candidate %s has an active session, skipping probe", cand)
                    continue
                try:
                    await asyncio.wait_for(_describe_direct(cand, ip), timeout=2.0)
                    async with await _connect_direct_tcp(cand, ip) as lockdown:
                        service = await asyncio.wait_for(
                            lockdown.start_lockdown_developer_service("com.apple.dt.simulatelocation"), timeout=2.5
                        )
                        await service.close()
                    matched_udid = cand
                    break
                except Exception:
                    continue

        if not matched_udid:
            # A failed switch must not leave its idle predecessor displayed as
            # Wireless Direct and prevent a healthy usbmux Wi-Fi route from
            # taking over. Active navigation sessions remain protected.
            for active_udid in list(_direct_rsd_tunnels):
                if not _has_active_session(active_udid):
                    await disconnect_direct(active_udid)
            raise ValueError(
                f"已找到 {ip}，但手機拒絕目前的 Wireless Direct 授權。"
                "請用 USB 接上這台手機並解鎖，然後直接按「重新連線」以刷新授權。"
            )

        if await has_blocking_session(matched_udid):
            raise ValueError(f"裝置 {matched_udid} 正在執行導航或定位模擬，請先停止定位再切換連線。")

        udid = matched_udid

    if await has_blocking_session(udid):
        raise ValueError("請先停止並還原目前的定位，再切換連線方式。")

    saved_version = pairing_store.load_version(udid)
    is_ios17 = (saved_version and Version(saved_version) >= IOS_17) or (
        saved_version is None and udid.lower() in {identifier.lower() for identifier in iter_remote_paired_identifiers()}
    )

    if is_ios17:
        if ip is not None:
            # Try specified IP first with strict IP match (no fallback to other devices via Bonjour)
            try:
                return await _connect_direct_rsd(udid, ip=ip, fallback_bonjour=False, port=port)
            except Exception as first_exc:
                if not fallback_bonjour:
                    raise
                logger.info("Direct RSD connect to %s failed, falling back to Bonjour discovery: %s", ip, first_exc)
        if not fallback_bonjour and ip is not None:
            raise ValueError(f"無法在 {ip} 連線至裝置 {udid}。")
        # Fallback to Bonjour discovery specifically for this verified udid
        return await _connect_direct_rsd(udid, ip=None, fallback_bonjour=True)

    # iOS 16 fallback / multi-address path
    if ip and not fallback_bonjour:
        candidate_addresses = [ip]
    else:
        cached = pairing_store.load_address(udid)
        candidate_addresses: list[str] = []
        if ip:
            candidate_addresses.append(ip)
        if cached and cached not in candidate_addresses:
            candidate_addresses.append(cached)

        try:
            services = await browse_mobdev2(timeout=2)
        except OSError:
            services = []
        for service in services:
            for address in service.addresses:
                ip_str = getattr(address, "ip", None) or str(address)
                if "." in ip_str and not ip_str.startswith("127.") and ip_str not in candidate_addresses:
                    candidate_addresses.append(ip_str)

        # Also add addresses from _discovered_direct_endpoints
        for ep_info in _discovered_direct_endpoints.values():
            ep_ip = ep_info.get("ip")
            if ep_ip and ep_ip not in candidate_addresses:
                candidate_addresses.append(ep_ip)

    for address in candidate_addresses[:8]:
        try:
            device = await asyncio.wait_for(_describe_direct(udid, address), timeout=3.0)
        except (OSError, TimeoutError, ValueError) as exc:
            if not fallback_bonjour and ip is not None:
                raise ValueError(f"無法在 {ip} 連線至裝置 {udid}。請確認同一 Wi-Fi 與手機解鎖狀態。") from exc
            continue
        if Version(device.ios_version) >= IOS_17:
            return await _connect_direct_rsd(udid, ip=address, fallback_bonjour=fallback_bonjour)
        try:
            async with await _connect_direct_tcp(udid, address) as lockdown:
                service = await asyncio.wait_for(
                    lockdown.start_lockdown_developer_service("com.apple.dt.simulatelocation"), timeout=4.0
                )
                await service.close()
        except Exception as exc:
            raise ValueError("TCP 已連線，但手機的定位服務尚未就緒。請重新接上 USB 並更新無線授權。") from exc
        pairing_store.save_address(udid, address)
        _direct_addresses[udid.lower()] = address
        _device_scan_task = None
        return device

    if not fallback_bonjour and ip is not None:
        raise ValueError(f"無法在 {ip} 連線至裝置 {udid}。")
    raise ValueError("找不到已授權的手機。請確認手機已連上同一 Wi-Fi，且螢幕已解鎖。")


async def disconnect_direct(udid: str) -> None:
    global _device_scan_task
    await _clear_direct_runtime(udid)
    _device_scan_task = None


async def _clear_direct_runtime(udid: str) -> None:
    """Release an active Direct route without deleting its saved authorization."""
    key = udid.lower()
    _direct_addresses.pop(key, None)
    _direct_rsd_devices.pop(key, None)
    tunnel = _direct_rsd_tunnels.pop(key, None)
    if tunnel is not None:
        await tunnel.aclose()


_discovered_direct_endpoints: dict[str, dict] = {}


def direct_address(udid: str) -> str | None:
    return _direct_addresses.get(udid.lower())


def _normalize_mac(mac: str) -> str:
    parts = mac.lower().replace("-", ":").split(":")
    return ":".join(f"{int(p, 16):02x}" for p in parts if p)


def _get_arp_map_sync() -> dict[str, str]:
    arp_mac_to_ip: dict[str, str] = {}
    try:
        # Windows prints `IP  aa-bb-cc-dd-ee-ff  dynamic`; macOS prints
        # `name (IP) at aa:bb:cc:dd:ee:ff`. ARP only supplements mDNS.
        windows = platform.system() == "Windows"
        out = subprocess.check_output(["arp", "-a" if windows else "-an"], text=True, stderr=subprocess.DEVNULL, timeout=1.5)
        for line in out.splitlines():
            m = (re.search(r"^\s*([\d.]+)\s+([0-9a-fA-F-]{17})\s+", line)
                 if windows else re.search(r"\(([\d\.]+)\)\s+at\s+([0-9a-fA-F:]+)", line))
            if m:
                arp_mac_to_ip[_normalize_mac(m.group(2))] = m.group(1)
    except Exception:
        pass
    return arp_mac_to_ip


async def _get_arp_map_async() -> dict[str, str]:
    try:
        return await asyncio.wait_for(asyncio.to_thread(_get_arp_map_sync), timeout=2.0)
    except Exception:
        return {}


def _resolve_host_ips_sync(host: str) -> list[str]:
    try:
        return [
            ai[4][0]
            for ai in socket.getaddrinfo(host, None, socket.AF_INET)
            if not ai[4][0].startswith("127.")
        ]
    except Exception:
        return []


async def _resolve_host_ips_async(host: str) -> list[str]:
    try:
        return await asyncio.wait_for(asyncio.to_thread(_resolve_host_ips_sync, host), timeout=1.0)
    except Exception:
        return []


def _ping_tcp_sync(ip: str, port: int = 49152) -> bool:
    try:
        with socket.create_connection((ip, port), timeout=0.25):
            return True
    except Exception:
        return False


async def _ping_tcp_async(ip: str, port: int = 49152) -> bool:
    try:
        return await asyncio.wait_for(asyncio.to_thread(_ping_tcp_sync, ip, port), timeout=0.5)
    except Exception:
        return False


async def _browse_dns_sd_services(service_type: str, duration: float = 1.0) -> list[str]:
    instances: list[str] = []
    try:
        proc = await asyncio.create_subprocess_exec(
            "dns-sd", "-B", service_type, "local",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        end_time = asyncio.get_event_loop().time() + duration
        while True:
            rem = end_time - asyncio.get_event_loop().time()
            if rem <= 0:
                break
            try:
                line = await asyncio.wait_for(proc.stdout.readline(), timeout=rem)
                if not line:
                    break
                text = line.decode(errors="ignore")
                parts = text.strip().split()
                if len(parts) >= 7 and parts[1] == "Add":
                    name = " ".join(parts[6:])
                    if name not in instances:
                        instances.append(name)
            except asyncio.TimeoutError:
                break
        try:
            proc.kill()
            await proc.wait()
        except Exception:
            pass
    except Exception:
        pass
    return instances


async def _resolve_dns_sd_instance(instance: str, service_type: str, duration: float = 0.8) -> tuple[str | None, int]:
    host = None
    port = 49152
    try:
        proc = await asyncio.create_subprocess_exec(
            "dns-sd", "-L", instance, service_type, "local",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        end_time = asyncio.get_event_loop().time() + duration
        while True:
            rem = end_time - asyncio.get_event_loop().time()
            if rem <= 0:
                break
            try:
                line = await asyncio.wait_for(proc.stdout.readline(), timeout=rem)
                if not line:
                    break
                text = line.decode(errors="ignore")
                m = re.search(r"can be reached at ([^:]+):(\d+)", text)
                if m:
                    host = m.group(1).rstrip(".")
                    port = int(m.group(2))
                    break
            except asyncio.TimeoutError:
                break
        try:
            proc.kill()
            await proc.wait()
        except Exception:
            pass
    except Exception:
        pass
    return host, port


async def list_direct_endpoints() -> list[dict]:
    # Build a fresh snapshot for this scan round to prevent ghost endpoints
    scan_endpoints: dict[str, dict] = {}
    arp_map = await _get_arp_map_async()

    # pymobiledevice3 11.3.1 already has a DNS-SD browser that retains the
    # advertised port and the interface scope for IPv6 link-local addresses.
    # Windows has no system `dns-sd` command, so use that browser directly.
    if platform.system() == "Windows":
        try:
            services = await asyncio.wait_for(browse_remotepairing(timeout=1.0), timeout=1.5)
            paired = {identifier.lower(): identifier for identifier in iter_remote_paired_identifiers()}
            for service in services:
                instance = re.split(r"\._remotepairing\._tcp\.local\.?$", service.instance, flags=re.IGNORECASE)[0]
                verified_udid = paired.get(instance.lower())
                for address in service.addresses:
                    ip = address.full_ip
                    if ":" in ip and "%" in ip:
                        host, scope = ip.rsplit("%", 1)
                        if not scope.isdecimal():
                            try:
                                # Windows sockets normally use a numeric IPv6
                                # interface index, while mDNS may return a name.
                                ip = f"{host}%{socket.if_nametoindex(scope)}"
                            except OSError:
                                logger.debug("Could not map IPv6 interface %s to an index", scope)
                    if ip.startswith("127."):
                        continue
                    port = service.port
                    endpoint = f"[{ip}]:{port}" if ":" in ip else f"{ip}:{port}"
                    scan_endpoints[endpoint] = {
                        "udid": verified_udid,
                        "ip": ip,
                        "port": port,
                        "endpoint": endpoint,
                        "source": "remotepairing",
                        "status": "history" if ip.startswith("169.254.") else "online",
                        "last_connected": None,
                        "device_name": service.host.removesuffix(".local") if service.host else None,
                        "ios_version": "unknown",
                    }
        except Exception as exc:
            logger.debug("RemotePairing mDNS browse failed: %s", exc)

    # 1. Native macOS dns-sd discovery
    if platform.system() == "Darwin":
        try:
            rp_insts = await _browse_dns_sd_services("_remotepairing._tcp", duration=1.0)

            # Known paired identifiers to strictly verify DNS-SD instance names
            rp_paired_identifiers = {i.lower(): i for i in iter_remote_paired_identifiers()}
            known_udids = {u.lower(): u for u in pairing_store.list_udids()}

            # Resolve remotepairing services
            for inst in rp_insts:
                host, port = await _resolve_dns_sd_instance(inst, "_remotepairing._tcp")
                if host:
                    dev_name = host.replace(".local", "")
                    ips = await _resolve_host_ips_async(host)
                    verified_udid = rp_paired_identifiers.get(inst.lower()) or known_udids.get(inst.lower())
                    for ip in ips:
                        # RemotePairing publishes its current listener port in
                        # the SRV record. It can change when the phone leaves a
                        # hotspot and joins another Wi-Fi network, so carrying
                        # the old/default 49152 here makes the new IP unusable.
                        ep_str = f"{ip}:{port}"
                        is_link_local = ip.startswith("169.254.")
                        scan_endpoints[ep_str] = {
                            "udid": verified_udid,
                            "ip": ip,
                            "port": port,
                            "endpoint": ep_str,
                            "source": "remotepairing",
                            "status": "history" if is_link_local else "online",
                            "last_connected": None,
                            "device_name": dev_name,
                            "ios_version": "unknown",
                        }

        except Exception as e:
            logger.debug("Native dns-sd browse failed: %s", e)

    # 2. pymobiledevice3 browse_mobdev2
    try:
        services = await asyncio.wait_for(browse_mobdev2(timeout=1.0), timeout=1.5)
        for service in services:
            dev_name = service.host.replace(".local", "") if getattr(service, "host", None) else None
            txt_props = getattr(service, "properties", {}) or {}
            identifier = txt_props.get("identifier")
            saved_version = pairing_store.load_version(identifier) if identifier else None
            # mobdev2 advertises ordinary lockdown Wi-Fi, not an iOS 17+
            # RemotePairing listener. Only expose it for a known, authorized
            # pre-iOS-17 phone; otherwise it becomes a false green :49152 row.
            if not identifier or not saved_version or Version(saved_version) >= IOS_17:
                continue
            service_port = int(getattr(service, "port", 62078) or 62078)
            for address in getattr(service, "addresses", []):
                try:
                    ip_str = getattr(address, "ip", None) or str(address)
                    if "." in ip_str and not ip_str.startswith("127."):
                        ep_str = f"{ip_str}:{service_port}"
                        is_link_local = ip_str.startswith("169.254.")
                        if ep_str not in scan_endpoints:
                            scan_endpoints[ep_str] = {
                                "udid": identifier,
                                "ip": ip_str,
                                "port": service_port,
                                "endpoint": ep_str,
                                "source": "mobdev2",
                                "status": "history" if is_link_local else "online",
                                "last_connected": None,
                                "device_name": dev_name,
                                "ios_version": "unknown",
                            }
                        else:
                            if dev_name and not scan_endpoints[ep_str].get("device_name"):
                                scan_endpoints[ep_str]["device_name"] = dev_name
                            if identifier and not scan_endpoints[ep_str].get("udid"):
                                scan_endpoints[ep_str]["udid"] = identifier
                except Exception:
                    continue
    except Exception as e:
        logger.debug("browse_mobdev2 failed: %s", e)

    # 3. Assemble results from fresh scan
    endpoints: list[dict] = list(scan_endpoints.values())
    seen_endpoints = set(scan_endpoints.keys())

    # 4. Pairing store historical records
    for udid in pairing_store.list_udids():
        addr = pairing_store.load_address(udid)
        ver = pairing_store.load_version(udid)
        if addr:
            mtime_iso = None
            try:
                addr_path = pairing_store._path(udid).with_suffix(".address")
                if addr_path.is_file():
                    dt = datetime.fromtimestamp(addr_path.stat().st_mtime, tz=timezone.utc)
                    mtime_iso = dt.isoformat()
            except Exception:
                pass
            ep_str = f"{addr}:49152"
            if ep_str not in seen_endpoints:
                is_link_local = addr.startswith("169.254.")
                reachable = is_link_local or await _ping_tcp_async(addr, 49152)
                if not reachable:
                    continue

                seen_endpoints.add(ep_str)
                endpoints.append({
                    "udid": udid,
                    "ip": addr,
                    "port": 49152,
                    "endpoint": ep_str,
                    "source": "paired",
                    "status": "history",
                    "last_connected": mtime_iso,
                    "device_name": None,
                    "ios_version": ver or "unknown",
                })
            else:
                for ep in endpoints:
                    if ep["endpoint"] == ep_str:
                        if not ep.get("last_connected") and mtime_iso:
                            ep["last_connected"] = mtime_iso
                        if ver and ep.get("ios_version") == "unknown":
                            ep["ios_version"] = ver

    # Update global cache with fresh snapshot
    _discovered_direct_endpoints.clear()
    _discovered_direct_endpoints.update(scan_endpoints)

    # Sort: "online" (green) first, then "history" (orange)
    endpoints.sort(key=lambda x: (0 if x.get("status") == "online" else 1, x.get("endpoint", "")))
    return endpoints


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
            direct_paired=pairing_store.exists(udid),
        )

    if not tunnel_udids or udid.lower() not in {known_udid.lower() for known_udid in tunnel_udids}:
        return DeviceInfo(
            udid=udid,
            name=name,
            ios_version=ios_version,
            transport="rsd",
            connection_type=connection_type,
            status="tunnel_required",
            direct_paired=pairing_store.exists(udid),
            detail="Run 'sudo python3 -m pymobiledevice3 remote tunneld' and reconnect the device.",
        )

    return DeviceInfo(
        udid=udid,
        name=name,
        ios_version=ios_version,
        transport="rsd",
        connection_type=connection_type,
        status="ready",
        direct_paired=pairing_store.exists(udid),
    )


async def get_device(udid: str) -> DeviceInfo:
    # Refresh route ownership before choosing a transport. The scan preserves
    # Direct when no system route exists and clears it when USB/Network has
    # recovered, so location commands cannot be trapped by an old selection.
    for device in await list_devices():
        if device.udid.lower() == udid.lower():
            return device
    raise ValueError(f"Device not found: {udid}")


async def get_lockdown(udid: str) -> LockdownClient:
    if udid.lower() in _system_routes:
        return await create_using_usbmux(serial=udid)
    ip = direct_address(udid)
    if ip is not None:
        # Route from the last discovery snapshot. A direct location command
        # must not call usbmuxd/AMDS when no USB device is present.
        if udid.lower() in _direct_usb_present:
            return await create_using_usbmux(serial=udid, connection_type="USB")
        return await _connect_direct_tcp(udid, ip)
    return await create_using_usbmux(serial=udid)


async def get_rsd(udid: str) -> RemoteServiceDiscoveryService:
    key = udid.lower()

    # Any healthy system route has priority once discovery confirms it. This
    # covers both USB and ordinary Network Wi-Fi and prevents a live but stale
    # Direct object from hijacking the original Wi-Fi location path.
    if key in _system_routes or key in _direct_usb_present:
        rsd = await get_tunneld_device_by_udid(udid)
        if rsd is not None:
            return rsd

    if key in _direct_rsd_tunnels:
        rsd = _direct_rsd_tunnels[key].rsd
        if rsd is None:
            raise RuntimeError("無線 RSD 連線已中斷，請在裝置管理重新連線。")
        return rsd
    rsd = await get_tunneld_device_by_udid(udid)
    if rsd is None:
        raise RuntimeError(
            "No active tunnel for this device. Run 'sudo python3 -m pymobiledevice3 remote tunneld' first."
        )
    return rsd


async def ensure_mounted(lockdown: LockdownClient) -> None:
    try:
        await auto_mount(lockdown)
    except AlreadyMountedError:
        pass
