import time
import uuid

from config import ROUTES_FILE
from models.schemas import SavedRoute, SavedRouteCreateRequest
from services.storage import safe_load_json, safe_write_json


class SavedRouteManager:
    def __init__(self) -> None:
        raw = safe_load_json(ROUTES_FILE, [])
        self._routes: list[SavedRoute] = []
        for item in raw:
            try:
                self._routes.append(SavedRoute(**item))
            except (TypeError, ValueError):
                # One damaged entry must not make the entire route library
                # unavailable. A later write naturally drops invalid entries.
                continue

    def list(self) -> list[SavedRoute]:
        return sorted(self._routes, key=lambda route: route.updated_at, reverse=True)

    def add(self, body: SavedRouteCreateRequest) -> SavedRoute:
        now = int(time.time())
        route = SavedRoute(
            id=uuid.uuid4().hex,
            created_at=now,
            updated_at=now,
            **body.model_dump(),
        )
        self._routes.append(route)
        self._save()
        return route

    def delete(self, route_id: str) -> None:
        before = len(self._routes)
        self._routes = [route for route in self._routes if route.id != route_id]
        if len(self._routes) == before:
            raise ValueError(f"Saved route not found: {route_id}")
        self._save()

    def _save(self) -> None:
        safe_write_json(ROUTES_FILE, [route.model_dump() for route in self._routes])


saved_route_manager = SavedRouteManager()
