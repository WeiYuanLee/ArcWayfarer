"""Shadow registry for comparing aggregate policy with legacy routing."""

from dataclasses import dataclass, replace
from enum import Enum
from types import MappingProxyType
from typing import Mapping

from core.device_aggregate import (
    Availability,
    AuthorizationState,
    DeviceAggregate,
    DeviceAvailability,
    DeviceSessionState,
    DirectEndpoint,
    DirectRuntimeState,
    SessionState,
    UserIntent,
)
from core.device_revision import DeviceRevisionLedger, device_revision_ledger
from core.route_policy import RouteEffect, decide_route
from models.schemas import DeviceConnectionType

SHADOW_HISTORY_LIMIT = 500


class DifferenceClassification(str, Enum):
    LEGACY_BUG = "legacy_bug"
    POLICY_BUG = "policy_bug"
    UNDEFINED_SPEC = "undefined_spec"


@dataclass(frozen=True)
class ShadowDifference:
    udid: str
    revision: int
    legacy_route: DeviceConnectionType | None
    policy_route: DeviceConnectionType | None
    classification: DifferenceClassification
    event: str


@dataclass(frozen=True)
class ShadowRegistrySnapshot:
    devices: Mapping[str, DeviceAggregate]
    differences: tuple[ShadowDifference, ...]
    pending_effects: tuple[tuple[str, int, RouteEffect], ...]
    applied_event_count: int


class DeviceRegistry:
    """Store policy state without owning or changing production transports."""

    def __init__(self, ledger: DeviceRevisionLedger = device_revision_ledger) -> None:
        self._ledger = ledger
        self._devices: dict[str, DeviceAggregate] = {}
        self._differences: list[ShadowDifference] = []
        self._pending_effects: list[tuple[str, int, RouteEffect]] = []
        self._applied_event_count = 0

    @staticmethod
    def _key(udid: str) -> str:
        return udid.strip().lower()

    def get(self, udid: str) -> DeviceAggregate | None:
        return self._devices.get(self._key(udid))

    def snapshot(self) -> ShadowRegistrySnapshot:
        return ShadowRegistrySnapshot(
            devices=MappingProxyType(dict(self._devices)),
            differences=tuple(self._differences),
            pending_effects=tuple(self._pending_effects),
            applied_event_count=self._applied_event_count,
        )

    def observe_routes(
        self,
        udid: str,
        *,
        usb: bool | None,
        system_wifi: bool | None,
        direct_endpoints: tuple[DirectEndpoint, ...] | None = None,
        revision: int | None = None,
        legacy_route: DeviceConnectionType | None = None,
    ) -> DeviceAggregate:
        current = self._current(udid)
        return self._apply(
            replace(
                current,
                availability=DeviceAvailability(
                    usb=current.availability.usb if usb is None else (
                        Availability.AVAILABLE if usb else Availability.UNAVAILABLE
                    ),
                    system_wifi=current.availability.system_wifi if system_wifi is None else (
                        Availability.AVAILABLE if system_wifi else Availability.UNAVAILABLE
                    ),
                    direct_endpoints=(
                        current.availability.direct_endpoints if direct_endpoints is None else direct_endpoints
                    ),
                ),
            ),
            event="discovery_observation",
            revision=revision,
            legacy_route=legacy_route,
            compare_legacy=True,
        )

    def record_authorization(
        self,
        udid: str,
        authorization: AuthorizationState,
        *,
        revision: int | None = None,
        legacy_route: DeviceConnectionType | None = None,
    ) -> DeviceAggregate:
        return self._apply(
            replace(self._current(udid), authorization=authorization),
            event="authorization_changed",
            revision=revision,
            legacy_route=legacy_route,
            compare_legacy=False,
        )

    def record_direct_runtime(
        self,
        udid: str,
        runtime: DirectRuntimeState,
        *,
        intent: UserIntent | None = None,
        revision: int | None = None,
        legacy_route: DeviceConnectionType | None = None,
    ) -> DeviceAggregate:
        current = self._current(udid)
        return self._apply(
            replace(current, direct_runtime=runtime, user_intent=intent or current.user_intent),
            event="direct_runtime_changed",
            revision=revision,
            legacy_route=legacy_route,
            compare_legacy=True,
        )

    def record_session(
        self,
        udid: str,
        state: SessionState,
        *,
        bound_route: DeviceConnectionType | None = None,
        revision: int | None = None,
        legacy_route: DeviceConnectionType | None = None,
    ) -> DeviceAggregate:
        return self._apply(
            replace(self._current(udid), session=DeviceSessionState(state, bound_route)),
            event="session_changed",
            revision=revision,
            legacy_route=legacy_route,
            compare_legacy=True,
        )

    def _current(self, udid: str) -> DeviceAggregate:
        return self._devices.get(self._key(udid), DeviceAggregate(udid=udid))

    def _apply(
        self,
        candidate: DeviceAggregate,
        *,
        event: str,
        revision: int | None,
        legacy_route: DeviceConnectionType | None,
        compare_legacy: bool,
    ) -> DeviceAggregate:
        key = self._key(candidate.udid)
        current = self._devices.get(key)
        effective_revision = self._ledger.revision_for(candidate.udid) if revision is None else revision
        if current is not None and effective_revision < current.revision:
            return current
        candidate = replace(candidate, revision=effective_revision)
        decision = decide_route(candidate)
        candidate = replace(candidate, selected_route=decision.selected_route)
        if current == candidate:
            return candidate

        self._devices[key] = candidate
        self._applied_event_count += 1
        self._pending_effects.extend((key, effective_revision, effect) for effect in decision.effects)
        if len(self._pending_effects) > SHADOW_HISTORY_LIMIT:
            del self._pending_effects[:-SHADOW_HISTORY_LIMIT]
        if compare_legacy and legacy_route != decision.selected_route:
            self._differences.append(ShadowDifference(
                udid=candidate.udid,
                revision=effective_revision,
                legacy_route=legacy_route,
                policy_route=decision.selected_route,
                classification=DifferenceClassification.UNDEFINED_SPEC,
                event=event,
            ))
            if len(self._differences) > SHADOW_HISTORY_LIMIT:
                del self._differences[:-SHADOW_HISTORY_LIMIT]
        return candidate


shadow_device_registry = DeviceRegistry()
