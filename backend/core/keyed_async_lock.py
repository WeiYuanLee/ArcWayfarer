"""Reference-counted keyed command serialization."""

import asyncio
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import AsyncIterator


@dataclass
class _Entry:
    lock: asyncio.Lock
    references: int = 0


class KeyedAsyncLock:
    """Serialize one target while allowing unrelated targets to run in parallel."""

    def __init__(self) -> None:
        self._guard = asyncio.Lock()
        self._entries: dict[str, _Entry] = {}

    @staticmethod
    def normalize(key: str) -> str:
        return key.strip().lower()

    @asynccontextmanager
    async def hold(self, key: str) -> AsyncIterator[None]:
        normalized = self.normalize(key)
        async with self._guard:
            entry = self._entries.setdefault(normalized, _Entry(asyncio.Lock()))
            entry.references += 1
        try:
            async with entry.lock:
                yield
        finally:
            async with self._guard:
                entry.references -= 1
                if entry.references == 0:
                    self._entries.pop(normalized, None)

    def entry_count(self) -> int:
        """Expose bounded lifecycle state for diagnostics and tests."""
        return len(self._entries)


# One command domain shared by API pairing/disconnect and manager connect.
device_command_locks = KeyedAsyncLock()
