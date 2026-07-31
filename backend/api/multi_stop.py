from fastapi import APIRouter, HTTPException

from core import multi_stop
from models.schemas import MultiStopStartRequest, NavigateStopRequest

router = APIRouter(prefix="/api/multi-stop")


@router.post("/start")
async def post_start(body: MultiStopStartRequest) -> dict:
    try:
        route_points = await multi_stop.start_multi_stop(
            body.udid,
            body.nav_mode,
            [(wp.lat, wp.lng) for wp in body.waypoints],
            pause_enabled=body.pause_enabled,
            pause_min=body.pause_min,
            pause_max=body.pause_max,
            straight_line=body.straight_line,
            jump_mode=body.jump_mode,
            jump_pre_delay=body.jump_pre_delay,
            jump_post_delay=body.jump_post_delay,
            custom_speed_kmh=body.custom_speed_kmh,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:  # noqa: BLE001 - surface route/device/tunnel errors to the UI
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"status": "ok", "route": [{"lat": lat, "lng": lng} for lat, lng in route_points]}


@router.post("/stop")
async def post_stop(body: NavigateStopRequest) -> dict:
    stopped = multi_stop.stop_multi_stop(body.udid)
    return {"status": "ok", "stopped": stopped}


@router.post("/pause")
async def post_pause(body: NavigateStopRequest) -> dict:
    paused = await multi_stop.pause_multi_stop(body.udid)
    return {"status": "ok", "paused": paused}


@router.post("/resume")
async def post_resume(body: NavigateStopRequest) -> dict:
    resumed = await multi_stop.resume_multi_stop(body.udid)
    return {"status": "ok", "resumed": resumed}
