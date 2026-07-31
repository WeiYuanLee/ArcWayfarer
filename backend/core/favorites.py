import time
import uuid

from config import BOOKMARKS_FILE
from models.schemas import Favorite
from services.storage import safe_load_json, safe_write_json


class FavoriteManager:
    def __init__(self) -> None:
        raw = safe_load_json(BOOKMARKS_FILE, [])
        self._favorites: list[Favorite] = [Favorite(**f) for f in raw]

    def list(self) -> list[Favorite]:
        return list(self._favorites)

    def add(self, name: str, lat: float, lng: float) -> Favorite:
        favorite = Favorite(id=uuid.uuid4().hex, name=name, lat=lat, lng=lng, created_at=int(time.time()))
        self._favorites.append(favorite)
        self._save()
        return favorite

    def update(self, favorite_id: str, name: str) -> Favorite:
        for favorite in self._favorites:
            if favorite.id == favorite_id:
                favorite.name = name
                self._save()
                return favorite
        raise ValueError(f"Favorite not found: {favorite_id}")

    def delete(self, favorite_id: str) -> None:
        before = len(self._favorites)
        self._favorites = [f for f in self._favorites if f.id != favorite_id]
        if len(self._favorites) == before:
            raise ValueError(f"Favorite not found: {favorite_id}")
        self._save()

    def _save(self) -> None:
        safe_write_json(BOOKMARKS_FILE, [f.model_dump() for f in self._favorites])


favorite_manager = FavoriteManager()
