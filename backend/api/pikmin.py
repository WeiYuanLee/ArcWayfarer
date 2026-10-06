import httpx
from fastapi import APIRouter, HTTPException, Query, Response, status

from core.favorites import favorite_manager
from core.pikmin import pikmin_repository
from models.schemas import Favorite, PikminPostcard, PikminPureSpot, PikminSourceFavoriteRequest
from services.pikmin_sync import fetch_postcard_image, pikmin_sync_service


router = APIRouter(prefix="/api/pikmin")


@router.get("/postcards")
async def get_postcards(
    query: str = Query(default="", max_length=100),
    country: str = Query(default="", max_length=80),
    type: str = Query(default="", pattern="^(|mushroom|flower|hidden)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=60),
) -> dict:
    return pikmin_repository.query_postcards(query, country, type, page, page_size)


@router.get("/postcards/{source_id}/image")
async def get_postcard_image(source_id: int) -> Response:
    postcard = pikmin_repository.postcard(source_id)
    if postcard is None or not postcard.image_url:
        raise HTTPException(status_code=404, detail="Postcard image was not found.")
    try:
        content, content_type = await fetch_postcard_image(postcard.image_url)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code in {404, 410}:
            pikmin_repository.remove_postcard(source_id)
            raise HTTPException(status_code=404, detail="The postcard was removed from the source.") from exc
        raise HTTPException(status_code=502, detail="Unable to load the postcard image.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Unable to load the postcard image.") from exc
    return Response(
        content=content,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=86400, stale-while-revalidate=604800"},
    )


@router.get("/purespots", response_model=list[PikminPureSpot])
async def get_purespots(
    min_lat: float = Query(ge=-90.0, le=90.0),
    min_lng: float = Query(ge=-180.0, le=180.0),
    max_lat: float = Query(ge=-90.0, le=90.0),
    max_lng: float = Query(ge=-180.0, le=180.0),
    decor_type: list[str] | None = Query(default=None),
) -> list[PikminPureSpot]:
    if min_lat > max_lat or min_lng > max_lng:
        raise HTTPException(status_code=422, detail="Invalid bounding box.")
    return pikmin_repository.query_purespots(min_lat, min_lng, max_lat, max_lng, decor_type)


@router.get("/purespots/types")
async def get_purespot_types() -> list[dict]:
    return pikmin_repository.purespot_types()


@router.get("/purespots/random", response_model=PikminPureSpot)
async def get_random_purespot(
    decor_type: str = Query(min_length=1, max_length=80),
) -> PikminPureSpot:
    spot = pikmin_repository.random_purespot(decor_type)
    if spot is None:
        raise HTTPException(status_code=404, detail="No pure spot was found for this decor type.")
    return spot


@router.post("/favorites", response_model=Favorite)
async def post_source_favorite(body: PikminSourceFavoriteRequest) -> Favorite:
    source: PikminPostcard | PikminPureSpot | None
    if body.source_type == "postcard":
        source = pikmin_repository.postcard(body.source_id)
    else:
        source = pikmin_repository.purespot(body.source_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Pikmin source location was not found.")
    try:
        return favorite_manager.add_pikmin_source(source)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/sync", status_code=status.HTTP_202_ACCEPTED)
async def post_sync() -> dict:
    return pikmin_sync_service.start()


@router.get("/sync/status")
async def get_sync_status() -> dict:
    return pikmin_sync_service.status()
