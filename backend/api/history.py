from fastapi import APIRouter

from core.history import history_manager
from models.schemas import HistoryEntry, HistoryPushRequest

router = APIRouter(prefix="/api/history")


@router.get("")
async def get_history() -> list[HistoryEntry]:
    return history_manager.list()


@router.post("")
async def post_history(body: HistoryPushRequest) -> HistoryEntry:
    return history_manager.push(body.lat, body.lng, body.kind, body.name)


@router.delete("")
async def delete_history() -> dict:
    history_manager.clear()
    return {"status": "ok"}
