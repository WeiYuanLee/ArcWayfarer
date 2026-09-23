"""Process-local ownership of active device session handles."""

import asyncio
from typing import Protocol

from models.schemas import DeviceConnectionType


class SessionHandle(Protocol):
    udid: str
    bound_route: DeviceConnectionType
    transport_identity: str

    async def close(self) -> None: ...


class DeviceSessionStore:
    """Keep session handles separate from discovery and transport routing."""

    def __init__(self) -> None:
        self._sessions: dict[str, SessionHandle] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    @staticmethod
    def _key(udid: str) -> str:
        return udid.strip().lower()

    def get(self, udid: str) -> SessionHandle | None:
        return self._sessions.get(self._key(udid))

    def register(self, session: SessionHandle) -> None:
        self._sessions[self._key(session.udid)] = session

    def pop(self, udid: str, *, expected: SessionHandle | None = None) -> SessionHandle | None:
        key = self._key(udid)
        current = self._sessions.get(key)
        if expected is not None and current is not expected:
            return None
        return self._sessions.pop(key, None)

    def has(self, udid: str) -> bool:
        return self._key(udid) in self._sessions

    def lock_for(self, udid: str) -> asyncio.Lock:
        return self._locks.setdefault(self._key(udid), asyncio.Lock())


device_session_store = DeviceSessionStore()
