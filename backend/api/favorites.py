from fastapi import APIRouter, HTTPException

from core.favorites import favorite_manager
from models.schemas import Favorite, FavoriteCreateRequest, FavoriteUpdateRequest

router = APIRouter(prefix="/api/favorites")


@router.get("")
async def get_favorites() -> list[Favorite]:
    return favorite_manager.list()


@router.post("")
async def post_favorite(body: FavoriteCreateRequest) -> Favorite:
    return favorite_manager.add(body.name, body.lat, body.lng)


@router.put("/{favorite_id}")
async def put_favorite(favorite_id: str, body: FavoriteUpdateRequest) -> Favorite:
    try:
        return favorite_manager.update(favorite_id, body.name)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.delete("/{favorite_id}")
async def delete_favorite(favorite_id: str) -> dict:
    try:
        favorite_manager.delete(favorite_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return {"status": "ok"}
