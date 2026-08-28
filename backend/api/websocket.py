from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from core import joystick, simulation_engine
from services import mobile_auth
from services.mobile_auth import valid_session

router = APIRouter()

_connections: set[WebSocket] = set()


@router.websocket("/ws/status")
async def ws_status(websocket: WebSocket) -> None:
    if websocket.client and websocket.client.host not in {"127.0.0.1", "::1", "localhost"}:
        await websocket.close(code=1008)
        return
    await websocket.accept()
    _connections.add(websocket)
    try:
        while True:
            raw = await websocket.receive_json()
            await _handle_message(raw)
    except WebSocketDisconnect:
        pass
    finally:
        _connections.discard(websocket)


@router.websocket("/ws/mobile")
async def ws_mobile(websocket: WebSocket) -> None:
    """LAN-only socket: the first message must authenticate the QR session."""
    await websocket.accept()
    session_token: str | None = None
    try:
        auth = await websocket.receive_json()
        session_token = auth.get("data", {}).get("session")
        if auth.get("type") != "auth" or not isinstance(session_token, str) or not valid_session(session_token):
            await websocket.close(code=1008)
            return
        if not mobile_auth.mark_connected(session_token):
            await websocket.close(code=1008)
            return
        _connections.add(websocket)
        await websocket.send_json({"type": "authenticated"})
        await websocket.send_json({"type": "task_snapshot", "tasks": simulation_engine.get_active_task_snapshots()})
        while True:
            raw = await websocket.receive_json()
            if not valid_session(session_token):
                await websocket.close(code=1008)
                return
            await _handle_message(raw)
    except WebSocketDisconnect:
        pass
    finally:
        _connections.discard(websocket)
        mobile_auth.mark_disconnected(session_token)


async def _handle_message(raw: dict) -> None:
    msg_type = raw.get("type")
    udid = raw.get("udid")
    if not udid:
        return
    if msg_type == "joystick_input":
        data = raw.get("data", {})
        joystick.move_joystick(udid, data.get("direction", 0.0), data.get("intensity", 0.0))
    elif msg_type == "joystick_stop":
        await joystick.stop_joystick(udid)


async def _broadcast(message: dict) -> None:
    dead = []
    for connection in _connections:
        try:
            await connection.send_json(message)
        except Exception:  # noqa: BLE001 - connection may have dropped mid-broadcast
            dead.append(connection)
    for connection in dead:
        _connections.discard(connection)


async def broadcast_position(
    udid: str,
    lat: float | None,
    lng: float | None,
    speed_mps: float = 0.0,
    eta_seconds: float = 0.0,
    stop_index: int | None = None,
) -> None:
    await _broadcast(
        {
            "type": "position",
            "udid": udid,
            "lat": lat,
            "lng": lng,
            "speed_mps": speed_mps,
            "eta_seconds": eta_seconds,
            "stop_index": stop_index,
        }
    )


async def broadcast_state(udid: str, state: str) -> None:
    task = next((item for item in simulation_engine.get_active_task_snapshots() if item["udid"] == udid), None)
    await _broadcast({"type": "state", "udid": udid, "state": state, "task": task})


async def broadcast_restored(udid: str) -> None:
    await _broadcast({"type": "restored", "udid": udid})


async def broadcast_flower_progress(udid: str, progress: dict) -> None:
    await _broadcast({"type": "flower_progress", "udid": udid, **progress})
