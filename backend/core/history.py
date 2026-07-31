import math
import time

from config import HISTORY_DEDUPE_DIST_M, HISTORY_FILE, MAX_HISTORY_ENTRIES
from models.schemas import HistoryEntry
from services.storage import safe_load_json, safe_write_json


def _distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


class HistoryManager:
    def __init__(self) -> None:
        raw = safe_load_json(HISTORY_FILE, [])
        self._entries: list[HistoryEntry] = [HistoryEntry(**e) for e in raw]

    def list(self) -> list[HistoryEntry]:
        return list(reversed(self._entries))

    def push(self, lat: float, lng: float, kind: str, name: str | None) -> HistoryEntry:
        now = int(time.time())
        if self._entries:
            last = self._entries[-1]
            if _distance_m(last.lat, last.lng, lat, lng) < HISTORY_DEDUPE_DIST_M:
                last.ts = now
                last.name = name or last.name
                last.kind = kind  # type: ignore[assignment]
                self._save()
                return last

        entry = HistoryEntry(lat=lat, lng=lng, kind=kind, name=name, ts=now)  # type: ignore[arg-type]
        self._entries.append(entry)
        if len(self._entries) > MAX_HISTORY_ENTRIES:
            self._entries = self._entries[-MAX_HISTORY_ENTRIES:]
        self._save()
        return entry

    def clear(self) -> None:
        self._entries = []
        self._save()

    def _save(self) -> None:
        safe_write_json(HISTORY_FILE, [e.model_dump() for e in self._entries])


history_manager = HistoryManager()
