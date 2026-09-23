"""Device state registry with bounded legacy-policy comparison diagnostics."""

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
from core.device_ports import DiscoverySnapshot, DiscoverySourceResult
from core.device_revision import DeviceRevisionLedger, device_revision_ledger
from core.route_policy import RouteEffect, decide_route
from models.schemas import DeviceConnectionType, DeviceInfo

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
class DeviceRegistrySnapshot:
    devices: Mapping[str, DeviceAggregate]
    differences: tuple[ShadowDifference, ...]
    pending_effects: tuple[tuple[str, int, RouteEffect], ...]
    applied_event_count: int
    snapshot_revision: int
    sources: Mapping[str, DiscoverySourceResult]


class DeviceRegistry:
    """Store policy state without owning or changing production transports."""

    def __init__(self, ledger: DeviceRevisionLedger = device_revision_ledger) -> None:
        self._ledger = ledger
        self._devices: dict[str, DeviceAggregate] = {}
        self._differences: list[ShadowDifference] = []
        self._pending_effects: list[tuple[str, int, RouteEffect]] = []
        self._applied_event_count = 0
        self._sources: dict[str, DiscoverySourceResult] = {}

    @staticmethod
    def _key(udid: str) -> str:
        return udid.strip().lower()

    @staticmethod
    def _classify_difference(
        candidate: DeviceAggregate,
        legacy_route: DeviceConnectionType | None,
        policy_route: DeviceConnectionType | None,
    ) -> DifferenceClassification:
        if (
            candidate.session.state in {SessionState.ACTIVE, SessionState.STOPPING}
            and candidate.session.bound_route == policy_route
        ):
            return DifferenceClassification.LEGACY_BUG
        if legacy_route is not None and policy_route is None:
            return DifferenceClassification.POLICY_BUG
        return DifferenceClassification.UNDEFINED_SPEC

    def get(self, udid: str) -> DeviceAggregate | None:
        return self._devices.get(self._key(udid))

    def snapshot(self) -> DeviceRegistrySnapshot:
        return DeviceRegistrySnapshot(
            devices=MappingProxyType(dict(self._devices)),
            differences=tuple(self._differences),
            pending_effects=tuple(self._pending_effects),
            applied_event_count=self._applied_event_count,
            snapshot_revision=self._ledger.capture().snapshot_revision,
            sources=MappingProxyType(dict(self._sources)),
        )

    def publish_discovery(self, snapshot: DiscoverySnapshot) -> None:
        """Apply one completed observation without executing policy effects."""
        rows = {device.udid.lower(): device for device in snapshot.devices}
        known_keys = set(self._devices) | set(rows)
        usb_success = snapshot.sources.get("usb", DiscoverySourceResult("not_requested")).status == "success"
        wifi_success = snapshot.sources.get("system_wifi", DiscoverySourceResult("not_requested")).status == "success"

        for key in sorted(known_keys):
            row = rows.get(key)
            current = self._devices.get(key)
            captured_revision = snapshot.device_revisions.get(key, 0)
            if current is not None and current.revision > captured_revision:
                continue

            route = row.connection_type if row is not None else None
            usb: bool | None = True if route == "usb" else (
                False if usb_success and route in {None, "wifi", "wireless_direct"} else None
            )
            wifi: bool | None = True if route == "wifi" else (False if row is None and wifi_success else None)
            candidate = self._candidate_with_observation(
                key,
                row,
                usb=usb,
                system_wifi=wifi,
                usb_success=usb_success,
                wifi_success=wifi_success,
            )
            decision = decide_route(candidate)
            candidate = replace(candidate, selected_route=decision.selected_route)
            if current == candidate:
                continue

            revision = self._ledger.bump(row.udid if row is not None else current.udid)
            self._apply(
                replace(candidate, revision=revision),
                event="discovery_observation",
                revision=revision,
                legacy_route=route,
                compare_legacy=True,
            )

        self._sources = dict(snapshot.sources)

    def projected_snapshot(self, include_wifi: bool = True) -> DiscoverySnapshot:
        devices: list[DeviceInfo] = []
        capture = self._ledger.capture()
        for key, aggregate in self._devices.items():
            route = aggregate.selected_route
            observed = {
                "usb": aggregate.usb_device,
                "wifi": aggregate.wifi_device,
                "wireless_direct": aggregate.direct_device,
            }.get(route)
            if route is None or observed is None or (route == "wifi" and not include_wifi):
                continue
            devices.append(observed.model_copy(update={
                "connection_type": route,
                "selected_route": route,
                "revision": aggregate.revision,
            }))
        return DiscoverySnapshot(
            devices=tuple(devices),
            sources=self._sources,
            snapshot_revision=capture.snapshot_revision,
            device_revisions=capture.device_revisions,
        )

    def _candidate_with_observation(
        self,
        key: str,
        row: DeviceInfo | None,
        *,
        usb: bool | None,
        system_wifi: bool | None,
        usb_success: bool,
        wifi_success: bool,
    ) -> DeviceAggregate:
        current = self._devices.get(key, DeviceAggregate(udid=row.udid if row is not None else key))
        availability = DeviceAvailability(
            usb=current.availability.usb if usb is None else (
                Availability.AVAILABLE if usb else Availability.UNAVAILABLE
            ),
            system_wifi=current.availability.system_wifi if system_wifi is None else (
                Availability.AVAILABLE if system_wifi else Availability.UNAVAILABLE
            ),
            direct_endpoints=current.availability.direct_endpoints,
        )
        usb_device = current.usb_device
        wifi_device = current.wifi_device
        direct_device = current.direct_device
        if row is not None and row.connection_type == "usb":
            usb_device = row
        elif row is not None and row.connection_type == "wifi":
            wifi_device = row
        elif row is not None and row.connection_type == "wireless_direct":
            direct_device = row
        if usb_success and usb is False:
            usb_device = None
        if wifi_success and system_wifi is False:
            wifi_device = None
        return replace(
            current,
            availability=availability,
            authorization=(
                AuthorizationState.PAIRED if row is not None and row.direct_paired else current.authorization
            ),
            usb_device=usb_device,
            wifi_device=wifi_device,
            direct_device=direct_device,
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
        device: DeviceInfo | None = None,
    ) -> DeviceAggregate:
        current = self._current(udid)
        return self._apply(
            replace(
                current,
                direct_runtime=runtime,
                user_intent=intent or current.user_intent,
                direct_device=device or current.direct_device,
            ),
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
        transport_identity: str | None = None,
        revision: int | None = None,
        legacy_route: DeviceConnectionType | None = None,
        compare_legacy: bool = True,
    ) -> DeviceAggregate:
        return self._apply(
            replace(
                self._current(udid),
                session=DeviceSessionState(state, bound_route, transport_identity),
            ),
            event="session_changed",
            revision=revision,
            legacy_route=legacy_route,
            compare_legacy=compare_legacy,
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
                classification=self._classify_difference(candidate, legacy_route, decision.selected_route),
                event=event,
            ))
            if len(self._differences) > SHADOW_HISTORY_LIMIT:
                del self._differences[:-SHADOW_HISTORY_LIMIT]
        return candidate


device_registry = DeviceRegistry()
