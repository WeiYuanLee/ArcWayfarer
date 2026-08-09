import asyncio
import logging

from pymobiledevice3.exceptions import ConnectionTerminatedError
from pymobiledevice3.services.dvt.instruments.dvt_provider import DvtProvider
from pymobiledevice3.services.dvt.instruments.location_simulation import LocationSimulation
from pymobiledevice3.services.simulate_location import DtSimulateLocation

from config import MOUNT_TIMEOUT_SECONDS
from core import device_manager

logger = logging.getLogger(__name__)

_DEAD_CONNECTION_ERRORS = (ConnectionTerminatedError, ConnectionError, OSError, asyncio.TimeoutError, TimeoutError)


class DeviceSession:
    """A persistent location-simulation connection for one device.

    Lives as long as the device is usable, not as long as any single Teleport/Navigate
    call. iOS 17+'s DVT-based simulation only stays in effect while its RSD connection
    is open, so every mode reuses the same session instead of opening/closing per call.
    """

    def __init__(self, udid, transport, backend, dvt_cm=None, ls_cm=None):
        self.udid = udid
        self.transport = transport
        self._backend = backend
        self._dvt_cm = dvt_cm
        self._ls_cm = ls_cm
        self._lock = asyncio.Lock()

    async def set(self, lat: float, lng: float) -> None:
        async with self._lock:
            try:
                await asyncio.wait_for(self._backend.set(lat, lng), timeout=10.0)
            except Exception:
                _sessions.pop(self.udid, None)
                await self.close()
                raise

    async def clear(self) -> None:
        async with self._lock:
            try:
                await asyncio.wait_for(self._backend.clear(), timeout=10.0)
            except Exception:
                _sessions.pop(self.udid, None)
                await self.close()
                raise

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


_sessions: dict[str, DeviceSession] = {}
_session_locks: dict[str, asyncio.Lock] = {}


class LockdownSimulateLocationWrapper:
    """Wrapper for iOS < 17 lockdown location simulation that creates a fresh lockdown connection per command."""

    def __init__(self, udid: str):
        self.udid = udid

    async def set(self, lat: float, lng: float) -> None:
        lockdown = await device_manager.get_lockdown(self.udid)
        backend = DtSimulateLocation(lockdown)
        await backend.set(lat, lng)

    async def clear(self) -> None:
        lockdown = await device_manager.get_lockdown(self.udid)
        backend = DtSimulateLocation(lockdown)
        await backend.clear()


async def get_session(udid: str) -> DeviceSession:
    existing = _sessions.get(udid)
    if existing is not None:
        return existing

    lock = _session_locks.setdefault(udid, asyncio.Lock())
    async with lock:
        # Re-check now that we hold the lock — another concurrent call for the same
        # udid may have already created the session while we were waiting.
        existing = _sessions.get(udid)
        if existing is not None:
            return existing

        device = await device_manager.get_device(udid)
        if device.status != "ready":
            raise RuntimeError(device.detail or f"Device is not ready (status: {device.status}).")

        if device.transport == "lockdown":
            lockdown = await device_manager.get_lockdown(udid)
            try:
                await asyncio.wait_for(device_manager.ensure_mounted(lockdown), timeout=MOUNT_TIMEOUT_SECONDS)
            except asyncio.TimeoutError as e:
                raise RuntimeError(
                    "Timed out mounting the Developer Disk Image. Check your internet connection and try again."
                ) from e
            session = DeviceSession(udid, transport="lockdown", backend=LockdownSimulateLocationWrapper(udid))
        else:
            rsd = await device_manager.get_rsd(udid)
            dvt_cm = DvtProvider(rsd)
            dvt = await dvt_cm.__aenter__()
            ls_cm = LocationSimulation(dvt)
            location_simulation = await ls_cm.__aenter__()
            session = DeviceSession(udid, transport="rsd", backend=location_simulation, dvt_cm=dvt_cm, ls_cm=ls_cm)

        _sessions[udid] = session
        return session


async def close_session(udid: str) -> None:
    session = _sessions.pop(udid, None)
    if session is not None:
        await session.close()


def has_session(udid: str) -> bool:
    return udid in _sessions


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


async def clear_location(udid: str, max_retries: int = 2) -> None:
    """Stops location simulation on the device and restores real GPS location."""
    for attempt in range(1, max_retries + 1):
        try:
            session = await get_session(udid)
            await session.clear()
            await close_session(udid)
            return
        except Exception as e:
            await close_session(udid)
            if attempt == max_retries:
                logger.warning("Failed to clear location for %s (attempt %d/%d): %s", udid, attempt, max_retries, e)
                raise
            await asyncio.sleep(1.0)


