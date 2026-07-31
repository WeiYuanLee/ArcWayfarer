from fastapi import APIRouter, HTTPException

from core import random_walk
from models.schemas import NavigateStopRequest, RandomWalkStartRequest

router = APIRouter(prefix="/api/random-walk")


@router.post("/start")
async def post_start(body: RandomWalkStartRequest) -> dict:
    try:
        await random_walk.start_random_walk(
            body.udid,
            body.nav_mode,
            (body.center.lat, body.center.lng),
            body.radius_m,
            pause_enabled=body.pause_enabled,
            pause_min=body.pause_min,
            pause_max=body.pause_max,
            custom_speed_kmh=body.custom_speed_kmh,
            straight_line=body.straight_line,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:  # noqa: BLE001 - surface route/device/tunnel errors to the UI
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"status": "ok"}


@router.post("/stop")
async def post_stop(body: NavigateStopRequest) -> dict:
    stopped = random_walk.stop_random_walk(body.udid)
    return {"status": "ok", "stopped": stopped}


@router.post("/pause")
async def post_pause(body: NavigateStopRequest) -> dict:
    paused = await random_walk.pause_random_walk(body.udid)
    return {"status": "ok", "paused": paused}


@router.post("/resume")
async def post_resume(body: NavigateStopRequest) -> dict:
    resumed = await random_walk.resume_random_walk(body.udid)
    return {"status": "ok", "resumed": resumed}
