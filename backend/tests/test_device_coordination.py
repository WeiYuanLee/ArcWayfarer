import asyncio
import unittest
from unittest.mock import patch

from core import device_manager
from core.device_revision import DeviceRevisionLedger
from core.keyed_async_lock import KeyedAsyncLock
from models.schemas import DeviceInfo


class KeyedAsyncLockTests(unittest.IsolatedAsyncioTestCase):
    async def test_same_key_serializes_and_releases_entry(self) -> None:
        locks = KeyedAsyncLock()
        first_entered = asyncio.Event()
        release_first = asyncio.Event()
        order: list[str] = []

        async def first() -> None:
            async with locks.hold("device:ABC"):
                order.append("first-enter")
                first_entered.set()
                await release_first.wait()
                order.append("first-exit")

        async def second() -> None:
            await first_entered.wait()
            async with locks.hold("device:abc"):
                order.append("second-enter")

        tasks = [asyncio.create_task(first()), asyncio.create_task(second())]
        await first_entered.wait()
        await asyncio.sleep(0)
        self.assertEqual(order, ["first-enter"])
        release_first.set()
        await asyncio.gather(*tasks)

        self.assertEqual(order, ["first-enter", "first-exit", "second-enter"])
        self.assertEqual(locks.entry_count(), 0)

    async def test_different_keys_run_in_parallel(self) -> None:
        locks = KeyedAsyncLock()
        both_entered = asyncio.Event()
        entered: set[str] = set()

        async def worker(key: str) -> None:
            async with locks.hold(key):
                entered.add(key)
                if len(entered) == 2:
                    both_entered.set()
                await both_entered.wait()

        await asyncio.wait_for(
            asyncio.gather(worker("device:a"), worker("device:b")),
            timeout=1,
        )
        self.assertEqual(entered, {"device:a", "device:b"})
        self.assertEqual(locks.entry_count(), 0)


class DeviceRevisionLedgerTests(unittest.TestCase):
    def test_capture_remains_older_than_later_command(self) -> None:
        ledger = DeviceRevisionLedger()
        before = ledger.capture()
        command_revision = ledger.bump("PHONE-A")
        after = ledger.capture()

        self.assertLess(before.snapshot_revision, command_revision)
        self.assertEqual(before.device_revisions.get("phone-a", 0), 0)
        self.assertEqual(after.snapshot_revision, command_revision)
        self.assertEqual(after.device_revisions["phone-a"], command_revision)


class DeviceCommandSerializationTests(unittest.IsolatedAsyncioTestCase):
    async def test_two_connects_for_same_udid_do_not_overlap(self) -> None:
        active = 0
        maximum_active = 0

        async def connect(udid: str, *_args) -> DeviceInfo:
            nonlocal active, maximum_active
            active += 1
            maximum_active = max(maximum_active, active)
            await asyncio.sleep(0)
            active -= 1
            return DeviceInfo(
                udid=udid,
                name=udid,
                ios_version="17.4",
                transport="rsd",
                connection_type="wireless_direct",
                status="ready",
            )

        with patch.object(device_manager, "_connect_direct_impl", side_effect=connect):
            first, second = await asyncio.gather(
                device_manager.connect_direct("PHONE-A"),
                device_manager.connect_direct("phone-a"),
            )

        self.assertEqual(maximum_active, 1)
        self.assertLess(first.revision, second.revision)


if __name__ == "__main__":
    unittest.main()
