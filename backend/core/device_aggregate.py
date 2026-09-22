"""Immutable state model used by the shadow device registry."""

from dataclasses import dataclass, field
from enum import Enum

from models.schemas import DeviceConnectionType
from models.schemas import DeviceInfo


class Availability(str, Enum):
    UNAVAILABLE = "unavailable"
    AVAILABLE = "available"


class DirectRuntimeState(str, Enum):
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    READY = "ready"
    FAILED = "failed"


class AuthorizationState(str, Enum):
    UNPAIRED = "unpaired"
    PAIRED = "paired"
    STALE = "stale"


class UserIntent(str, Enum):
    AUTO = "auto"
    DIRECT = "direct"


class SessionState(str, Enum):
    IDLE = "idle"
    ACTIVE = "active"
    STOPPING = "stopping"
    FAILED = "failed"


@dataclass(frozen=True)
class DirectEndpoint:
    host: str
    port: int


@dataclass(frozen=True)
class DeviceAvailability:
    usb: Availability = Availability.UNAVAILABLE
    system_wifi: Availability = Availability.UNAVAILABLE
    direct_endpoints: tuple[DirectEndpoint, ...] = ()


@dataclass(frozen=True)
class DeviceSessionState:
    state: SessionState = SessionState.IDLE
    bound_route: DeviceConnectionType | None = None


@dataclass(frozen=True)
class DeviceAggregate:
    udid: str
    availability: DeviceAvailability = field(default_factory=DeviceAvailability)
    direct_runtime: DirectRuntimeState = DirectRuntimeState.DISCONNECTED
    authorization: AuthorizationState = AuthorizationState.UNPAIRED
    user_intent: UserIntent = UserIntent.AUTO
    selected_route: DeviceConnectionType | None = None
    session: DeviceSessionState = field(default_factory=DeviceSessionState)
    revision: int = 0
    usb_device: DeviceInfo | None = None
    wifi_device: DeviceInfo | None = None
    direct_device: DeviceInfo | None = None
