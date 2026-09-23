import asyncio
import logging
import struct
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from pymobiledevice3.exceptions import ConnectionTerminatedError
from pymobiledevice3.services.dvt.instruments.dvt_provider import DvtProvider
from pymobiledevice3.services.dvt.instruments.location_simulation import LocationSimulation

from config import MOUNT_TIMEOUT_SECONDS
from core.device_aggregate import SessionState
from core.device_session_state import publish_session_state
from core.device_session_store import device_session_store
from models.schemas import DeviceConnectionType, DeviceInfo

logger = logging.getLogger(__name__)

_DEAD_CONNECTION_ERRORS = (ConnectionTerminatedError, ConnectionError, OSError, asyncio.TimeoutError, TimeoutError)

# LocationSimulation.clear() uses a DTX call that does not wait for a device
# reply. Keep the channel alive long enough for the command to be flushed, then
# close it: iOS map apps can otherwise retain the simulation source and delay
# their transition back to a fresh real-location update.
CLEAR_DELIVERY_SETTLE_SECONDS = 1.0
CLEAR_DELIVERY_ATTEMPTS = 1


@dataclass(frozen=True)
class DeviceSessionRuntime:
    get_device: Callable[[str], Awaitable[DeviceInfo]]
    get_lockdown: Callable[[str, DeviceConnectionType], Awaitable[Any]]
    get_rsd: Callable[[str, DeviceConnectionType], Awaitable[Any]]
    ensure_mounted: Callable[[Any], Awaitable[None]]
    cleanup_failed_direct: Callable[[str], Awaitable[int]]
    apply_policy_effects: Callable[[], Awaitable[None]]


_runtime: DeviceSessionRuntime | None = None


def configure_session_runtime(runtime: DeviceSessionRuntime) -> None:
    global _runtime
    _runtime = runtime


def _require_runtime() -> DeviceSessionRuntime:
    if _runtime is None:
        raise RuntimeError("Device session runtime has not been configured.")
    return _runtime


class DeviceSession:
    """A persistent location-simulation connection for one device.

    Lives as long as the device is usable, not as long as any single Teleport/Navigate
    call. iOS 17+'s DVT-based simulation only stays in effect while its RSD connection
    is open, so every mode reuses the same session instead of opening/closing per call.
    """

    def __init__(
        self,
        udid,
        transport,
        backend,
        bound_route: DeviceConnectionType,
        *,
        transport_identity: str | None = None,
        cleanup_failed_direct: Callable[[str], Awaitable[int]] | None = None,
        dvt_cm=None,
        ls_cm=None,
    ):
        self.udid = udid
        self.transport = transport
        # Preserve the route that created this session. Discovery may observe
        # other routes later, but it must not silently move active I/O.
        self.bound_route = bound_route
        self.transport_identity = transport_identity or f"{transport}:{bound_route}:{id(backend)}"
        self._backend = backend
        self._cleanup_failed_direct = cleanup_failed_direct
        self._dvt_cm = dvt_cm
        self._ls_cm = ls_cm
        self._lock = asyncio.Lock()

    async def set(self, lat: float, lng: float) -> None:
        async with self._lock:
            try:
                await asyncio.wait_for(self._backend.set(lat, lng), timeout=10.0)
            except Exception as exc:
                await self._handle_failure(exc)
                raise

    async def clear(self) -> None:
        async with self._lock:
            try:
                await asyncio.wait_for(self._backend.clear(), timeout=10.0)
            except Exception as exc:
                await self._handle_failure(exc)
                raise

    async def _handle_failure(self, exc: Exception) -> None:
        """Publish failure only while this is still the registered handle."""
        current = device_session_store.pop(self.udid, expected=self)
        await self.close()
        if current is None:
            return
        publish_session_state(
            self.udid,
            SessionState.FAILED,
            self.bound_route,
            transport_identity=self.transport_identity,
        )
        await self._release_failed_direct_runtime(exc)

    async def _release_failed_direct_runtime(self, exc: Exception) -> None:
        """Clear only this session's Direct runtime after confirmed I/O loss."""
        if self.bound_route == "wireless_direct" and isinstance(exc, _DEAD_CONNECTION_ERRORS):
            cleanup = self._cleanup_failed_direct or _require_runtime().cleanup_failed_direct
            await cleanup(self.udid)

    async def close(self) -> None:
        if self._ls_cm is not None:
            try:
                await self._ls_cm.__aexit__(None, None, None)
            except Exception:
                pass
            self._ls_cm = None
        if self._dvt_cm is not None:
            try:
                await self._dvt_cm.__aexit__(None, None, None)
            except Exception:
                pass
            self._dvt_cm = None


class LockdownSimulateLocationWrapper:
    """Wrapper for iOS < 17 lockdown location simulation that creates a fresh lockdown connection per command."""

    def __init__(
        self,
        udid: str,
        bound_route: DeviceConnectionType,
        get_lockdown: Callable[[str, DeviceConnectionType], Awaitable[Any]] | None = None,
    ):
        self.udid = udid
        self.bound_route = bound_route
        self._get_lockdown = get_lockdown

    async def _send(self, command: int, lat: float | None = None, lng: float | None = None) -> None:
        get_lockdown = self._get_lockdown or _require_runtime().get_lockdown
        async with await get_lockdown(self.udid, self.bound_route) as lockdown:
            # DtSimulateLocation uses this wire format but leaves its fresh
            # developer-service connection without an explicit close.
            service = await lockdown.start_lockdown_developer_service("com.apple.dt.simulatelocation")
            async with service:
                await service.sendall(struct.pack(">I", command))
                if command == 0:
                    for coordinate in (lat, lng):
                        encoded = str(coordinate).encode()
                        await service.sendall(struct.pack(">I", len(encoded)) + encoded)

    async def set(self, lat: float, lng: float) -> None:
        await self._send(0, lat, lng)

    async def clear(self) -> None:
        await self._send(1)


async def get_session(udid: str) -> DeviceSession:
    existing = device_session_store.get(udid)
    if existing is not None:
        return existing

    runtime = _require_runtime()
    lock = device_session_store.lock_for(udid)
    async with lock:
        # Re-check now that we hold the lock — another concurrent call for the same
        # udid may have already created the session while we were waiting.
        existing = device_session_store.get(udid)
        if existing is not None:
            return existing

        device = await runtime.get_device(udid)
        if device.status != "ready":
            raise RuntimeError(device.detail or f"Device is not ready (status: {device.status}).")

        if device.transport == "lockdown":
            async with await runtime.get_lockdown(udid, device.connection_type) as lockdown:
                if device.connection_type == "wireless_direct":
                    # The disk image is prepared over USB during setup. iOS 16
                    # can reject image-mounter requests over Wi-Fi, while the
                    # mounted location service itself remains reachable.
                    service = await lockdown.start_lockdown_developer_service("com.apple.dt.simulatelocation")
                    await service.close()
                else:
                    try:
                        await asyncio.wait_for(runtime.ensure_mounted(lockdown), timeout=MOUNT_TIMEOUT_SECONDS)
                    except asyncio.TimeoutError as e:
                        raise RuntimeError(
                            "Timed out mounting the Developer Disk Image. Check your internet connection and try again."
                        ) from e
            session = DeviceSession(
                udid,
                transport="lockdown",
                backend=LockdownSimulateLocationWrapper(
                    udid,
                    device.connection_type,
                    runtime.get_lockdown,
                ),
                bound_route=device.connection_type,
                transport_identity=(
                    f"lockdown:{device.connection_type}:{device.ip_address or device.udid}:{device.revision}"
                ),
                cleanup_failed_direct=runtime.cleanup_failed_direct,
            )
        else:
            rsd = await runtime.get_rsd(udid, device.connection_type)
            dvt_cm = DvtProvider(rsd)
            dvt = await dvt_cm.__aenter__()
            ls_cm = None
            try:
                ls_cm = LocationSimulation(dvt)
                location_simulation = await ls_cm.__aenter__()
            except BaseException as exc:
                # A partially-created RSD session still owns the DVT channel.
                # Release both contexts here because no DeviceSession exists yet
                # to take responsibility for their lifetime.
                if ls_cm is not None:
                    try:
                        await ls_cm.__aexit__(type(exc), exc, exc.__traceback__)
                    except Exception:
                        logger.debug("Failed to close partial location context for %s", udid, exc_info=True)
                try:
                    await dvt_cm.__aexit__(type(exc), exc, exc.__traceback__)
                except Exception:
                    logger.debug("Failed to close partial DVT context for %s", udid, exc_info=True)
                raise
            session = DeviceSession(
                udid,
                transport="rsd",
                backend=location_simulation,
                bound_route=device.connection_type,
                transport_identity=f"rsd:{device.connection_type}:{id(rsd)}",
                cleanup_failed_direct=runtime.cleanup_failed_direct,
                dvt_cm=dvt_cm,
                ls_cm=ls_cm,
            )

        device_session_store.register(session)
        publish_session_state(
            udid,
            SessionState.ACTIVE,
            session.bound_route,
            transport_identity=session.transport_identity,
        )
        return session


async def close_session(udid: str) -> None:
    session = device_session_store.pop(udid)
    if session is not None:
        await session.close()
        publish_session_state(udid, SessionState.IDLE, None, compare_legacy=False)
        await _require_runtime().apply_policy_effects()


def has_session(udid: str) -> bool:
    return device_session_store.has(udid)


async def set_location(udid: str, lat: float, lng: float, max_retries: int = 3, retry_delay: float = 2.0) -> None:
    """Sets location on device with auto-retry and reconnection support on connection failures."""
    for attempt in range(1, max_retries + 1):
        try:
            session = await get_session(udid)
            await session.set(lat, lng)
            return
        except Exception as e:
            await close_session(udid)
            if attempt == max_retries:
                raise
            logger.warning(
                "Location simulation set failed for %s (attempt %d/%d), retrying in %.1fs... Error: %s",
                udid,
                attempt,
                max_retries,
                retry_delay,
                e,
            )
            await asyncio.sleep(retry_delay)


async def clear_location(
    udid: str,
    max_retries: int = 2,
    settle_seconds: float = CLEAR_DELIVERY_SETTLE_SECONDS,
    delivery_attempts: int = CLEAR_DELIVERY_ATTEMPTS,
) -> None:
    """Stop simulation, optionally flush the DTX command, then release its session.

    Normal restores use a short settle window so map apps promptly release their
    simulated source. If sending the clear command or tearing down the session fails
    (e.g., due to a stale connection), the outer retry loop will establish a fresh
    connection and try again. Time-sensitive workflows such as Gold Ditto can opt out
    of the settle delay and retain their established set-to-clear timing.
    """
    if delivery_attempts < 1:
        raise ValueError("delivery_attempts must be at least 1")

    for attempt in range(1, max_retries + 1):
        try:
            for _ in range(delivery_attempts):
                session = await get_session(udid)
                await session.clear()
                if settle_seconds > 0:
                    await asyncio.sleep(settle_seconds)
                await close_session(udid)
            return
        except Exception as e:
            await close_session(udid)
            if attempt == max_retries:
                logger.warning("Failed to clear location for %s (attempt %d/%d): %s", udid, attempt, max_retries, e)
                raise
            await asyncio.sleep(1.0)
