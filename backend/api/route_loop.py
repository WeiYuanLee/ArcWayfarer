from fastapi import APIRouter, HTTPException

from core import route_loop
from models.schemas import NavigateStopRequest, RouteLoopStartRequest

router = APIRouter(prefix="/api/route-loop")


@router.post("/start")
async def post_start(body: RouteLoopStartRequest) -> dict:
    try:
        route_points, route_legs = await route_loop.start_route_loop(
            body.udid,
            body.nav_mode,
            [(wp.lat, wp.lng) for wp in body.waypoints],
            pause_enabled=body.pause_enabled,
            pause_min=body.pause_min,
            pause_max=body.pause_max,
            straight_line=body.straight_line,
            jump_leg_indices=body.jump_leg_indices,
            custom_speed_kmh=body.custom_speed_kmh,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:  # noqa: BLE001 - surface route/device/tunnel errors to the UI
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {
        "status": "ok",
        "route": [{"lat": lat, "lng": lng} for lat, lng in route_points],
        "legs": [[{"lat": lat, "lng": lng} for lat, lng in leg] for leg in route_legs],
    }


@router.post("/stop")
async def post_stop(body: NavigateStopRequest) -> dict:
    stopped = route_loop.stop_route_loop(body.udid)
    return {"status": "ok", "stopped": stopped}


@router.post("/pause")
async def post_pause(body: NavigateStopRequest) -> dict:
    paused = await route_loop.pause_route_loop(body.udid)
    return {"status": "ok", "paused": paused}


@router.post("/resume")
async def post_resume(body: NavigateStopRequest) -> dict:
    resumed = await route_loop.resume_route_loop(body.udid)
    return {"status": "ok", "resumed": resumed}
