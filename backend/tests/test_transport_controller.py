import unittest
from unittest.mock import AsyncMock, Mock, patch

from core.device_aggregate import AuthorizationState, DirectRuntimeState, UserIntent
from core.device_registry import DeviceRegistry
from core.device_revision import DeviceRevisionLedger
from core.keyed_async_lock import KeyedAsyncLock
from core.transport_controller import TransportController
from models.schemas import DeviceInfo


class FakeDirectAdapter:
    def __init__(self, udids: tuple[str, ...] = ()) -> None:
        self.udids = udids
        self.clear_runtime = AsyncMock()

    def runtime_udids(self) -> tuple[str, ...]:
        return self.udids


def direct_device(udid: str) -> DeviceInfo:
    return DeviceInfo(
        udid=udid,
        name=udid,
        ios_version="17.4",
        transport="rsd",
        connection_type="wireless_direct",
        status="ready",
    )


class TransportControllerTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.ledger = DeviceRevisionLedger()
        self.registry = DeviceRegistry(self.ledger)
        self.adapter = FakeDirectAdapter()
        self.invalidate = Mock()
        self.controller = TransportController(
            self.adapter,
            self.registry,
            self.ledger,
            KeyedAsyncLock(),
            self.invalidate,
        )

    def publish_ready_direct(self, udid: str) -> None:
        revision = self.ledger.bump(udid)
        self.registry.record_direct_runtime(
            udid,
            DirectRuntimeState.READY,
            intent=UserIntent.DIRECT,
            revision=revision,
            legacy_route="wireless_direct",
            device=direct_device(udid),
        )

    async def test_usb_takeover_effect_runs_once_for_one_revision(self) -> None:
        self.publish_ready_direct("PHONE-A")
        revision = self.ledger.bump("PHONE-A")
        self.registry.observe_routes(
            "PHONE-A",
            usb=True,
            system_wifi=False,
            revision=revision,
            legacy_route="usb",
        )

        await self.controller.apply_policy_effects()
        await self.controller.apply_policy_effects()

        self.adapter.clear_runtime.assert_awaited_once_with("phone-a")
        current = self.registry.get("PHONE-A")
        self.assertEqual(current.selected_route, "usb")
        self.assertEqual(current.direct_runtime, DirectRuntimeState.DISCONNECTED)

    async def test_stale_usb_takeover_effect_cannot_close_newer_direct_command(self) -> None:
        self.publish_ready_direct("PHONE-A")
        takeover_revision = self.ledger.bump("PHONE-A")
        self.registry.observe_routes(
            "PHONE-A",
            usb=True,
            system_wifi=False,
            revision=takeover_revision,
            legacy_route="usb",
        )
        newer_revision = self.ledger.bump("PHONE-A")
        self.registry.record_direct_runtime(
            "PHONE-A",
            DirectRuntimeState.READY,
            intent=UserIntent.DIRECT,
            revision=newer_revision,
            legacy_route="wireless_direct",
            device=direct_device("PHONE-A"),
        )

        await self.controller.apply_policy_effects()

        self.adapter.clear_runtime.assert_not_awaited()

    async def test_failed_transport_cleanup_isolated_to_target_device(self) -> None:
        self.publish_ready_direct("PHONE-A")
        self.publish_ready_direct("PHONE-B")

        await self.controller.cleanup_failed_direct("PHONE-B")

        self.adapter.clear_runtime.assert_awaited_once_with("PHONE-B")
        self.assertEqual(self.registry.get("PHONE-A").direct_runtime, DirectRuntimeState.READY)
        self.assertEqual(self.registry.get("PHONE-B").direct_runtime, DirectRuntimeState.DISCONNECTED)

    async def test_connect_replaces_target_and_publishes_one_ready_revision(self) -> None:
        result = await self.controller.connect_direct(
            "PHONE-A",
            AsyncMock(return_value=direct_device("PHONE-A")),
        )

        self.adapter.clear_runtime.assert_awaited_once_with("PHONE-A")
        self.assertEqual(result.selected_route, "wireless_direct")
        self.assertEqual(result.revision, self.ledger.revision_for("PHONE-A"))
        self.assertEqual(self.registry.get("PHONE-A").direct_runtime, DirectRuntimeState.READY)
        self.invalidate.assert_called_once_with()

    async def test_failed_reconnect_cannot_leave_registry_ready(self) -> None:
        self.publish_ready_direct("PHONE-A")

        with self.assertRaises(ConnectionError):
            await self.controller.connect_direct(
                "PHONE-A",
                AsyncMock(side_effect=ConnectionError("new network unavailable")),
            )

        current = self.registry.get("PHONE-A")
        self.assertEqual(current.direct_runtime, DirectRuntimeState.FAILED)
        self.assertIsNone(current.selected_route)

    async def test_remove_pairing_tears_down_runtime_and_authorization_atomically(self) -> None:
        self.publish_ready_direct("PHONE-A")
        remove = Mock()

        revision = await self.controller.disconnect_and_remove_pairing("PHONE-A", remove)

        remove.assert_called_once_with()
        current = self.registry.get("PHONE-A")
        self.assertEqual(current.direct_runtime, DirectRuntimeState.DISCONNECTED)
        self.assertEqual(current.authorization, AuthorizationState.UNPAIRED)
        self.assertEqual(current.revision, revision)

    async def test_shutdown_releases_every_owned_runtime_without_policy_mutation(self) -> None:
        self.adapter.udids = ("phone-a", "phone-b")

        await self.controller.shutdown()

        self.assertEqual(
            self.adapter.clear_runtime.await_args_list,
            [unittest.mock.call("phone-a"), unittest.mock.call("phone-b")],
        )
        self.assertEqual(self.ledger.capture().snapshot_revision, 0)

    async def test_shutdown_continues_after_one_runtime_fails_to_close(self) -> None:
        self.adapter.udids = ("phone-a", "phone-b")
        self.adapter.clear_runtime.side_effect = [OSError("already closed"), None]

        with patch("core.transport_controller.logger.exception") as logged:
            await self.controller.shutdown()

        self.assertEqual(
            self.adapter.clear_runtime.await_args_list,
            [unittest.mock.call("phone-a"), unittest.mock.call("phone-b")],
        )
        logged.assert_called_once()


if __name__ == "__main__":
    unittest.main()
