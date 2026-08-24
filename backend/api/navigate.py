from fastapi import APIRouter, HTTPException

from config import NAV_MODE_SPEED_MPS
from core import navigator
from models.schemas import NavigatePreviewRequest, NavigateStartRequest, NavigateStopRequest
from services import route_service

router = APIRouter(prefix="/api/navigate")


@router.get("/modes")
def get_modes() -> dict:
    return dict(NAV_MODE_SPEED_MPS)


@router.post("/preview")
async def post_preview(body: NavigatePreviewRequest) -> dict:
    try:
        plan = await route_service.fetch_route_plan(
            body.nav_mode,
            (body.start.lat, body.start.lng),
            (body.end.lat, body.end.lng),
        )
    except Exception as e:  # noqa: BLE001 - surface routing errors without changing device state
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {
        "status": "ok",
        "route": [{"lat": lat, "lng": lng} for lat, lng in plan.points],
        "distance_m": plan.distance_m,
    }


@router.post("/start")
async def post_start(body: NavigateStartRequest) -> dict:
    try:
        route_points = await navigator.start_navigate(
            body.udid,
            body.nav_mode,
            (body.start.lat, body.start.lng),
            (body.end.lat, body.end.lng),
            custom_speed_kmh=body.custom_speed_kmh,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:  # noqa: BLE001 - surface route/device/tunnel errors to the UI
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"status": "ok", "route": [{"lat": lat, "lng": lng} for lat, lng in route_points]}


@router.post("/stop")
async def post_stop(body: NavigateStopRequest) -> dict:
    stopped = navigator.stop_navigate(body.udid)
    return {"status": "ok", "stopped": stopped}


@router.post("/pause")
async def post_pause(body: NavigateStopRequest) -> dict:
    paused = await navigator.pause_navigate(body.udid)
    return {"status": "ok", "paused": paused}


@router.post("/resume")
async def post_resume(body: NavigateStopRequest) -> dict:
    resumed = await navigator.resume_navigate(body.udid)
    return {"status": "ok", "resumed": resumed}
