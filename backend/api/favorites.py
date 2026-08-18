from fastapi import APIRouter, HTTPException

from core.favorites import favorite_manager
from models.schemas import Favorite, FavoriteCreateRequest, FavoriteGroupCreateRequest, FavoriteReorderRequest, FavoriteUpdateRequest

router = APIRouter(prefix="/api/favorites")


@router.get("")
async def get_favorites() -> list[Favorite]:
    return favorite_manager.list()


@router.get("/groups")
async def get_favorite_groups() -> list[str]:
    return favorite_manager.list_groups()


@router.post("/groups")
async def post_favorite_group(body: FavoriteGroupCreateRequest) -> str:
    try:
        return favorite_manager.add_group(body.name)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e


@router.post("")
async def post_favorite(body: FavoriteCreateRequest) -> Favorite:
    return favorite_manager.add(body.name, body.lat, body.lng, body.group, body.notes)


@router.put("/reorder")
async def put_reorder(body: FavoriteReorderRequest) -> list[Favorite]:
    return favorite_manager.reorder(body.items)


@router.put("/{favorite_id}")
async def put_favorite(favorite_id: str, body: FavoriteUpdateRequest) -> Favorite:
    try:
        return favorite_manager.update(favorite_id, body.name, body.group, body.notes)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.delete("/{favorite_id}")
async def delete_favorite(favorite_id: str) -> dict:
    try:
        favorite_manager.delete(favorite_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return {"status": "ok"}
