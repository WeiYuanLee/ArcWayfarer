import asyncio
import unittest

from api import websocket
from core import simulation_engine


class _SlowWebSocket:
    def __init__(self):
        self.release = asyncio.Event()
        self.sent = []

    async def send_json(self, message):
        await self.release.wait()
        self.sent.append(message)

    async def close(self):
        return None


class WebSocketDeliveryTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        websocket._latest_positions.clear()
        websocket._latest_states.clear()
        websocket._latest_flower_progress.clear()
        simulation_engine._sessions.clear()

    async def asyncTearDown(self):
        clients = list(websocket._connections.values())
        websocket._connections.clear()
        for client in clients:
            await client.close()

    async def test_latest_telemetry_replaces_older_value_per_device(self):
        socket = _SlowWebSocket()
        client = websocket._OutboundClient(socket)
        websocket._connections[socket] = client

        first = {"type": "position", "udid": "device-1", "lat": 1}
        latest = {"type": "position", "udid": "device-1", "lat": 2}
        client.enqueue(first, latest_wins=True)
        client.enqueue(latest, latest_wins=True)

        self.assertEqual(client.telemetry[("position", "device-1")], latest)

    async def test_slow_renderer_does_not_block_position_broadcast(self):
        socket = _SlowWebSocket()
        client = websocket._OutboundClient(socket)
        websocket._connections[socket] = client

        await asyncio.wait_for(
            websocket.broadcast_position("device-1", 25.0, 121.0, 1.0, 10.0, 1),
            timeout=0.05,
        )

        self.assertEqual(websocket._latest_positions["device-1"]["lat"], 25.0)

    async def test_idle_state_removes_stale_flower_progress_from_snapshot(self):
        socket = _SlowWebSocket()
        client = websocket._OutboundClient(socket)
        websocket._connections[socket] = client
        websocket._latest_flower_progress["device-1"] = {
            "type": "flower_progress", "udid": "device-1", "flower_index": 2,
        }
        client.enqueue(websocket._latest_flower_progress["device-1"], latest_wins=True)

        await websocket.broadcast_state("device-1", "idle")

        self.assertEqual(websocket._status_snapshot()["flower_progress"], [])
        self.assertNotIn(("flower_progress", "device-1"), client.telemetry)

    async def test_snapshot_contains_semantic_task_descriptor(self):
        session = simulation_engine.get_navigation_session("device-1")
        session.state = simulation_engine.SimulationState.NAVIGATING
        session.active_path = [(25.0, 121.0)]
        simulation_engine.set_task_descriptor(session, "flower", {
            "waypoints": [{"lat": 25.0, "lng": 121.0}],
            "flower": {"radius_m": 30, "route_type": "loop_forever"},
        })

        task = websocket._status_snapshot()["tasks"][0]
        self.assertEqual(task["kind"], "flower")
        self.assertEqual(task["protocol_version"], 2)
        self.assertEqual(task["config"]["waypoints"], [{"lat": 25.0, "lng": 121.0}])
        self.assertTrue(task["task_id"])
