import asyncio
from contextlib import suppress
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from core import joystick, simulation_engine
from services import mobile_auth
from services.mobile_auth import valid_session

router = APIRouter()
logger = logging.getLogger(__name__)

SEND_TIMEOUT_SECONDS = 5.0
RELIABLE_QUEUE_SIZE = 64


class _OutboundClient:
    """A bounded, serial WebSocket writer.

    Control/state messages retain ordering. High-frequency visual telemetry is
    latest-wins per device, so a sleeping renderer can never delay simulation or
    accumulate an unbounded playback backlog.
    """

    def __init__(self, websocket: WebSocket):
        self.websocket = websocket
        self.reliable: asyncio.Queue[dict] = asyncio.Queue(maxsize=RELIABLE_QUEUE_SIZE)
        self.telemetry: dict[tuple[str, str], dict] = {}
        self.wakeup = asyncio.Event()
        self.closed = False
        self.sender_task = asyncio.create_task(self._send_loop())

    def enqueue(self, message: dict, *, latest_wins: bool = False) -> bool:
        if self.closed:
            return False
        if latest_wins:
            self.telemetry[(str(message.get("type")), str(message.get("udid")))] = message
        else:
            try:
                self.reliable.put_nowait(message)
            except asyncio.QueueFull:
                return False
        self.wakeup.set()
        return True

    def discard_telemetry(self, message_type: str, udid: str) -> None:
        self.telemetry.pop((message_type, udid), None)

    async def _send(self, message: dict) -> None:
        await asyncio.wait_for(self.websocket.send_json(message), timeout=SEND_TIMEOUT_SECONDS)

    async def _send_loop(self) -> None:
        try:
            while True:
                await self.wakeup.wait()
                self.wakeup.clear()
                while not self.reliable.empty():
                    await self._send(self.reliable.get_nowait())
                pending = list(self.telemetry.values())
                self.telemetry.clear()
                for message in pending:
                    await self._send(message)
        except asyncio.CancelledError:
            self.closed = True
            raise
        except Exception as exc:  # noqa: BLE001 - timeout/disconnect ends only this UI writer
            self.closed = True
            logger.warning("Status WebSocket writer stopped: %s", exc)

    async def close(self, *, close_socket: bool = False) -> None:
        if self.closed and self.sender_task.done():
            return
        self.closed = True
        self.sender_task.cancel()
        if self.sender_task is not asyncio.current_task():
            with suppress(asyncio.CancelledError, Exception):
                await self.sender_task
        if close_socket:
            with suppress(Exception):
                await self.websocket.close()


_connections: dict[WebSocket, _OutboundClient] = {}
_latest_positions: dict[str, dict] = {}
_latest_states: dict[str, dict] = {}
_latest_flower_progress: dict[str, dict] = {}


def _status_snapshot() -> dict:
    return {
        "type": "status_snapshot",
        "tasks": simulation_engine.get_active_task_snapshots(),
        "positions": list(_latest_positions.values()),
        "states": list(_latest_states.values()),
        "flower_progress": list(_latest_flower_progress.values()),
    }


def _register(websocket: WebSocket) -> _OutboundClient:
    client = _OutboundClient(websocket)
    _connections[websocket] = client
    return client


async def _unregister(websocket: WebSocket) -> None:
    client = _connections.pop(websocket, None)
    if client is not None:
        await client.close()


@router.websocket("/ws/status")
async def ws_status(websocket: WebSocket) -> None:
    if websocket.client and websocket.client.host not in {"127.0.0.1", "::1", "localhost"}:
        await websocket.close(code=1008)
        return
    await websocket.accept()
    client = _register(websocket)
    client.enqueue(_status_snapshot())
    try:
        while True:
            raw = await websocket.receive_json()
            await _handle_message(raw, client)
    except WebSocketDisconnect:
        pass
    finally:
        await _unregister(websocket)


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
        client = _register(websocket)
        client.enqueue({"type": "authenticated"})
        client.enqueue(_status_snapshot())
        while True:
            raw = await websocket.receive_json()
            if not valid_session(session_token):
                await websocket.close(code=1008)
                return
            await _handle_message(raw, client)
    except WebSocketDisconnect:
        pass
    finally:
        await _unregister(websocket)
        mobile_auth.mark_disconnected(session_token)


async def _handle_message(raw: dict, client: _OutboundClient | None = None) -> None:
    msg_type = raw.get("type")
    if msg_type == "status_sync":
        if client is not None and not client.enqueue(_status_snapshot()):
            await client.close(close_socket=True)
        return

    udid = raw.get("udid")
    if not udid:
        return
    if msg_type == "joystick_input":
        data = raw.get("data", {})
        joystick.move_joystick(udid, data.get("direction", 0.0), data.get("intensity", 0.0))
    elif msg_type == "joystick_stop":
        await joystick.stop_joystick(udid)


async def _broadcast(message: dict, *, latest_wins: bool = False) -> None:
    dead: list[WebSocket] = []
    for websocket, client in list(_connections.items()):
        if not client.enqueue(message, latest_wins=latest_wins):
            dead.append(websocket)
    for websocket in dead:
        client = _connections.pop(websocket, None)
        if client is not None:
            asyncio.create_task(client.close(close_socket=True))


async def broadcast_position(
    udid: str,
    lat: float | None,
    lng: float | None,
    speed_mps: float = 0.0,
    eta_seconds: float = 0.0,
    stop_index: int | None = None,
) -> None:
    message = {
        "type": "position",
        "udid": udid,
        "lat": lat,
        "lng": lng,
        "speed_mps": speed_mps,
        "eta_seconds": eta_seconds,
        "stop_index": stop_index,
    }
    _latest_positions[udid] = message
    await _broadcast(message, latest_wins=True)


async def broadcast_state(udid: str, state: str) -> None:
    task = next((item for item in simulation_engine.get_active_task_snapshots() if item["udid"] == udid), None)
    message = {"type": "state", "udid": udid, "state": state, "task": task}
    _latest_states[udid] = message
    if state == "idle":
        _latest_flower_progress.pop(udid, None)
        for client in _connections.values():
            client.discard_telemetry("flower_progress", udid)
    await _broadcast(message)


async def broadcast_restored(udid: str) -> None:
    await _broadcast({"type": "restored", "udid": udid})


async def broadcast_flower_progress(udid: str, progress: dict) -> None:
    message = {"type": "flower_progress", "udid": udid, **progress}
    _latest_flower_progress[udid] = message
    await _broadcast(message, latest_wins=True)
