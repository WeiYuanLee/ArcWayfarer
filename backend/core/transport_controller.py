"""Single command boundary for destructive device transport operations."""

import logging
from collections.abc import Awaitable, Callable

from core.device_aggregate import AuthorizationState, DirectRuntimeState, SessionState, UserIntent
from core.device_registry import DeviceRegistry
from core.device_revision import DeviceRevisionLedger
from core.direct_transport_adapter import DirectTransportAdapter
from core.keyed_async_lock import KeyedAsyncLock
from core.route_policy import RouteEffectType
from models.schemas import DeviceInfo

logger = logging.getLogger(__name__)

EFFECT_HISTORY_LIMIT = 500
EffectIdentity = tuple[str, int, RouteEffectType]


class TransportController:
    """Serialize and publish every operation that changes a Direct runtime."""

    def __init__(
        self,
        adapter: DirectTransportAdapter,
        registry: DeviceRegistry,
        ledger: DeviceRevisionLedger,
        locks: KeyedAsyncLock,
        invalidate: Callable[[], None] = lambda: None,
    ) -> None:
        self._adapter = adapter
        self._registry = registry
        self._ledger = ledger
        self._locks = locks
        self._invalidate = invalidate
        self._handled_effects: set[EffectIdentity] = set()
        self._effect_order: list[EffectIdentity] = []

    async def connect_direct(
        self,
        udid: str,
        operation: Callable[[], Awaitable[DeviceInfo]],
    ) -> DeviceInfo:
        async with self._locks.hold(f"device:{udid}"):
            # Reconnect replaces only this device's prior runtime. Publishing
            # stays atomic from the caller's perspective.
            try:
                await self._adapter.clear_runtime(udid)
                device = await operation()
            except BaseException:
                self._publish_failed(udid, intent=UserIntent.DIRECT)
                raise
            revision = self._ledger.bump(device.udid)
            self._registry.record_authorization(
                device.udid,
                AuthorizationState.PAIRED,
                revision=revision,
                legacy_route=None,
            )
            self._registry.record_direct_runtime(
                device.udid,
                DirectRuntimeState.READY,
                intent=UserIntent.DIRECT,
                revision=revision,
                legacy_route="wireless_direct",
                device=device,
            )
            self._invalidate()
            return device.model_copy(update={"revision": revision, "selected_route": "wireless_direct"})

    async def disconnect_direct(self, udid: str) -> int:
        async with self._locks.hold(f"device:{udid}"):
            return await self._disconnect_locked(udid)

    async def cleanup_failed_direct(self, udid: str) -> int:
        """Release one transport after its bound session confirms I/O loss."""
        async with self._locks.hold(f"device:{udid}"):
            return await self._disconnect_locked(udid)

    async def disconnect_and_remove_pairing(self, udid: str, remove_pairing: Callable[[], None]) -> int:
        """Serialize runtime teardown and removal of its saved authorization."""
        async with self._locks.hold(f"device:{udid}"):
            await self._disconnect_locked(udid)
            remove_pairing()
            revision = self._ledger.bump(udid)
            self._registry.record_authorization(
                udid,
                AuthorizationState.UNPAIRED,
                revision=revision,
            )
            self._invalidate()
            return revision

    async def apply_policy_effects(self) -> None:
        """Execute each current policy effect at most once."""
        for udid, revision, effect in self._registry.snapshot().pending_effects:
            identity = (udid, revision, effect.effect_type)
            if identity in self._handled_effects:
                continue
            async with self._locks.hold(f"device:{udid}"):
                current = self._registry.get(udid)
                if (
                    effect.effect_type == RouteEffectType.USB_TAKEOVER
                    and current is not None
                    and current.revision == revision
                    and current.selected_route == "usb"
                    and current.session.state == SessionState.IDLE
                ):
                    await self._disconnect_locked(udid)
                self._remember_effect(identity)

    async def shutdown(self) -> None:
        """Release every owned runtime during application shutdown."""
        for udid in self._adapter.runtime_udids():
            async with self._locks.hold(f"device:{udid}"):
                try:
                    await self._adapter.clear_runtime(udid)
                except Exception:
                    # One damaged tunnel must not prevent the remaining
                    # device handles from being released during shutdown.
                    logger.exception("Failed to release Direct runtime for %s during shutdown", udid)

    async def _disconnect_locked(self, udid: str) -> int:
        try:
            await self._adapter.clear_runtime(udid)
        except BaseException:
            self._publish_failed(udid, intent=UserIntent.AUTO)
            raise
        revision = self._ledger.bump(udid)
        self._registry.record_direct_runtime(
            udid,
            DirectRuntimeState.DISCONNECTED,
            intent=UserIntent.AUTO,
            revision=revision,
            legacy_route=None,
        )
        self._invalidate()
        return revision

    def _publish_failed(self, udid: str, *, intent: UserIntent) -> int:
        revision = self._ledger.bump(udid)
        self._registry.record_direct_runtime(
            udid,
            DirectRuntimeState.FAILED,
            intent=intent,
            revision=revision,
            legacy_route=None,
        )
        self._invalidate()
        return revision

    def _remember_effect(self, identity: EffectIdentity) -> None:
        self._handled_effects.add(identity)
        self._effect_order.append(identity)
        if len(self._effect_order) > EFFECT_HISTORY_LIMIT:
            oldest = self._effect_order.pop(0)
            self._handled_effects.discard(oldest)
