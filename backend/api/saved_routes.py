from fastapi import APIRouter, HTTPException

from core.saved_routes import saved_route_manager
from models.schemas import SavedRoute, SavedRouteCreateRequest

router = APIRouter(prefix="/api/saved-routes")


@router.get("")
async def get_saved_routes() -> list[SavedRoute]:
    return saved_route_manager.list()


@router.post("")
async def post_saved_route(body: SavedRouteCreateRequest) -> SavedRoute:
    return saved_route_manager.add(body)


@router.delete("/{route_id}")
async def delete_saved_route(route_id: str) -> dict[str, str]:
    try:
        saved_route_manager.delete(route_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"status": "ok"}
