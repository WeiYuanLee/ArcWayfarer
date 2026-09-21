"""Monotonic revision ledger shared by P1 snapshots and future Registry state."""

from dataclasses import dataclass
from types import MappingProxyType
from typing import Mapping


@dataclass(frozen=True)
class RevisionCapture:
    snapshot_revision: int
    device_revisions: Mapping[str, int]


class DeviceRevisionLedger:
    def __init__(self) -> None:
        self._snapshot_revision = 0
        self._device_revisions: dict[str, int] = {}

    def capture(self) -> RevisionCapture:
        return RevisionCapture(
            snapshot_revision=self._snapshot_revision,
            device_revisions=MappingProxyType(dict(self._device_revisions)),
        )

    def bump(self, udid: str) -> int:
        self._snapshot_revision += 1
        key = udid.strip().lower()
        self._device_revisions[key] = self._snapshot_revision
        return self._snapshot_revision

    def revision_for(self, udid: str) -> int:
        return self._device_revisions.get(udid.strip().lower(), 0)


device_revision_ledger = DeviceRevisionLedger()
