"""Pure route selection policy for one device aggregate."""

from dataclasses import dataclass
from enum import Enum

from core.device_aggregate import Availability, DeviceAggregate, DirectRuntimeState, SessionState, UserIntent
from models.schemas import DeviceConnectionType


class RouteEffectType(str, Enum):
    USB_TAKEOVER = "usb_takeover"


@dataclass(frozen=True)
class RouteEffect:
    effect_type: RouteEffectType


@dataclass(frozen=True)
class RouteDecision:
    selected_route: DeviceConnectionType | None
    effects: tuple[RouteEffect, ...] = ()


def select_route(device: DeviceAggregate) -> DeviceConnectionType | None:
    """Return one route without I/O or mutation."""
    if device.session.state in {SessionState.ACTIVE, SessionState.STOPPING}:
        return device.session.bound_route
    if device.availability.usb == Availability.AVAILABLE:
        return "usb"
    if device.user_intent == UserIntent.DIRECT and device.direct_runtime == DirectRuntimeState.READY:
        return "wireless_direct"
    if device.availability.system_wifi == Availability.AVAILABLE:
        return "wifi"
    return None


def decide_route(device: DeviceAggregate) -> RouteDecision:
    selected = select_route(device)
    effects: tuple[RouteEffect, ...] = ()
    if (
        selected == "usb"
        and device.selected_route == "wireless_direct"
        and device.session.state == SessionState.IDLE
    ):
        effects = (RouteEffect(RouteEffectType.USB_TAKEOVER),)
    return RouteDecision(selected_route=selected, effects=effects)
