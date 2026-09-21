"""Public contracts for the device-management migration.

The legacy manager still supplies the production data during P0/P1.  These
ports give tests and later registry code a stable boundary that does not
require access to the manager's module-level dictionaries.
"""

from dataclasses import dataclass, field
from types import MappingProxyType
from typing import Awaitable, Callable, Literal, Mapping, Protocol

from models.schemas import DeviceInfo

DiscoverySourceStatus = Literal["success", "failed", "not_requested"]


@dataclass(frozen=True)
class DiscoverySourceResult:
    """Outcome of one discovery source without confusing failure with empty."""

    status: DiscoverySourceStatus
    detail: str | None = None


@dataclass(frozen=True)
class DiscoverySnapshot:
    """Stable observation container returned by a discovery operation."""

    devices: tuple[DeviceInfo, ...]
    sources: Mapping[str, DiscoverySourceResult] = field(default_factory=dict)

    def __post_init__(self) -> None:
        # Copy before wrapping so adapters cannot mutate source outcomes after
        # publishing a snapshot shared by concurrent readers.
        object.__setattr__(self, "sources", MappingProxyType(dict(self.sources)))


class DeviceDiscoveryPort(Protocol):
    async def discover(self) -> DiscoverySnapshot:
        """Observe devices without creating, switching, or closing transports."""


class DirectTransportPort(Protocol):
    async def connect(
        self,
        udid: str,
        ip: str | None = None,
        *,
        fallback_bonjour: bool = True,
        port: int = 49152,
    ) -> DeviceInfo: ...

    async def disconnect(self, udid: str) -> None: ...


class PairingStorePort(Protocol):
    def exists(self, udid: str) -> bool: ...

    def list_udids(self) -> list[str]: ...


class SessionStatusPort(Protocol):
    def has_session(self, udid: str) -> bool: ...


class CallbackDiscoveryPort:
    """Adapt the legacy scan callback to the public discovery contract."""

    def __init__(self, callback: Callable[[], Awaitable[DiscoverySnapshot]]) -> None:
        self._callback = callback

    async def discover(self) -> DiscoverySnapshot:
        return await self._callback()
