"""Ephemeral QR pairing state for the LAN mobile controller."""

from __future__ import annotations

import secrets
import time
from dataclasses import dataclass

PAIRING_TTL_SECONDS = 120
SESSION_IDLE_SECONDS = 30 * 60
PIN_ATTEMPTS = 5


@dataclass
class Pairing:
    token: str
    pin: str
    expires_at: float
    attempts: int = 0


@dataclass
class MobileSession:
    token: str
    expires_at: float


_pairing: Pairing | None = None
_sessions: dict[str, MobileSession] = {}
_connected_sessions: set[str] = set()


def create_pairing() -> Pairing:
    global _pairing
    _sessions.clear()
    _pairing = Pairing(
        token=secrets.token_urlsafe(32),
        pin=f"{secrets.randbelow(1_000_000):06d}",
        expires_at=time.monotonic() + PAIRING_TTL_SECONDS,
    )
    return _pairing


def exchange(pairing_token: str, pin: str) -> str | None:
    global _pairing
    pairing = _pairing
    if not pairing or pairing.expires_at < time.monotonic() or not secrets.compare_digest(pairing.token, pairing_token):
        return None
    pairing.attempts += 1
    if pairing.attempts > PIN_ATTEMPTS or not secrets.compare_digest(pairing.pin, pin):
        return None
    _pairing = None  # one successful QR pairing only
    token = secrets.token_urlsafe(32)
    _sessions[token] = MobileSession(token=token, expires_at=time.monotonic() + SESSION_IDLE_SECONDS)
    return token


def valid_session(token: str | None) -> bool:
    if not token:
        return False
    session = _sessions.get(token)
    if not session or session.expires_at < time.monotonic():
        _sessions.pop(token, None)
        return False
    session.expires_at = time.monotonic() + SESSION_IDLE_SECONDS
    return True


def mark_connected(token: str) -> bool:
    if not valid_session(token):
        return False
    _connected_sessions.add(token)
    return True


def mark_disconnected(token: str | None) -> None:
    if token:
        _connected_sessions.discard(token)


def connection_status() -> dict[str, int]:
    # Drop expired entries before reporting the state shown in the desktop UI.
    for token in list(_sessions):
        valid_session(token)
    _connected_sessions.intersection_update(_sessions)
    return {"paired_sessions": len(_sessions), "connected_phones": len(_connected_sessions)}


def revoke_all() -> None:
    global _pairing
    _pairing = None
    _sessions.clear()
    _connected_sessions.clear()
