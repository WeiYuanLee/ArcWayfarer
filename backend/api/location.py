from fastapi import APIRouter, HTTPException

from core import joystick, teleport
from models.schemas import (
    ClearLocationRequest,
    GoldDittoRequest,
    JoystickStartRequest,
    JoystickStopRequest,
    SetLocationRequest,
)

router = APIRouter(prefix="/api/location")


@router.post("/set")
async def post_set_location(body: SetLocationRequest) -> dict:
    try:
        await teleport.set_location(body.udid, body.lat, body.lng)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:  # noqa: BLE001 - surface device/tunnel errors to the UI
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"status": "ok"}


@router.post("/joystick/start")
async def post_joystick_start(body: JoystickStartRequest) -> dict:
    try:
        await joystick.start_joystick(
            body.udid, body.nav_mode, body.lat, body.lng, custom_speed_kmh=body.custom_speed_kmh
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:  # noqa: BLE001 - surface device/tunnel errors to the UI
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"status": "ok"}


@router.post("/joystick/stop")
async def post_joystick_stop(body: JoystickStopRequest) -> dict:
    await joystick.stop_joystick(body.udid)
    return {"status": "ok"}


@router.post("/clear")
async def post_clear_location(body: ClearLocationRequest) -> dict:
    try:
        await teleport.clear_location(body.udid)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:  # noqa: BLE001 - surface device/tunnel errors to the UI
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"status": "ok"}


@router.post("/gold-ditto")
async def post_gold_ditto(body: GoldDittoRequest) -> dict:
    try:
        await teleport.gold_ditto(body.udid, body.lat, body.lng)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:  # noqa: BLE001 - surface device/tunnel errors to the UI
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"status": "ok"}
