"""USB/usbmux discovery state and support diagnostics."""

import asyncio
import platform
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from importlib.metadata import PackageNotFoundError, version
from typing import Awaitable, Callable

from core.device_ports import DiscoverySourceResult
from models.schemas import DeviceConnectionType


@dataclass(frozen=True)
class DeviceDiscoveryDiagnostic:
    """A bounded, support-safe description of a USB discovery failure."""

    code: str
    occurred_at: str
    error_type: str
    message: str
    python_version: str
    platform: str
    pymobiledevice3_version: str


class UsbScanner:
    """Own USB observations without owning or changing any transport."""

    def __init__(self) -> None:
        self._present_udids: set[str] = set()
        self._diagnostic: DeviceDiscoveryDiagnostic | None = None

    @staticmethod
    def connection_type(mux_device: object) -> DeviceConnectionType | None:
        raw = str(getattr(mux_device, "connection_type", "")).upper()
        if raw == "USB":
            return "usb"
        if raw in {"NETWORK", "WIFI", "WI-FI"}:
            return "wifi"
        return None

    @property
    def present_udids(self) -> frozenset[str]:
        return frozenset(self._present_udids)

    def is_present(self, udid: str) -> bool:
        return udid.strip().lower() in self._present_udids

    def reset(self) -> None:
        """Clear process-local observations during shutdown or isolated tests."""
        self._present_udids.clear()
        self._diagnostic = None

    def diagnostic(self) -> dict[str, str] | None:
        return asdict(self._diagnostic) if self._diagnostic is not None else None

    async def scan(
        self,
        list_devices: Callable[[], Awaitable[list[object]]],
        *,
        timeout: float,
    ) -> tuple[list[object], DiscoverySourceResult]:
        try:
            devices = await asyncio.wait_for(list_devices(), timeout=timeout)
        except Exception as exc:  # noqa: BLE001 - converted into a bounded diagnostic
            self._record_failure(exc)
            # A failed observation must preserve the last known availability.
            return [], DiscoverySourceResult("failed", self._diagnostic.message if self._diagnostic else None)

        self._diagnostic = None
        self._present_udids = {
            device.serial.lower()
            for device in devices
            if getattr(device, "serial", None) and self.connection_type(device) == "usb"
        }
        return devices, DiscoverySourceResult("success")

    def _record_failure(self, exc: Exception) -> None:
        message = " ".join(str(exc).split())[:500] or "No error message was provided."
        try:
            pmd3_version = version("pymobiledevice3")
        except PackageNotFoundError:
            pmd3_version = "unknown"
        self._diagnostic = DeviceDiscoveryDiagnostic(
            code="usb_discovery_failed",
            occurred_at=datetime.now(timezone.utc).isoformat(),
            error_type=exc.__class__.__name__,
            message=message,
            python_version=platform.python_version(),
            platform=f"{platform.system()} {platform.release()} ({platform.machine()})",
            pymobiledevice3_version=pmd3_version,
        )


usb_scanner = UsbScanner()
