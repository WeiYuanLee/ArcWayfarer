import logging
from fastapi import APIRouter, HTTPException

from core import joystick, teleport
from models.schemas import (
    ClearLocationRequest,
    GoldDittoFinishRequest,
    GoldDittoRequest,
    JoystickStartRequest,
    JoystickStopRequest,
    SetLocationRequest,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/location")


@router.post("/set")
async def post_set_location(body: SetLocationRequest) -> dict:
    try:
        await teleport.set_location(body.udid, body.lat, body.lng)
    except ValueError as e:
        logger.warning("Device not found for set_location: %s", e)
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:  # noqa: BLE001 - surface device/tunnel errors to the UI
        logger.exception("Error in set_location for udid=%s: %s", body.udid, e)
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
        origin = None
        if body.origin_lat is not None and body.origin_lng is not None:
            origin = (body.origin_lat, body.origin_lng)
        await teleport.gold_ditto(body.udid, body.lat, body.lng, origin=origin)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:  # noqa: BLE001 - surface device/tunnel errors to the UI
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"status": "ok"}


@router.post("/gold-ditto/finish")
async def post_finish_gold_ditto(body: GoldDittoFinishRequest) -> dict:
    try:
        await teleport.finish_gold_ditto(body.udid)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except Exception as e:  # noqa: BLE001 - surface device/tunnel errors to the UI
        logger.exception("Error finishing gold_ditto for udid=%s: %s", body.udid, e)
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"status": "ok"}
