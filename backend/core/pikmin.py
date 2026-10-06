from __future__ import annotations

from collections import Counter
from secrets import choice
from threading import RLock

from config import PIKMIN_POSTCARDS_FILE, PIKMIN_PURESPOTS_FILE
from models.schemas import PikminPostcard, PikminPureSpot
from services.storage import safe_load_json, safe_write_json


class PikminRepository:
    def __init__(self) -> None:
        self._lock = RLock()
        self._postcards: list[PikminPostcard] = []
        self._purespots: list[PikminPureSpot] = []
        self.reload()

    def reload(self) -> None:
        postcards_raw = safe_load_json(PIKMIN_POSTCARDS_FILE, [])
        purespots_raw = safe_load_json(PIKMIN_PURESPOTS_FILE, [])
        postcards = [PikminPostcard(**item) for item in postcards_raw if isinstance(item, dict)]
        purespots = [PikminPureSpot(**item) for item in purespots_raw if isinstance(item, dict)]
        with self._lock:
            self._postcards = postcards
            self._purespots = purespots

    def replace(self, postcards: list[PikminPostcard], purespots: list[PikminPureSpot]) -> None:
        safe_write_json(PIKMIN_POSTCARDS_FILE, [item.model_dump() for item in postcards])
        safe_write_json(PIKMIN_PURESPOTS_FILE, [item.model_dump() for item in purespots])
        with self._lock:
            self._postcards = list(postcards)
            self._purespots = list(purespots)

    def postcard(self, source_id: int) -> PikminPostcard | None:
        with self._lock:
            return next((item for item in self._postcards if item.id == source_id), None)

    def remove_postcard(self, source_id: int) -> bool:
        """Remove a postcard that the source has confirmed no longer exists."""
        with self._lock:
            remaining = [item for item in self._postcards if item.id != source_id]
            if len(remaining) == len(self._postcards):
                return False
            safe_write_json(PIKMIN_POSTCARDS_FILE, [item.model_dump() for item in remaining])
            self._postcards = remaining
            return True

    def purespot(self, source_id: int) -> PikminPureSpot | None:
        with self._lock:
            return next((item for item in self._purespots if item.id == source_id), None)

    def random_purespot(self, decor_type: str) -> PikminPureSpot | None:
        normalized_type = decor_type.strip().casefold()
        if not normalized_type:
            return None
        with self._lock:
            matches = [item for item in self._purespots if item.type.casefold() == normalized_type]
        return choice(matches) if matches else None

    def query_postcards(
        self,
        query: str = "",
        country: str = "",
        postcard_type: str = "",
        page: int = 1,
        page_size: int = 20,
    ) -> dict:
        normalized_query = query.strip().casefold()
        normalized_country = country.strip().casefold()
        normalized_type = postcard_type.strip().casefold()
        with self._lock:
            all_postcards = list(self._postcards)
        filtered = [
            item
            for item in all_postcards
            if (not normalized_query or normalized_query in f"{item.name} {item.description}".casefold())
            and (not normalized_country or item.country.casefold() == normalized_country)
            and (not normalized_type or item.type == normalized_type)
        ]
        start = (page - 1) * page_size
        countries = sorted({item.country for item in all_postcards if item.country}, key=str.casefold)
        return {
            "items": filtered[start:start + page_size],
            "total": len(filtered),
            "page": page,
            "page_size": page_size,
            "countries": countries,
        }

    def query_purespots(
        self,
        min_lat: float,
        min_lng: float,
        max_lat: float,
        max_lng: float,
        decor_types: list[str] | None = None,
    ) -> list[PikminPureSpot]:
        selected_types = {item for item in (decor_types or []) if item}
        with self._lock:
            items = list(self._purespots)
        return [
            item
            for item in items
            if min_lat <= item.lat <= max_lat
            and min_lng <= item.lng <= max_lng
            and (not selected_types or item.type in selected_types)
        ]

    def purespot_types(self) -> list[dict]:
        with self._lock:
            items = list(self._purespots)
        counts = Counter(item.type for item in items)
        icons: dict[str, str] = {}
        for item in items:
            icons.setdefault(item.type, item.icon)
        return [
            {"type": item_type, "icon": icons[item_type], "count": count}
            for item_type, count in sorted(counts.items(), key=lambda pair: pair[0])
        ]

    def counts(self) -> dict[str, int]:
        with self._lock:
            return {"postcards": len(self._postcards), "purespots": len(self._purespots)}


pikmin_repository = PikminRepository()
