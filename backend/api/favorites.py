from fastapi import APIRouter, HTTPException, Query

from core.favorites import favorite_manager
from models.schemas import Favorite, FavoriteCreateRequest, FavoriteExportDocument, FavoriteGroupCreateRequest, FavoriteImportPreview, FavoriteImportResult, FavoriteReorderRequest, FavoriteUpdateRequest

router = APIRouter(prefix="/api/favorites")


@router.get("")
async def get_favorites() -> list[Favorite]:
    return favorite_manager.list()


@router.get("/groups")
async def get_favorite_groups() -> list[str]:
    return favorite_manager.list_groups()


@router.get("/export", response_model=FavoriteExportDocument)
async def get_favorites_export(groups: list[str] | None = Query(default=None)) -> FavoriteExportDocument:
    return favorite_manager.export_document(groups)


@router.post("/import/preview", response_model=FavoriteImportPreview)
async def post_favorites_import_preview(body: FavoriteExportDocument) -> FavoriteImportPreview:
    return favorite_manager.preview_import(body)


@router.post("/import", response_model=FavoriteImportResult)
async def post_favorites_import(body: FavoriteExportDocument) -> FavoriteImportResult:
    return favorite_manager.import_document(body)


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
