from __future__ import annotations

import time
import uuid

from config import BOOKMARKS_FILE, FAVORITE_GROUPS_FILE
from models.schemas import Favorite, FavoriteReorderItem
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

    def _save(self) -> None:
        safe_write_json(BOOKMARKS_FILE, [f.model_dump() for f in self._favorites])

    def _load_groups(self) -> list[str]:
        raw = safe_load_json(FAVORITE_GROUPS_FILE, [])
        return [group.strip() for group in raw if isinstance(group, str) and group.strip()]

    def _save_groups(self) -> None:
        safe_write_json(FAVORITE_GROUPS_FILE, self.list_groups())


favorite_manager = FavoriteManager()
