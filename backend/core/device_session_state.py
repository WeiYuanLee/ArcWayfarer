"""Publish session lifecycle events without depending on device management."""

from core.device_aggregate import SessionState
from core.device_registry import device_registry
from core.device_revision import device_revision_ledger
from models.schemas import DeviceConnectionType


def publish_session_state(
    udid: str,
    state: SessionState,
    bound_route: DeviceConnectionType | None,
    *,
    transport_identity: str | None = None,
    compare_legacy: bool = True,
) -> int:
    revision = device_revision_ledger.bump(udid)
    device_registry.record_session(
        udid,
        state,
        bound_route=bound_route,
        transport_identity=transport_identity,
        revision=revision,
        legacy_route=bound_route,
        compare_legacy=compare_legacy,
    )
    return revision
