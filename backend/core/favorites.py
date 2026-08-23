from __future__ import annotations

import time
import uuid
from datetime import UTC, datetime

from config import BOOKMARKS_FILE, FAVORITE_GROUPS_FILE
from models.schemas import Favorite, FavoriteExportDocument, FavoriteExportItem, FavoriteImportPreview, FavoriteImportResult, FavoriteReorderItem
from services.storage import safe_load_json, safe_write_json


class FavoriteManager:
    def __init__(self) -> None:
        raw = safe_load_json(BOOKMARKS_FILE, [])
        self._favorites: list[Favorite] = [Favorite(**f) for f in raw]
        self._groups: list[str] = self._load_groups()

    def list(self) -> list[Favorite]:
        return sorted(self._favorites, key=lambda f: f.order)

    def list_groups(self) -> list[str]:
        favorite_groups = {favorite.group.strip() for favorite in self._favorites if favorite.group.strip()}
        return sorted(set(self._groups) | favorite_groups, key=str.casefold)

    def add_group(self, name: str) -> str:
        normalized = name.strip()
        if not normalized:
            raise ValueError("Group name cannot be empty.")
        if normalized.casefold() not in {group.casefold() for group in self.list_groups()}:
            self._groups.append(normalized)
            self._save_groups()
        return normalized

    def add(self, name: str, lat: float, lng: float, group: str = "", notes: str = "") -> Favorite:
        max_order = max((f.order for f in self._favorites), default=-1)
        favorite = Favorite(
            id=uuid.uuid4().hex,
            name=name,
            lat=lat,
            lng=lng,
            created_at=int(time.time()),
            group=group,
            notes=notes,
            order=max_order + 1,
        )
        self._favorites.append(favorite)
        self._save()
        return favorite

    def update(self, favorite_id: str, name: "str | None" = None, group: "str | None" = None, notes: "str | None" = None) -> Favorite:
        for favorite in self._favorites:
            if favorite.id == favorite_id:
                if name is not None:
                    favorite.name = name
                if group is not None:
                    favorite.group = group
                if notes is not None:
                    favorite.notes = notes
                self._save()
                return favorite
        raise ValueError(f"Favorite not found: {favorite_id}")

    def reorder(self, items: list[FavoriteReorderItem]) -> list[Favorite]:
        order_map = {item.id: item.order for item in items}
        for favorite in self._favorites:
            if favorite.id in order_map:
                favorite.order = order_map[favorite.id]
        self._save()
        return self.list()

    def delete(self, favorite_id: str) -> None:
        before = len(self._favorites)
        self._favorites = [f for f in self._favorites if f.id != favorite_id]
        if len(self._favorites) == before:
            raise ValueError(f"Favorite not found: {favorite_id}")
        self._save()

    def export_document(self, groups: list[str] | None = None) -> FavoriteExportDocument:
        selected_group_keys = None if groups is None else {group.strip().casefold() for group in groups}
        favorites = [
            favorite
            for favorite in self.list()
            if selected_group_keys is None or favorite.group.strip().casefold() in selected_group_keys
        ]
        exported_groups = self.list_groups() if selected_group_keys is None else [
            group for group in self.list_groups() if group.casefold() in selected_group_keys
        ]
        return FavoriteExportDocument(
            exported_at=datetime.now(UTC).isoformat(),
            groups=exported_groups,
            favorites=[
                FavoriteExportItem(
                    name=favorite.name,
                    lat=favorite.lat,
                    lng=favorite.lng,
                    group=favorite.group,
                    notes=favorite.notes,
                    created_at=favorite.created_at,
                    order=favorite.order,
                )
                for favorite in favorites
            ],
        )

    def preview_import(self, document: FavoriteExportDocument) -> FavoriteImportPreview:
        additions, duplicates = self._partition_import_favorites(document.favorites)
        existing_group_keys = {group.casefold() for group in self.list_groups()}
        groups_to_add: list[str] = []
        for group in [*document.groups, *(favorite.group for favorite in additions)]:
            normalized = group.strip()
            key = normalized.casefold()
            if normalized and key not in existing_group_keys:
                existing_group_keys.add(key)
                groups_to_add.append(normalized)
        return FavoriteImportPreview(
            total=len(document.favorites),
            additions=len(additions),
            duplicates=duplicates,
            groups_to_add=groups_to_add,
        )

    def import_document(self, document: FavoriteExportDocument) -> FavoriteImportResult:
        additions, duplicates = self._partition_import_favorites(document.favorites)
        existing_groups = self.list_groups()
        canonical_groups = {group.casefold(): group for group in existing_groups}
        groups_to_add: list[str] = []
        for group in [*document.groups, *(favorite.group for favorite in additions)]:
            normalized = group.strip()
            key = normalized.casefold()
            if normalized and key not in canonical_groups:
                canonical_groups[key] = normalized
                groups_to_add.append(normalized)

        next_order = max((favorite.order for favorite in self._favorites), default=-1) + 1
        imported: list[Favorite] = []
        for item in additions:
            group = item.group.strip()
            imported.append(Favorite(
                id=uuid.uuid4().hex,
                name=item.name.strip(),
                lat=item.lat,
                lng=item.lng,
                created_at=item.created_at,
                group=canonical_groups.get(group.casefold(), "") if group else "",
                notes=item.notes.strip(),
                order=next_order,
            ))
            next_order += 1

        # Validate and calculate everything before writing either file, so an
        # import never leaves behind a partially applied collection.
        self._favorites.extend(imported)
        self._groups = self.list_groups() + groups_to_add
        self._save()
        self._save_groups()
        return FavoriteImportResult(
            total=len(document.favorites),
            additions=len(imported),
            duplicates=duplicates,
            groups_to_add=groups_to_add,
            imported=len(imported),
        )

    def _partition_import_favorites(self, candidates: list[FavoriteExportItem]) -> tuple[list[FavoriteExportItem], int]:
        accepted: list[FavoriteExportItem] = []
        comparisons: list[tuple[float, float]] = [(favorite.lat, favorite.lng) for favorite in self._favorites]
        duplicates = 0
        for item in candidates:
            if any(self._distance_meters(item.lat, item.lng, lat, lng) <= 5 for lat, lng in comparisons):
                duplicates += 1
                continue
            accepted.append(item)
            comparisons.append((item.lat, item.lng))
        return accepted, duplicates

    @staticmethod
    def _distance_meters(lat_a: float, lng_a: float, lat_b: float, lng_b: float) -> float:
        from math import asin, cos, radians, sin, sqrt

        earth_radius_m = 6_371_000
        delta_lat = radians(lat_b - lat_a)
        delta_lng = radians(lng_b - lng_a)
        value = sin(delta_lat / 2) ** 2 + cos(radians(lat_a)) * cos(radians(lat_b)) * sin(delta_lng / 2) ** 2
        return 2 * earth_radius_m * asin(sqrt(value))

    def _save(self) -> None:
        safe_write_json(BOOKMARKS_FILE, [f.model_dump() for f in self._favorites])

    def _load_groups(self) -> list[str]:
        raw = safe_load_json(FAVORITE_GROUPS_FILE, [])
        return [group.strip() for group in raw if isinstance(group, str) and group.strip()]

    def _save_groups(self) -> None:
        safe_write_json(FAVORITE_GROUPS_FILE, self.list_groups())


favorite_manager = FavoriteManager()
