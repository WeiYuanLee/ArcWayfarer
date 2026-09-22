import asyncio
import unittest
from unittest.mock import AsyncMock

from core.device_aggregate import (
    AuthorizationState,
    Availability,
    DeviceAggregate,
    DeviceAvailability,
    DeviceSessionState,
    DirectRuntimeState,
    SessionState,
    UserIntent,
)
from core.device_registry import DeviceRegistry, DifferenceClassification
from core.device_discovery_coordinator import DeviceDiscoveryCoordinator
from core.device_ports import DiscoverySnapshot, DiscoverySourceResult
from core.device_revision import DeviceRevisionLedger
from core.route_policy import RouteEffectType, decide_route, select_route
from models.schemas import DeviceInfo


def device(udid: str, route: str) -> DeviceInfo:
    return DeviceInfo(
        udid=udid,
        name=udid,
        ios_version="17.4",
        transport="rsd" if route != "usb" else "lockdown",
        connection_type=route,
        status="ready",
    )


def aggregate(
    *,
    usb: bool = False,
    wifi: bool = False,
    direct_ready: bool = False,
    direct_intent: bool = False,
    session: SessionState = SessionState.IDLE,
    bound_route=None,
    selected_route=None,
) -> DeviceAggregate:
    return DeviceAggregate(
        udid="PHONE-A",
        availability=DeviceAvailability(
            usb=Availability.AVAILABLE if usb else Availability.UNAVAILABLE,
            system_wifi=Availability.AVAILABLE if wifi else Availability.UNAVAILABLE,
        ),
        direct_runtime=DirectRuntimeState.READY if direct_ready else DirectRuntimeState.DISCONNECTED,
        authorization=AuthorizationState.PAIRED if direct_ready else AuthorizationState.UNPAIRED,
        user_intent=UserIntent.DIRECT if direct_intent else UserIntent.AUTO,
        selected_route=selected_route,
        session=DeviceSessionState(session, bound_route),
    )


class RoutePolicyTests(unittest.TestCase):
    def test_route_selection_table(self) -> None:
        cases = [
            (aggregate(), None),
            (aggregate(usb=True), "usb"),
            (aggregate(wifi=True), "wifi"),
            (aggregate(usb=True, wifi=True), "usb"),
            (aggregate(direct_ready=True, direct_intent=True), "wireless_direct"),
            (aggregate(wifi=True, direct_ready=True, direct_intent=True), "wireless_direct"),
            (aggregate(usb=True, direct_ready=True, direct_intent=True), "usb"),
            (aggregate(wifi=True, direct_ready=True, direct_intent=False), "wifi"),
            (aggregate(direct_ready=True, direct_intent=False), None),
            (
                aggregate(usb=True, session=SessionState.ACTIVE, bound_route="wireless_direct"),
                "wireless_direct",
            ),
            (
                aggregate(direct_ready=True, direct_intent=True, session=SessionState.ACTIVE, bound_route="wifi"),
                "wifi",
            ),
            (
                aggregate(usb=True, session=SessionState.STOPPING, bound_route="wifi"),
                "wifi",
            ),
        ]
        for device, expected in cases:
            with self.subTest(device=device):
                self.assertEqual(select_route(device), expected)

    def test_idle_usb_takeover_is_described_but_not_executed(self) -> None:
        device = aggregate(
            usb=True,
            direct_ready=True,
            direct_intent=True,
            selected_route="wireless_direct",
        )
        decision = decide_route(device)
        self.assertEqual(decision.selected_route, "usb")
        self.assertEqual([effect.effect_type for effect in decision.effects], [RouteEffectType.USB_TAKEOVER])


class ShadowRegistryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.ledger = DeviceRevisionLedger()
        self.registry = DeviceRegistry(self.ledger)

    def test_normal_usb_wifi_and_direct_flows_match_legacy(self) -> None:
        self.registry.observe_routes("USB", usb=True, system_wifi=True, revision=1, legacy_route="usb")
        self.registry.observe_routes("WIFI", usb=False, system_wifi=True, revision=2, legacy_route="wifi")
        self.registry.record_authorization("DIRECT", AuthorizationState.PAIRED, revision=3)
        direct = self.registry.record_direct_runtime(
            "DIRECT",
            DirectRuntimeState.READY,
            intent=UserIntent.DIRECT,
            revision=3,
            legacy_route="wireless_direct",
        )

        snapshot = self.registry.snapshot()
        self.assertEqual(direct.selected_route, "wireless_direct")
        self.assertEqual(snapshot.differences, ())

    def test_difference_is_recorded_and_classified(self) -> None:
        self.registry.observe_routes("PHONE-A", usb=True, system_wifi=False, revision=1, legacy_route="wifi")
        difference = self.registry.snapshot().differences[0]
        self.assertEqual(difference.policy_route, "usb")
        self.assertEqual(difference.classification, DifferenceClassification.UNDEFINED_SPEC)

    def test_duplicate_event_does_not_increment_counts_or_effects(self) -> None:
        self.registry.observe_routes("PHONE-A", usb=True, system_wifi=False, revision=1, legacy_route="usb")
        before = self.registry.snapshot()
        self.registry.observe_routes("PHONE-A", usb=True, system_wifi=False, revision=1, legacy_route="usb")
        after = self.registry.snapshot()
        self.assertEqual(after.applied_event_count, before.applied_event_count)
        self.assertEqual(after.pending_effects, before.pending_effects)

    def test_older_event_cannot_overwrite_newer_state(self) -> None:
        self.registry.observe_routes("PHONE-A", usb=True, system_wifi=False, revision=5, legacy_route="usb")
        result = self.registry.observe_routes("PHONE-A", usb=False, system_wifi=True, revision=4, legacy_route="wifi")
        self.assertEqual(result.selected_route, "usb")
        self.assertEqual(result.revision, 5)

    def test_failed_source_preserves_last_known_availability(self) -> None:
        self.registry.observe_routes("PHONE-A", usb=True, system_wifi=True, revision=1, legacy_route="usb")
        result = self.registry.observe_routes(
            "PHONE-A",
            usb=None,
            system_wifi=False,
            revision=2,
            legacy_route="usb",
        )
        self.assertEqual(result.availability.usb, Availability.AVAILABLE)
        self.assertEqual(result.availability.system_wifi, Availability.UNAVAILABLE)

    def test_pairing_without_runtime_does_not_make_device_online(self) -> None:
        result = self.registry.record_authorization(
            "PHONE-A",
            AuthorizationState.PAIRED,
            revision=1,
            legacy_route=None,
        )
        self.assertIsNone(result.selected_route)

    def test_authorization_event_does_not_create_route_difference(self) -> None:
        self.registry.observe_routes("PHONE-A", usb=True, system_wifi=False, revision=1, legacy_route="usb")
        self.registry.record_authorization("PHONE-A", AuthorizationState.PAIRED, revision=2)
        self.assertEqual(self.registry.snapshot().differences, ())

    def test_registry_never_executes_policy_effects(self) -> None:
        self.registry.record_direct_runtime(
            "PHONE-A",
            DirectRuntimeState.READY,
            intent=UserIntent.DIRECT,
            revision=1,
            legacy_route="wireless_direct",
        )
        self.registry.observe_routes("PHONE-A", usb=True, system_wifi=False, revision=2, legacy_route="usb")
        snapshot = self.registry.snapshot()
        self.assertEqual(snapshot.devices["phone-a"].selected_route, "usb")
        self.assertEqual(snapshot.pending_effects[0][2].effect_type, RouteEffectType.USB_TAKEOVER)

    def test_registry_projects_only_devices_with_a_selected_route(self) -> None:
        capture = self.ledger.capture()
        self.registry.publish_discovery(DiscoverySnapshot(
            devices=(device("USB", "usb"), device("WIFI", "wifi")),
            sources={
                "usb": DiscoverySourceResult("success"),
                "system_wifi": DiscoverySourceResult("success"),
            },
            snapshot_revision=capture.snapshot_revision,
            device_revisions=capture.device_revisions,
        ))

        all_rows = self.registry.projected_snapshot(include_wifi=True)
        usb_rows = self.registry.projected_snapshot(include_wifi=False)
        self.assertEqual([(row.udid, row.selected_route) for row in all_rows.devices], [
            ("USB", "usb"),
            ("WIFI", "wifi"),
        ])
        self.assertEqual([row.udid for row in usb_rows.devices], ["USB"])

    def test_failed_usb_source_does_not_remove_last_usb_row(self) -> None:
        first = self.ledger.capture()
        self.registry.publish_discovery(DiscoverySnapshot(
            devices=(device("PHONE-A", "usb"),),
            sources={"usb": DiscoverySourceResult("success")},
            snapshot_revision=first.snapshot_revision,
            device_revisions=first.device_revisions,
        ))
        failed = self.ledger.capture()
        self.registry.publish_discovery(DiscoverySnapshot(
            devices=(),
            sources={"usb": DiscoverySourceResult("failed", "service unavailable")},
            snapshot_revision=failed.snapshot_revision,
            device_revisions=failed.device_revisions,
        ))
        self.assertEqual([row.udid for row in self.registry.projected_snapshot().devices], ["PHONE-A"])

        recovered = self.ledger.capture()
        self.registry.publish_discovery(DiscoverySnapshot(
            devices=(),
            sources={"usb": DiscoverySourceResult("success")},
            snapshot_revision=recovered.snapshot_revision,
            device_revisions=recovered.device_revisions,
        ))
        self.assertEqual(self.registry.projected_snapshot().devices, ())

    def test_one_hundred_old_scan_completion_orders_are_deterministic(self) -> None:
        for complete_old_scan_first in (index % 2 == 0 for index in range(100)):
            ledger = DeviceRevisionLedger()
            registry = DeviceRegistry(ledger)
            old_capture = ledger.capture()
            old_wifi = DiscoverySnapshot(
                devices=(device("PHONE-A", "wifi"),),
                sources={"usb": DiscoverySourceResult("success"), "system_wifi": DiscoverySourceResult("success")},
                snapshot_revision=old_capture.snapshot_revision,
                device_revisions=old_capture.device_revisions,
            )
            if complete_old_scan_first:
                registry.publish_discovery(old_wifi)
            revision = ledger.bump("PHONE-A")
            registry.record_direct_runtime(
                "PHONE-A",
                DirectRuntimeState.READY,
                intent=UserIntent.DIRECT,
                revision=revision,
                legacy_route="wireless_direct",
                device=device("PHONE-A", "wireless_direct"),
            )
            if not complete_old_scan_first:
                registry.publish_discovery(old_wifi)
            self.assertEqual(registry.get("PHONE-A").selected_route, "wireless_direct")

    def test_active_direct_session_pins_route_until_session_becomes_idle(self) -> None:
        revision = self.ledger.bump("PHONE-A")
        self.registry.record_direct_runtime(
            "PHONE-A",
            DirectRuntimeState.READY,
            intent=UserIntent.DIRECT,
            revision=revision,
            legacy_route="wireless_direct",
            device=device("PHONE-A", "wireless_direct"),
        )
        revision = self.ledger.bump("PHONE-A")
        self.registry.record_session(
            "PHONE-A",
            SessionState.ACTIVE,
            bound_route="wireless_direct",
            revision=revision,
            legacy_route="wireless_direct",
        )
        capture = self.ledger.capture()
        self.registry.publish_discovery(DiscoverySnapshot(
            devices=(device("PHONE-A", "usb"),),
            sources={"usb": DiscoverySourceResult("success")},
            snapshot_revision=capture.snapshot_revision,
            device_revisions=capture.device_revisions,
        ))
        self.assertEqual(self.registry.projected_snapshot().devices[0].selected_route, "wireless_direct")
        self.assertEqual(self.registry.snapshot().differences[-1].classification, DifferenceClassification.LEGACY_BUG)

        revision = self.ledger.bump("PHONE-A")
        self.registry.record_session(
            "PHONE-A",
            SessionState.IDLE,
            revision=revision,
            compare_legacy=False,
        )
        self.assertEqual(self.registry.projected_snapshot().devices[0].selected_route, "usb")

    def test_legacy_route_missing_from_policy_is_classified_as_policy_bug(self) -> None:
        self.registry.record_session(
            "PHONE-A",
            SessionState.IDLE,
            revision=1,
            legacy_route="usb",
        )
        self.assertEqual(self.registry.snapshot().differences[0].classification, DifferenceClassification.POLICY_BUG)


class DeviceDiscoveryCoordinatorTests(unittest.IsolatedAsyncioTestCase):
    async def test_background_publisher_populates_registry_without_http_read(self) -> None:
        ledger = DeviceRevisionLedger()
        registry = DeviceRegistry(ledger)
        capture = ledger.capture()
        discover = AsyncMock(return_value=DiscoverySnapshot(
            devices=(device("PHONE-A", "usb"),),
            sources={"usb": DiscoverySourceResult("success")},
            snapshot_revision=capture.snapshot_revision,
            device_revisions=capture.device_revisions,
        ))
        coordinator = DeviceDiscoveryCoordinator(discover, registry, interval_seconds=3600)

        await coordinator.start()
        await coordinator.wait_ready()
        await coordinator.stop()

        self.assertEqual(registry.projected_snapshot().devices[0].selected_route, "usb")
        discover.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
