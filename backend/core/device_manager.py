import asyncio
import logging

from packaging.version import Version
from pymobiledevice3.bonjour import browse_mobdev2
from pymobiledevice3.exceptions import AlreadyMountedError
from pymobiledevice3.lockdown import LockdownClient, create_using_usbmux
from pymobiledevice3.pair_records import iter_remote_paired_identifiers
from pymobiledevice3.remote import tunnel_service
from pymobiledevice3.remote.remote_service_discovery import RemoteServiceDiscoveryService
from pymobiledevice3.remote.tunnel_service import RemotePairingLockdownService
from pymobiledevice3.services.dvt.instruments.dvt_provider import DvtProvider
from pymobiledevice3.services.dvt.instruments.location_simulation import LocationSimulation
from pymobiledevice3.services.mobile_image_mounter import auto_mount
from pymobiledevice3.tunneld.api import _list_tunnels, get_tunneld_device_by_udid
from pymobiledevice3.usbmux import list_devices as usbmux_list_devices

from core.discovery import direct_endpoint_scanner
from core.discovery.system_wifi_scanner import system_wifi_scanner
from core.discovery.usb_scanner import usb_scanner
from core.direct_lockdown import create_direct_lockdown
from core.device_ports import CallbackDiscoveryPort, DiscoverySnapshot, DiscoverySourceResult
from core.device_aggregate import AuthorizationState, DirectRuntimeState, SessionState
from core.device_discovery_coordinator import DeviceDiscoveryCoordinator
from core.device_registry import device_registry
from core.device_revision import device_revision_ledger
from core.device_session_state import publish_session_state
from core.device_session_store import device_session_store
from core.device_service import DeviceManagementService
from core.transport.direct_rsd_adapter import DirectRsdAdapter
from core.transport.direct_tcp_adapter import DirectTcpAdapter
from core.transport.system_wifi_adapter import SystemWifiTransportAdapter
from core.transport.usb_adapter import UsbTransportAdapter
from core.keyed_async_lock import device_command_locks
from core.pairing_manager import pairing_manager
from core.transport_controller import TransportController
from core.wireless_rsd import WiFiRsdTunnel
from models.schemas import DeviceConnectionType, DeviceInfo

logger = logging.getLogger(__name__)

IOS_17 = Version("17.0")
DEVICE_LIST_TIMEOUT_SECONDS = 5.0
DEVICE_DESCRIBE_TIMEOUT_SECONDS = 10.0

_direct_transport_adapter = DirectRsdAdapter(lambda **kwargs: WiFiRsdTunnel(**kwargs))
_direct_tcp_adapter = DirectTcpAdapter(
    pairing_manager,
    lambda **kwargs: create_direct_lockdown(**kwargs),
)
_usb_transport_adapter = UsbTransportAdapter(
    usb_scanner,
    lambda **kwargs: create_using_usbmux(**kwargs),
    lambda udid: get_tunneld_device_by_udid(udid),
)
_system_wifi_transport_adapter = SystemWifiTransportAdapter(
    lambda **kwargs: create_using_usbmux(**kwargs),
    lambda udid: get_tunneld_device_by_udid(udid),
)


async def _legacy_discovery_snapshot() -> DiscoverySnapshot:
    """Expose the legacy scanner through the new immutable read contract."""
    # Capture before any I/O. A command that completes while this scan is in
    # flight must have a newer revision than this eventual response.
    revision = device_revision_ledger.capture()
    devices = await _scan_devices()
    usb_diagnostic = get_usb_discovery_diagnostic()
    return DiscoverySnapshot(
        devices=tuple(devices),
        sources={
            "usb": (
                DiscoverySourceResult("failed", usb_diagnostic["message"])
                if usb_diagnostic is not None
                else DiscoverySourceResult("success")
            ),
            "system_wifi": system_wifi_scanner.last_result,
            "direct_endpoints": DiscoverySourceResult("not_requested"),
        },
        snapshot_revision=revision.snapshot_revision,
        device_revisions=revision.device_revisions,
    )


# The facade composes dedicated discovery adapters. Registry owns production
# reads, and the controller owns every destructive Direct action.
_device_management_service = DeviceManagementService(CallbackDiscoveryPort(_legacy_discovery_snapshot))
transport_controller = TransportController(
    _direct_transport_adapter,
    device_registry,
    device_revision_ledger,
    device_command_locks,
    _device_management_service.invalidate,
)
_device_discovery_coordinator = DeviceDiscoveryCoordinator(
    _legacy_discovery_snapshot,
    device_registry,
    on_published=transport_controller.apply_policy_effects,
)


async def start_device_discovery() -> None:
    await _device_discovery_coordinator.start()


async def stop_device_discovery() -> None:
    await _device_discovery_coordinator.stop()


async def shutdown_device_transports() -> None:
    await transport_controller.shutdown()


async def refresh_device_discovery() -> None:
    if _device_discovery_coordinator.started:
        await _device_discovery_coordinator.refresh_once()
        return
    _device_management_service.invalidate()


async def _wait_for_registry() -> None:
    if _device_discovery_coordinator.started:
        await _device_discovery_coordinator.wait_ready()


def get_usb_discovery_diagnostic() -> dict[str, str] | None:
    """Return the latest USB discovery failure without starting another scan."""
    return usb_scanner.diagnostic()


async def list_devices(include_wifi: bool = True) -> list[DeviceInfo]:
    if _device_discovery_coordinator.started:
        await _wait_for_registry()
        return list(device_registry.projected_snapshot(include_wifi=include_wifi).devices)
    return await _device_management_service.list_devices(include_wifi=include_wifi)


async def get_device_snapshot(include_wifi: bool = True) -> DiscoverySnapshot:
    if _device_discovery_coordinator.started:
        await _wait_for_registry()
        return device_registry.projected_snapshot(include_wifi=include_wifi)
    return await _device_management_service.projected_snapshot(include_wifi=include_wifi)


def _connection_type_from_mux(mux_device: object) -> DeviceConnectionType | None:
    return usb_scanner.connection_type(mux_device)


async def _scan_devices() -> list[DeviceInfo]:
    devices: list[DeviceInfo] = []
    seen_udids: set[str] = set()

    # Do not use get_tunneld_devices() for discovery. It opens an RSD connection
    # for every tunnel it finds; a periodic scan would therefore leave extra
    # iOS 17 developer-service connections alive and can interfere with the
    # single RSD connection that owns location simulation.
    tunnel_udids = await _list_tunnel_udids()
    mux_devices, usb_result = await usb_scanner.scan(usbmux_list_devices, timeout=DEVICE_LIST_TIMEOUT_SECONDS)
    if usb_result.status == "failed":
        logger.error("USB device discovery failed; returning tunnel-only results: %s", usb_result.detail)

    # Sort USB connections before Network connections so USB is preferred if both exist.
    mux_devices = sorted(mux_devices, key=lambda d: 0 if _connection_type_from_mux(d) == "usb" else 1)
    for mux_device in mux_devices:
        udid = mux_device.serial
        if not udid or udid.lower() in seen_udids:
            continue
        seen_udids.add(udid.lower())
        connection_type = _connection_type_from_mux(mux_device)
        if connection_type is None:
            # The device list contract only exposes routes that can be named
            # and selected. An unrecognized usbmux transport is not actionable.
            continue
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
                        direct_paired=pairing_manager.exists(udid),
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
                        direct_paired=pairing_manager.exists(udid),
                    )
                )

    # A tunneld-only identifier does not reveal whether its physical source is
    # USB or system Wi-Fi. Keep it as source health evidence only; publishing a
    # selectable row here would invent a route and violate D2/D9.

    # Build the selected-route projection without changing transport state.
    # USB wins while idle, and a healthy explicitly selected Direct route wins
    # over ordinary Wi-Fi.  Discovery must never close either runtime.
    for key in dict.fromkeys([
        *_direct_transport_adapter.addresses,
        *_direct_transport_adapter.rsd_devices,
    ]):
        ip = _direct_transport_adapter.addresses.get(key)
        previous = next((item for item in devices if item.udid.lower() == key), None)
        if previous is not None and previous.status == "ready" and previous.connection_type == "usb":
            continue

        if key in _direct_transport_adapter.rsd_devices:
            tunnel = _direct_transport_adapter.rsd_tunnels.get(key)
            # The tunnel watcher is authoritative for RSD lifecycle.  A closed
            # tunnel stops being selected, but cleanup is left to a command or
            # session failure handler instead of this read path.
            if tunnel is None or tunnel.rsd is None:
                continue
            direct = _direct_transport_adapter.rsd_devices[key]
        else:
            # A Direct TCP address is only stored after an explicit successful
            # connection.  Re-probing it from a GET made a transient timeout
            # destructive; project the known runtime until real I/O fails.
            assert ip is not None
            if previous is not None:
                direct = previous.model_copy(
                    update={
                        "connection_type": "wireless_direct",
                        "ip_address": ip,
                        "direct_paired": True,
                        "status": "ready",
                        "detail": "Direct TCP 定位通道已就緒。",
                    }
                )
            else:
                direct = DeviceInfo(
                    udid=key,
                    name=key,
                    ios_version=pairing_manager.load_version(key) or "unknown",
                    transport="lockdown",
                    connection_type="wireless_direct",
                    ip_address=ip,
                    direct_paired=True,
                    status="ready",
                    detail="Direct TCP 定位通道已就緒。",
                )
        devices = [item for item in devices if item.udid.lower() != key]
        devices.append(direct)

    return devices


async def _describe_direct(udid: str, ip: str) -> DeviceInfo:
    return await _direct_tcp_adapter.describe(udid, ip)


async def _connect_direct_tcp(udid: str, ip: str) -> LockdownClient:
    return await _direct_tcp_adapter.connect(udid, ip)


async def enable_direct_pairing(udid: str) -> None:
    await pairing_manager.enable(
        udid,
        create_usb_lockdown=create_using_usbmux,
        create_remote_service=RemotePairingLockdownService.create,
        remote_identifiers=iter_remote_paired_identifiers,
        ensure_mounted=ensure_mounted,
    )
    revision = device_revision_ledger.bump(udid)
    device_registry.record_authorization(
        udid,
        AuthorizationState.PAIRED,
        revision=revision,
        legacy_route=None,
    )
    _device_management_service.invalidate()


def _has_active_session(udid: str) -> bool:
    return device_session_store.has(udid)


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
    tunnel = _direct_transport_adapter.rsd_tunnels.get(key)
    if tunnel is None or tunnel.rsd is not None:
        return True

    session = device_session_store.pop(udid)
    if session is not None:
        await session.close()
        publish_session_state(udid, SessionState.IDLE, None, compare_legacy=False)
        await transport_controller.apply_policy_effects()
    current = device_registry.get(udid)
    if current is None or current.direct_runtime != DirectRuntimeState.DISCONNECTED:
        await transport_controller.cleanup_failed_direct(udid)
    logger.info("Released stale Wireless Direct session for %s before reconnect", udid)
    return False


async def _connect_direct_rsd(udid: str, ip: str | None = None, fallback_bonjour: bool = True, port: int = 49152) -> DeviceInfo:
    if not pairing_manager.exists(udid):
        raise ValueError("請先用 USB 在裝置管理設定無線授權。")
    tunnel = None
    try:
        tunnel, rsd = await _direct_transport_adapter.open_rsd(
            udid,
            ip=ip,
            fallback_bonjour=fallback_bonjour,
            port=port,
        )
        if rsd.udid.lower() != udid.lower():
            raise ValueError("無線 RSD 通道連到不同的手機。")
        async with DvtProvider(rsd) as dvt:
            async with LocationSimulation(dvt):
                pass

        actual_ip = getattr(tunnel, "peer_ip", None) or ip
        actual_port = getattr(tunnel, "peer_port", None) or port
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
        pairing_manager.save_version(udid, rsd.product_version)
        if actual_ip and not actual_ip.startswith("127."):
            try:
                pairing_manager.save_address(udid, actual_ip)
                # The RemotePairing listener is advertised by DNS-SD and can
                # change across networks or restarts. Persist it with the IP;
                # never reconstruct an iOS 17+ endpoint using a fixed 49152.
                pairing_manager.save_port(udid, actual_port)
                _direct_transport_adapter.install_address(udid, actual_ip)
            except Exception as e:
                logger.warning("Failed to save direct address %s for %s: %s", actual_ip, udid, e)
        _direct_transport_adapter.install_rsd(udid, tunnel, device)
        _device_management_service.invalidate()
        return device
    except ValueError:
        if tunnel is not None:
            await _direct_transport_adapter.close_candidate(tunnel)
        raise
    except Exception as exc:
        if tunnel is not None:
            await _direct_transport_adapter.close_candidate(tunnel)
        raise ValueError(
            f"無線 RSD 連線失敗：{type(exc).__name__}。請確認同一 Wi-Fi、手機已解鎖。"
            "若端點已出現仍無法連線，請用 USB 接上該手機後按「重新連線」刷新授權。"
        ) from exc
    except BaseException:
        if tunnel is not None:
            await _direct_transport_adapter.close_candidate(tunnel)
        raise


async def _resolve_direct_target_udid(ip: str, port: int = 49152) -> str:
    """Identify one authorized endpoint without holding a device command lock."""
    matched_udid: str | None = None

    # 1. Non-destructively probe iOS 17+ paired devices. A healthy session
    # protects ongoing navigation, so endpoint matching skips that device.
    ios17_cands = list(iter_remote_paired_identifiers())
    ios17_cands.sort(key=lambda c: 0 if pairing_manager.load_address(c) == ip else 1)

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

    # A stale key can only be repaired over the trusted USB lockdown channel.
    # If exactly one USB phone is present, refresh and verify this IP again.
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

    # 2. Non-destructively probe iOS 16 paired devices.
    if not matched_udid:
        ios16_cands = pairing_manager.list_udids()
        ios16_cands.sort(key=lambda c: 0 if pairing_manager.load_address(c) == ip else 1)
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
        # A failed probe belongs only to the requested endpoint. It must never
        # tear down another phone's explicit Direct runtime.
        raise ValueError(
            f"已找到 {ip}，但手機拒絕目前的 Wireless Direct 授權。"
            "請用 USB 接上這台手機並解鎖，然後直接按「重新連線」以刷新授權。"
        )

    if await has_blocking_session(matched_udid):
        raise ValueError(f"裝置 {matched_udid} 正在執行導航或定位模擬，請先停止定位再切換連線。")

    return matched_udid


def _same_udid(first: str, second: str) -> bool:
    return first.replace("-", "").strip().lower() == second.replace("-", "").strip().lower()


async def _usb_pairing_target(expected_udid: str | None = None) -> str:
    """Return the single trusted USB phone used for an explicit retry."""
    try:
        mux_devices = await asyncio.wait_for(usbmux_list_devices(), timeout=DEVICE_LIST_TIMEOUT_SECONDS)
    except Exception as exc:
        raise ValueError("無法讀取 USB 裝置。請確認 Apple 驅動正常、手機已解鎖並信任此電腦。") from exc

    usb_udids = [
        device.serial for device in mux_devices
        if device.serial and _connection_type_from_mux(device) == "usb"
    ]
    if not usb_udids:
        raise ValueError("重新連線前，請先用 USB 接上這台手機、解鎖並信任此電腦。")
    if len(usb_udids) > 1:
        raise ValueError("偵測到多台 USB 手機。請只保留要刷新 Wireless Direct 授權的手機後再重試。")
    if expected_udid and not _same_udid(expected_udid, usb_udids[0]):
        raise ValueError("USB 接上的手機與所選 Wireless Direct 端點不同，請接上正確的手機後再重試。")
    return usb_udids[0]


async def _connect_direct_impl(udid: str, ip: str | None = None, fallback_bonjour: bool = True, port: int = 49152) -> DeviceInfo:
    saved_version = pairing_manager.load_version(udid)
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
        cached = pairing_manager.load_address(udid)
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

        # Endpoint observations are candidates only; this command explicitly
        # chooses whether to probe them and cannot mutate scanner state.
        for ep_info in direct_endpoint_scanner.cached_endpoints():
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
        pairing_manager.save_address(udid, address)
        _direct_transport_adapter.install_address(udid, address)
        _device_management_service.invalidate()
        return device

    if not fallback_bonjour and ip is not None:
        raise ValueError(f"無法在 {ip} 連線至裝置 {udid}。")
    raise ValueError("找不到已授權的手機。請確認手機已連上同一 Wi-Fi，且螢幕已解鎖。")


async def connect_direct(
    udid: str,
    ip: str | None = None,
    fallback_bonjour: bool = True,
    port: int = 49152,
    refresh_pairing: bool = False,
) -> DeviceInfo:
    if not udid or udid.lower() == "auto":
        if not ip:
            raise ValueError("未指定目標裝置 UDID，請提供 IP 位址以進行配對搜尋。")
        if refresh_pairing:
            # The user followed the USB retry instruction. Resolve identity
            # from that trusted cable instead of probing unrelated records.
            usb_udid = await _usb_pairing_target()
            return await connect_direct(usb_udid, ip, fallback_bonjour, port, refresh_pairing=True)
        # Concurrent clicks for one endpoint share resolution work. Release
        # this lock before entering the per-device command domain so lock
        # ordering can never form an endpoint/device cycle.
        async with device_command_locks.hold(f"endpoint:{ip}:{port}"):
            matched_udid = await _resolve_direct_target_udid(ip, port)
        return await connect_direct(matched_udid, ip, fallback_bonjour, port)
    if await has_blocking_session(udid):
        raise ValueError("請先停止並還原目前的定位，再切換連線方式。")
    async def connect_operation() -> DeviceInfo:
        if refresh_pairing:
            usb_udid = await _usb_pairing_target(udid)
            await enable_direct_pairing(usb_udid)
        return await _connect_direct_impl(udid, ip, fallback_bonjour, port)

    return await transport_controller.connect_direct(
        udid,
        connect_operation,
    )


async def disconnect_direct(udid: str) -> None:
    await transport_controller.disconnect_direct(udid)


async def remove_direct_pairing(udid: str) -> int:
    return await transport_controller.disconnect_and_remove_pairing(
        udid,
        lambda: pairing_manager.remove(udid),
    )


def direct_address(udid: str) -> str | None:
    return _direct_transport_adapter.addresses.get(udid.lower())


async def list_direct_endpoints() -> list[dict]:
    return await direct_endpoint_scanner.list_direct_endpoints()


async def _list_tunnel_udids() -> set[str]:
    """Read tunneld's HTTP listing without opening any RSD connections."""
    return await system_wifi_scanner.scan(_list_tunnels, timeout=DEVICE_LIST_TIMEOUT_SECONDS)


async def _describe_device(
    udid: str,
    connection_type: DeviceConnectionType,
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
            direct_paired=pairing_manager.exists(udid),
        )

    if not tunnel_udids or udid.lower() not in {known_udid.lower() for known_udid in tunnel_udids}:
        return DeviceInfo(
            udid=udid,
            name=name,
            ios_version=ios_version,
            transport="rsd",
            connection_type=connection_type,
            status="tunnel_required",
            direct_paired=pairing_manager.exists(udid),
            detail="Run 'sudo python3 -m pymobiledevice3 remote tunneld' and reconnect the device.",
        )

    return DeviceInfo(
        udid=udid,
        name=name,
        ios_version=ios_version,
        transport="rsd",
        connection_type=connection_type,
        status="ready",
        direct_paired=pairing_manager.exists(udid),
    )


async def get_device(udid: str) -> DeviceInfo:
    # Keep this lookup on the public list boundary.  Besides preserving one
    # query contract, callers and tests can replace the discovery service
    # without patching manager internals.
    for device in await list_devices(include_wifi=True):
        if device.udid.lower() == udid.lower():
            return device
    raise ValueError(f"Device not found: {udid}")


async def get_lockdown(
    udid: str,
    route: DeviceConnectionType | None = None,
) -> LockdownClient:
    key = udid.lower()
    if route == "usb":
        return await _usb_transport_adapter.lockdown(udid)
    if route == "wifi":
        return await _system_wifi_transport_adapter.lockdown(udid)
    if route == "wireless_direct":
        ip = direct_address(udid)
        if ip is None:
            raise RuntimeError("The bound Wireless Direct lockdown runtime is no longer available.")
        return await _connect_direct_tcp(udid, ip)
    if usb_scanner.is_present(key):
        return await _usb_transport_adapter.lockdown(udid)
    ip = direct_address(udid)
    if ip is not None:
        # Only an explicit successful Direct connection populates this
        # runtime address; saved pairing history alone never selects it.
        return await _connect_direct_tcp(udid, ip)
    return await create_using_usbmux(serial=udid)


async def get_rsd(
    udid: str,
    route: DeviceConnectionType | None = None,
) -> RemoteServiceDiscoveryService:
    key = udid.lower()

    if route == "wireless_direct":
        tunnel = _direct_transport_adapter.rsd_tunnels.get(key)
        if tunnel is None or tunnel.rsd is None:
            raise RuntimeError("The bound Wireless Direct RSD runtime is no longer available.")
        return tunnel.rsd

    if route == "usb":
        return await _usb_transport_adapter.rsd(udid)

    if route == "wifi":
        return await _system_wifi_transport_adapter.rsd(udid)

    # Physical USB has the highest idle priority.
    if usb_scanner.is_present(key):
        rsd = await get_tunneld_device_by_udid(udid)
        if rsd is not None:
            return rsd

    # This map only contains a tunnel created by an explicit Direct action.
    # Keep using it while healthy, even if ordinary Wi-Fi discovery also sees
    # the phone on the same network.  If its watcher has confirmed closure,
    # fall through to a system route without making this read clean it up.
    if key in _direct_transport_adapter.rsd_tunnels:
        rsd = _direct_transport_adapter.rsd_tunnels[key].rsd
        if rsd is not None:
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
