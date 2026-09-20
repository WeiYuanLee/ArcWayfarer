import asyncio
import tempfile
import struct
import unittest
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from pymobiledevice3.exceptions import RemotePairingCompletedError

from api.device import _require_desktop
from core import device_manager, device_session, pairing_store
from core.direct_lockdown import DirectTcpLockdownClient
from models.schemas import DeviceInfo


PAIR_RECORD = {
    "HostID": "host",
    "SystemBUID": "system",
    "HostCertificate": b"host-cert",
    "HostPrivateKey": b"host-key",
    "RootCertificate": b"root-cert",
    "RootPrivateKey": b"root-key",
}


class PairingStoreTests(unittest.TestCase):
    def test_private_record_round_trip_and_removal(self) -> None:
        with tempfile.TemporaryDirectory() as root, patch.object(pairing_store, "PAIRING_DIR", Path(root) / "records"):
            pairing_store.save("A1B2C3D4", PAIR_RECORD)
            pairing_store.save_address("A1B2C3D4", "192.168.1.20")
            pairing_store.save_version("A1B2C3D4", "26.6.2")
            self.assertEqual(pairing_store.load("a1b2c3d4"), PAIR_RECORD)
            self.assertEqual(pairing_store.load_address("a1b2c3d4"), "192.168.1.20")
            self.assertEqual(pairing_store.load_version("a1b2c3d4"), "26.6.2")
            self.assertEqual(pairing_store.list_udids(), ["a1b2c3d4"])
            if pairing_store.os.name == "posix":
                self.assertEqual((pairing_store.PAIRING_DIR.stat().st_mode & 0o777), 0o700)
                self.assertEqual((pairing_store.PAIRING_DIR / "a1b2c3d4.plist").stat().st_mode & 0o777, 0o600)
                self.assertEqual((pairing_store.PAIRING_DIR / "a1b2c3d4.address").stat().st_mode & 0o777, 0o600)
                self.assertEqual((pairing_store.PAIRING_DIR / "a1b2c3d4.version").stat().st_mode & 0o777, 0o600)
            pairing_store.remove("A1B2C3D4")
            self.assertIsNone(pairing_store.load("a1b2c3d4"))
            self.assertIsNone(pairing_store.load_address("a1b2c3d4"))
            self.assertIsNone(pairing_store.load_version("a1b2c3d4"))

    def test_rejects_incomplete_record_and_unsafe_identifier(self) -> None:
        with tempfile.TemporaryDirectory() as root, patch.object(pairing_store, "PAIRING_DIR", Path(root) / "records"):
            with self.assertRaises(ValueError):
                pairing_store.save("A1B2C3D4", {"HostID": "host"})
            with self.assertRaises(ValueError):
                pairing_store.save("../../bad", PAIR_RECORD)


class DirectRoutingTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        device_manager._direct_addresses.clear()
        device_manager._direct_usb_present.clear()
        device_manager._system_routes.clear()
        device_manager._direct_rsd_devices.clear()
        device_manager._direct_rsd_tunnels.clear()
        device_manager._discovered_direct_endpoints.clear()

    async def asyncTearDown(self) -> None:
        device_manager._direct_addresses.clear()
        device_manager._direct_usb_present.clear()
        device_manager._system_routes.clear()
        device_manager._direct_rsd_devices.clear()
        device_manager._direct_rsd_tunnels.clear()
        device_manager._discovered_direct_endpoints.clear()

    async def test_usb_refreshes_existing_remote_pairing_before_saving(self) -> None:
        udid = "00008030-001234567890ABCD"
        class Lockdown:
            paired = True
            pair_record = PAIR_RECORD
            product_version = "17.4"
            get_enable_wifi_connections = AsyncMock(return_value=True)

            def __init__(self):
                self.udid = udid

            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

        lockdown = Lockdown()
        first = SimpleNamespace(connect=AsyncMock(side_effect=RemotePairingCompletedError()), close=AsyncMock())
        verified = SimpleNamespace(connect=AsyncMock(), close=AsyncMock())
        with (
            # Existing files must be revalidated on macOS too. Their presence
            # does not prove that the phone still accepts the key.
            patch("platform.system", return_value="Darwin"),
            patch.object(device_manager, "create_using_usbmux", AsyncMock(return_value=lockdown)),
            patch.object(device_manager, "iter_remote_paired_identifiers", return_value=[udid]),
            patch.object(device_manager.RemotePairingLockdownService, "create", AsyncMock(side_effect=[first, verified])) as create,
            patch.object(pairing_store, "save") as save,
            patch.object(pairing_store, "save_version"),
        ):
            await device_manager.enable_direct_pairing(udid)
        self.assertEqual(create.await_count, 2)
        first.close.assert_awaited_once()
        verified.connect.assert_awaited_once_with(autopair=False)
        verified.close.assert_awaited_once()
        save.assert_called_once_with(udid, PAIR_RECORD)

    async def test_retry_refreshes_single_usb_phone_then_connects_selected_ip(self) -> None:
        """端點驗證失敗後，插一台 USB 再重試會刷新金鑰並連回同一 IP。"""
        udid = "00008101-001239E11EB9003A"
        ip = "192.168.1.184"
        connected = DeviceInfo(
            udid=udid, name="Lence", ios_version="26.6.2", transport="rsd",
            connection_type="wireless_direct", ip_address=ip, status="ready",
        )
        provider = SimpleNamespace(close=AsyncMock())
        probe = AsyncMock(side_effect=[ConnectionError("stale key"), provider])
        usb = SimpleNamespace(serial=udid, connection_type="USB")

        with (
            patch.object(device_manager, "iter_remote_paired_identifiers", return_value=[udid]),
            patch.object(device_manager.tunnel_service, "create_core_device_tunnel_service_using_remotepairing", probe),
            patch.object(device_manager, "usbmux_list_devices", AsyncMock(return_value=[usb])),
            patch.object(device_manager, "enable_direct_pairing", AsyncMock()) as refresh,
            patch.object(device_manager, "_connect_direct_rsd", AsyncMock(return_value=connected)),
            patch.object(device_manager, "_has_active_session", return_value=False),
            patch.object(pairing_store, "list_udids", return_value=[]),
            patch.object(pairing_store, "load_version", return_value="26.6.2"),
        ):
            result = await device_manager.connect_direct("auto", ip, fallback_bonjour=False)

        self.assertEqual(result, connected)
        refresh.assert_awaited_once_with(udid)
        self.assertEqual(probe.await_count, 2)
        self.assertTrue(all(call.kwargs["autopair"] is False for call in probe.await_args_list))

    async def test_failed_switch_releases_idle_direct_runtime_for_wifi_fallback(self) -> None:
        """新 IP 驗證失敗時，不可讓閒置舊 Direct 狀態繼續遮蔽一般 Wi-Fi。"""
        old_udid = "00008101-001239E11EB9003A"
        with (
            patch.object(device_manager, "iter_remote_paired_identifiers", return_value=[old_udid]),
            patch.object(
                device_manager.tunnel_service,
                "create_core_device_tunnel_service_using_remotepairing",
                AsyncMock(side_effect=ConnectionError("stale key")),
            ),
            patch.object(device_manager, "usbmux_list_devices", AsyncMock(return_value=[])),
            patch.object(device_manager, "_direct_rsd_tunnels", {old_udid.lower(): SimpleNamespace(rsd=object())}),
            patch.object(device_manager, "_has_active_session", return_value=False),
            patch.object(device_manager, "disconnect_direct", AsyncMock()) as disconnect,
            patch.object(pairing_store, "list_udids", return_value=[]),
        ):
            with self.assertRaisesRegex(ValueError, "USB.*重新連線"):
                await device_manager.connect_direct("auto", "192.168.1.184")

        disconnect.assert_awaited_once_with(old_udid.lower())

    async def test_windows_remote_pairing_browse_keeps_port_and_ipv6_scope(self) -> None:
        udid = "00008030-001234567890ABCD"
        service = SimpleNamespace(
            instance=f"{udid}._remotepairing._tcp.local.", host="Phone.local", port=51999,
            addresses=[SimpleNamespace(full_ip="fe80::abcd%Ethernet")],
        )
        with (
            patch("platform.system", return_value="Windows"),
            patch.object(device_manager, "_get_arp_map_async", AsyncMock(return_value={})),
            patch.object(device_manager, "browse_remotepairing", AsyncMock(return_value=[service])),
            patch.object(device_manager, "browse_mobdev2", AsyncMock(return_value=[])),
            patch.object(device_manager, "iter_remote_paired_identifiers", return_value=[udid]),
            patch.object(device_manager.socket, "if_nametoindex", return_value=12) as index,
            patch.object(pairing_store, "list_udids", return_value=[]),
        ):
            endpoints = await device_manager.list_direct_endpoints()
        index.assert_called_once_with("Ethernet")
        self.assertEqual(len(endpoints), 1)
        self.assertEqual(endpoints[0]["udid"], udid)
        self.assertEqual(endpoints[0]["ip"], "fe80::abcd%12")
        self.assertEqual(endpoints[0]["port"], 51999)
        self.assertEqual(endpoints[0]["endpoint"], "[fe80::abcd%12]:51999")

    async def test_macos_remote_pairing_scan_keeps_new_network_port(self) -> None:
        """換 Wi-Fi 後使用 SRV 新埠號，不可退回舊的 49152。"""
        udid = "00008030-001234567890ABCD"
        new_ip = "192.168.50.21"
        new_port = 52137

        async def browse(service_type: str, duration: float = 1.0):
            return [udid] if service_type == "_remotepairing._tcp" else []

        with (
            patch("platform.system", return_value="Darwin"),
            patch.object(device_manager, "_get_arp_map_async", AsyncMock(return_value={})),
            patch.object(device_manager, "_browse_dns_sd_services", AsyncMock(side_effect=browse)),
            patch.object(device_manager, "_resolve_dns_sd_instance", AsyncMock(return_value=("Phone.local", new_port))),
            patch.object(device_manager, "_resolve_host_ips_async", AsyncMock(return_value=[new_ip])),
            patch.object(device_manager, "browse_mobdev2", AsyncMock(return_value=[])),
            patch.object(device_manager, "iter_remote_paired_identifiers", return_value=[udid]),
            patch.object(pairing_store, "list_udids", return_value=[]),
        ):
            endpoints = await device_manager.list_direct_endpoints()

        self.assertEqual(len(endpoints), 1)
        self.assertEqual(endpoints[0]["ip"], new_ip)
        self.assertEqual(endpoints[0]["port"], new_port)
        self.assertEqual(endpoints[0]["endpoint"], f"{new_ip}:{new_port}")

    def test_windows_arp_table_is_parsed_without_mac_format(self) -> None:
        output = "Interface: 192.168.1.2 --- 0xc\n  Internet Address      Physical Address      Type\n  192.168.1.25          f0-1f-c7-01-02-03     dynamic\n"
        with (
            patch("platform.system", return_value="Windows"),
            patch.object(device_manager.subprocess, "check_output", return_value=output) as arp,
        ):
            result = device_manager._get_arp_map_sync()
        arp.assert_called_once_with(["arp", "-a"], text=True, stderr=device_manager.subprocess.DEVNULL, timeout=1.5)
        self.assertEqual(result, {"f0:1f:c7:01:02:03": "192.168.1.25"})

    def test_windows_wireless_routes_remain_loopback_only(self) -> None:
        with patch("platform.system", return_value="Windows"):
            _require_desktop(SimpleNamespace(client=SimpleNamespace(host="127.0.0.1")))
            with self.assertRaisesRegex(Exception, "只能在電腦端操作"):
                _require_desktop(SimpleNamespace(client=SimpleNamespace(host="192.168.1.2")))

    async def test_manual_connect_activates_only_verified_ios16_device(self) -> None:
        device = DeviceInfo(udid="A1B2C3D4", name="Phone", ios_version="16.7", transport="lockdown", connection_type="wireless_direct", status="ready")

        class Lockdown:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

            async def start_lockdown_developer_service(self, _name):
                return self

            async def close(self):
                return None

        with (
            patch.object(device_manager, "_direct_addresses", {}),
            patch.object(device_manager, "_describe_direct", AsyncMock(return_value=device)) as tcp_describe,
            patch.object(device_manager, "browse_mobdev2", AsyncMock()) as tcp_discovery,
            patch.object(device_manager, "_connect_direct_tcp", AsyncMock(return_value=Lockdown())),
            patch.object(pairing_store, "save_address"),
        ):
            await device_manager.connect_direct("A1B2C3D4", "192.168.1.20")
            self.assertEqual(device_manager.direct_address("a1b2c3d4"), "192.168.1.20")

        with (
            patch.object(device_manager, "_direct_addresses", {}),
            patch.object(device_manager, "browse_mobdev2", AsyncMock(return_value=[])),
            patch.object(device_manager, "_describe_direct", AsyncMock(return_value=device)),
            patch.object(device_manager, "_connect_direct_tcp", AsyncMock(return_value=Lockdown())),
            patch.object(pairing_store, "load_address", return_value="192.168.1.20"),
            patch.object(pairing_store, "save_address"),
        ):
            await device_manager.connect_direct("A1B2C3D4")
            self.assertEqual(device_manager.direct_address("a1b2c3d4"), "192.168.1.20")


    async def test_ios17_direct_uses_wifi_rsd_and_releases_tunnel(self) -> None:
        udid = "A1B2C3D4"
        device = DeviceInfo(udid=udid, name="Phone", ios_version="26.6.2", transport="lockdown", connection_type="wireless_direct", status="ready")
        rsd = SimpleNamespace(udid=udid, name="Phone", product_version="26.6.2")

        class Tunnel:
            def __init__(self, **_kwargs):
                self.rsd = None

            async def aopen(self):
                self.rsd = rsd
                return rsd

            async def aclose(self):
                self.rsd = None

        class Channel:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

        with (
            patch.object(device_manager, "_direct_addresses", {}),
            patch.object(device_manager, "_direct_rsd_tunnels", {}),
            patch.object(device_manager, "_direct_rsd_devices", {}),
            patch.object(device_manager, "_describe_direct", AsyncMock(return_value=device)) as tcp_describe,
            patch.object(device_manager, "browse_mobdev2", AsyncMock(return_value=[])) as tcp_discovery,
            patch.object(device_manager, "WiFiRsdTunnel", Tunnel),
            patch.object(device_manager, "DvtProvider", return_value=Channel()),
            patch.object(device_manager, "LocationSimulation", return_value=Channel()),
            patch.object(pairing_store, "load_version", return_value="26.6.2"),
            patch.object(pairing_store, "exists", return_value=True),
            patch.object(pairing_store, "save_address"),
            patch.object(pairing_store, "save_version"),
        ):
            connected = await device_manager.connect_direct(udid)
            self.assertEqual(connected.transport, "rsd")
            tcp_describe.assert_not_awaited()
            tcp_discovery.assert_not_awaited()
            self.assertIs(await device_manager.get_rsd(udid), rsd)
            await device_manager.disconnect_direct(udid)
            self.assertIsNone(device_manager.direct_address(udid))
            self.assertIsNone(device_manager._direct_rsd_tunnels.get(udid.lower()))

    async def test_ios17_direct_accepts_ip_and_falls_back_when_ip_fails(self) -> None:
        udid = "A1B2C3D4"
        rsd = SimpleNamespace(udid=udid, name="Phone", product_version="26.6.2")
        created_tunnels = []

        class Tunnel:
            def __init__(self, serial=None, ip=None, **_kwargs):
                self.serial = serial
                self.ip = ip
                self.rsd = None
                created_tunnels.append(self)

            async def aopen(self):
                if self.ip == "192.168.1.99":
                    raise ConnectionRefusedError("stale IP")
                self.rsd = rsd
                return rsd

            async def aclose(self):
                self.rsd = None

        class Channel:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

        with (
            patch.object(device_manager, "_direct_addresses", {}),
            patch.object(device_manager, "_direct_rsd_tunnels", {}),
            patch.object(device_manager, "_direct_rsd_devices", {}),
            patch.object(device_manager, "WiFiRsdTunnel", Tunnel),
            patch.object(device_manager, "DvtProvider", return_value=Channel()),
            patch.object(device_manager, "LocationSimulation", return_value=Channel()),
            patch.object(pairing_store, "load_version", return_value="26.6.2"),
            patch.object(pairing_store, "exists", return_value=True),
            patch.object(pairing_store, "save_address") as mock_save_addr,
            patch.object(pairing_store, "save_version"),
        ):
            # Test 1: Connect directly with valid IP
            connected = await device_manager.connect_direct(udid, "192.168.1.20")
            self.assertEqual(connected.transport, "rsd")
            mock_save_addr.assert_called_with(udid, "192.168.1.20")

            # Test 2: Fallback when stale IP fails -> connects with ip=None (Bonjour)
            created_tunnels.clear()
            connected_fallback = await device_manager.connect_direct(udid, "192.168.1.99")
            self.assertEqual(connected_fallback.transport, "rsd")
            self.assertEqual(len(created_tunnels), 2)
            self.assertEqual(created_tunnels[0].ip, "192.168.1.99")
            self.assertIsNone(created_tunnels[1].ip)

            # Test 3: Auto-UDID probing with IP
            created_tunnels.clear()

            class MockProvider:
                async def close(self):
                    pass

            with (
                patch.object(device_manager, "iter_remote_paired_identifiers", return_value=[udid]),
                patch.object(
                    device_manager.tunnel_service,
                    "create_core_device_tunnel_service_using_remotepairing",
                    return_value=MockProvider(),
                ),
            ):
                connected_auto = await device_manager.connect_direct("auto", "192.168.1.20")
                self.assertEqual(connected_auto.transport, "rsd")
                self.assertEqual(created_tunnels[0].serial, udid)

    async def test_explicit_direct_route_is_selected_over_system_wifi(self) -> None:
        packets = []
        service_close_count = 0

        class Service:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                nonlocal service_close_count
                service_close_count += 1
                return None

            async def sendall(self, payload):
                packets.append(payload)

        class Lockdown:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

            async def start_lockdown_developer_service(self, _name):
                return Service()

        lockdown = Lockdown()

        class MuxDevice:
            serial = "A1B2C3D4"
            connection_type = "Network"

        with (
            patch.object(device_manager, "_direct_addresses", {"a1b2c3d4": "192.168.1.20"}),
            patch.object(device_manager, "_direct_usb_present", set()),
            patch.object(device_manager, "usbmux_list_devices", AsyncMock(return_value=[MuxDevice()])) as mux_list,
            patch.object(device_manager, "_connect_direct_tcp", AsyncMock(return_value=lockdown)) as tcp,
            patch.object(device_manager, "create_using_usbmux", AsyncMock()) as usbmux,
        ):
            wrapper = device_session.LockdownSimulateLocationWrapper("A1B2C3D4")
            await wrapper.set(25.0, 121.0)
            await wrapper.clear()
            self.assertEqual(tcp.await_count, 2)
            usbmux.assert_not_awaited()
            mux_list.assert_not_awaited()
            self.assertEqual(packets, [
                struct.pack(">I", 0),
                struct.pack(">I", 4) + b"25.0",
                struct.pack(">I", 5) + b"121.0",
                struct.pack(">I", 1),
            ])
            self.assertEqual(service_close_count, 2)

    async def test_location_service_closes_after_send_error(self) -> None:
        service_closed = False
        lockdown_closed = False

        class Service:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                nonlocal service_closed
                service_closed = True

            async def sendall(self, _payload):
                raise ConnectionError("phone disconnected")

        class Lockdown:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                nonlocal lockdown_closed
                lockdown_closed = True

            async def start_lockdown_developer_service(self, _name):
                return Service()

        with patch.object(device_manager, "get_lockdown", AsyncMock(return_value=Lockdown())):
            with self.assertRaises(ConnectionError):
                await device_session.LockdownSimulateLocationWrapper("A1B2C3D4").set(25.0, 121.0)

        self.assertTrue(service_closed)
        self.assertTrue(lockdown_closed)

    async def test_location_service_closes_after_cancellation(self) -> None:
        service = AsyncMock()
        service.sendall.side_effect = asyncio.CancelledError()
        lockdown = AsyncMock()
        lockdown.__aenter__.return_value = lockdown
        lockdown.start_lockdown_developer_service.return_value = service

        with patch.object(device_manager, "get_lockdown", AsyncMock(return_value=lockdown)):
            with self.assertRaises(asyncio.CancelledError):
                await device_session.LockdownSimulateLocationWrapper("A1B2C3D4").clear()

        service.__aexit__.assert_awaited_once()
        lockdown.__aexit__.assert_awaited_once()

    async def test_direct_service_closes_if_tls_upgrade_fails(self) -> None:
        service = SimpleNamespace(
            ssl_start=AsyncMock(side_effect=ConnectionError("TLS failed")),
            close=AsyncMock(),
        )

        @contextmanager
        def ssl_file():
            yield "certificate.pem"

        client = SimpleNamespace(
            get_service_connection_attributes=AsyncMock(return_value={"Port": 12345, "EnableServiceSSL": True}),
            create_service_connection=AsyncMock(return_value=service),
            ssl_file=ssl_file,
        )
        with self.assertRaises(ConnectionError):
            await DirectTcpLockdownClient.start_lockdown_service(client, "com.apple.dt.simulatelocation")

        service.close.assert_awaited_once()

    async def test_direct_route_works_without_usbmux(self) -> None:
        with (
            patch.object(device_manager, "_direct_addresses", {"a1b2c3d4": "192.168.1.20"}),
            patch.object(device_manager, "_direct_usb_present", set()),
            patch.object(device_manager, "usbmux_list_devices", AsyncMock(side_effect=OSError("AMDS unavailable"))) as mux_list,
            patch.object(device_manager, "_connect_direct_tcp", AsyncMock(return_value=object())) as tcp,
        ):
            await device_manager.get_lockdown("A1B2C3D4")
            tcp.assert_awaited_once_with("A1B2C3D4", "192.168.1.20")
            mux_list.assert_not_awaited()

    async def test_usb_snapshot_keeps_physical_route_priority(self) -> None:
        with (
            patch.object(device_manager, "_direct_addresses", {"a1b2c3d4": "192.168.1.20"}),
            patch.object(device_manager, "_direct_usb_present", {"a1b2c3d4"}),
            patch.object(device_manager, "create_using_usbmux", AsyncMock(return_value=object())) as usbmux,
            patch.object(device_manager, "_connect_direct_tcp", AsyncMock()) as tcp,
        ):
            await device_manager.get_lockdown("A1B2C3D4")
            usbmux.assert_awaited_once_with(serial="A1B2C3D4", connection_type="USB")
            tcp.assert_not_awaited()

    async def test_usb_rsd_takes_priority_over_closed_wireless_tunnel(self) -> None:
        """插回 USB 後，失效的 Wireless Direct tunnel 不可遮蔽 tunneld 的 USB RSD。"""
        udid = "A1B2C3D4"
        usb_rsd = object()
        with (
            patch.object(device_manager, "_direct_usb_present", {udid.lower()}),
            patch.object(device_manager, "_direct_rsd_tunnels", {udid.lower(): SimpleNamespace(rsd=None)}),
            patch.object(device_manager, "get_tunneld_device_by_udid", AsyncMock(return_value=usb_rsd)) as tunneld,
        ):
            self.assertIs(await device_manager.get_rsd(udid), usb_rsd)
        tunneld.assert_awaited_once_with(udid)

    async def test_dead_wireless_session_is_released_before_ip_reconnect(self) -> None:
        """網路換 IP 後，只清理已確認斷線的 session，讓同一 UDID 可重新探測。"""
        udid = "A1B2C3D4"
        closed_tunnel = SimpleNamespace(rsd=None)
        with (
            patch.object(device_manager, "_has_active_session", return_value=True),
            patch.object(device_manager, "_direct_rsd_tunnels", {udid.lower(): closed_tunnel}),
            patch.object(device_session, "close_session", AsyncMock()) as close_session,
            patch.object(device_manager, "disconnect_direct", AsyncMock()) as disconnect,
        ):
            self.assertFalse(await device_manager.has_blocking_session(udid))
        close_session.assert_awaited_once_with(udid)
        disconnect.assert_awaited_once_with(udid)

    async def test_live_wireless_session_still_blocks_transport_switch(self) -> None:
        udid = "A1B2C3D4"
        with (
            patch.object(device_manager, "_has_active_session", return_value=True),
            patch.object(device_manager, "_direct_rsd_tunnels", {udid.lower(): SimpleNamespace(rsd=object())}),
            patch.object(device_session, "close_session", AsyncMock()) as close_session,
        ):
            self.assertTrue(await device_manager.has_blocking_session(udid))
        close_session.assert_not_awaited()

    async def test_selected_direct_device_is_returned_when_scan_has_no_system_route(self) -> None:
        direct = DeviceInfo(udid="A1B2C3D4", name="Phone", ios_version="16.7", transport="lockdown", connection_type="wireless_direct", status="ready")
        with (
            patch.object(device_manager, "list_devices", AsyncMock(return_value=[direct])) as discover,
        ):
            self.assertEqual(await device_manager.get_device("A1B2C3D4"), direct)
            discover.assert_awaited_once()

    async def test_direct_service_socket_is_unbound_before_tls(self) -> None:
        import asyncio
        from types import SimpleNamespace

        async def consume(reader, writer):
            await reader.read()
            writer.close()
            await writer.wait_closed()

        server = await asyncio.start_server(consume, "127.0.0.1", 0)
        port = server.sockets[0].getsockname()[1]
        fake_client = SimpleNamespace(hostname="127.0.0.1", _keep_alive=False)
        try:
            service = await DirectTcpLockdownClient.create_service_connection(fake_client, port)
            self.assertIsNone(service.reader)
            self.assertIsNone(service.writer)
            await service.close()
        finally:
            server.close()
            await server.wait_closed()

    async def test_direct_row_does_not_replace_working_usb_row_for_same_udid(self) -> None:
        usb = DeviceInfo(udid="A1B2C3D4", name="Phone", ios_version="16.7", transport="lockdown", connection_type="usb", status="ready")
        direct = usb.model_copy(update={"connection_type": "wireless_direct", "ip_address": "192.168.1.20"})

        class MuxDevice:
            serial = "A1B2C3D4"
            connection_type = "USB"

        with (
            patch.object(device_manager, "_direct_addresses", {"a1b2c3d4": "192.168.1.20"}),
            patch.object(device_manager, "_list_tunnel_udids", AsyncMock(return_value=set())),
            patch.object(device_manager, "usbmux_list_devices", AsyncMock(return_value=[MuxDevice()])),
            patch.object(device_manager, "_describe_device", AsyncMock(return_value=usb)),
            patch.object(device_manager, "_describe_direct", AsyncMock(return_value=direct)),
            patch.object(pairing_store, "list_udids", return_value=["a1b2c3d4"]),
        ):
            rows = await device_manager._scan_devices()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].connection_type, "usb")

    async def test_explicit_direct_row_replaces_system_wifi_row_without_duplicate(self) -> None:
        wifi = DeviceInfo(udid="A1B2C3D4", name="Phone", ios_version="16.7", transport="lockdown", connection_type="wifi", status="ready")
        direct = wifi.model_copy(update={"connection_type": "wireless_direct", "ip_address": "192.168.1.20"})

        class MuxDevice:
            serial = "A1B2C3D4"
            connection_type = "Network"

        with (
            patch.object(device_manager, "_direct_addresses", {"a1b2c3d4": "192.168.1.20"}),
            patch.object(device_manager, "_list_tunnel_udids", AsyncMock(return_value=set())),
            patch.object(device_manager, "usbmux_list_devices", AsyncMock(return_value=[MuxDevice()])),
            patch.object(device_manager, "_describe_device", AsyncMock(return_value=wifi)),
            patch.object(device_manager, "_describe_direct", AsyncMock(return_value=direct)),
            patch.object(pairing_store, "list_udids", return_value=["a1b2c3d4"]),
        ):
            rows = await device_manager._scan_devices()
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0].connection_type, "wireless_direct")
            self.assertEqual(device_manager._direct_addresses["a1b2c3d4"], "192.168.1.20")
            self.assertNotIn("a1b2c3d4", device_manager._system_routes)

    async def test_closed_direct_route_falls_back_to_ready_system_wifi(self) -> None:
        """Direct 斷線時保留授權，但不可覆蓋同一手機可用的一般 Wi-Fi 路徑。"""
        udid = "A1B2C3D4"
        wifi = DeviceInfo(
            udid=udid, name="Phone", ios_version="17.4", transport="rsd",
            connection_type="wifi", status="ready", direct_paired=True,
        )
        tunnel = SimpleNamespace(rsd=None, aclose=AsyncMock())

        class MuxDevice:
            serial = udid
            connection_type = "Network"

        with (
            patch.object(device_manager, "_direct_addresses", {udid.lower(): "192.168.1.20"}),
            patch.object(device_manager, "_direct_rsd_devices", {udid.lower(): wifi.model_copy(update={"connection_type": "wireless_direct"})}),
            patch.object(device_manager, "_direct_rsd_tunnels", {udid.lower(): tunnel}),
            patch.object(device_manager, "_list_tunnel_udids", AsyncMock(return_value={udid})),
            patch.object(device_manager, "usbmux_list_devices", AsyncMock(return_value=[MuxDevice()])),
            patch.object(device_manager, "_describe_device", AsyncMock(return_value=wifi)),
            patch.object(pairing_store, "list_udids", return_value=[udid]),
        ):
            rows = await device_manager._scan_devices()

            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0].connection_type, "wifi")
            self.assertEqual(rows[0].status, "ready")
            self.assertNotIn(udid.lower(), device_manager._direct_addresses)
            self.assertNotIn(udid.lower(), device_manager._direct_rsd_devices)
            self.assertNotIn(udid.lower(), device_manager._direct_rsd_tunnels)
        tunnel.aclose.assert_awaited_once()

    async def test_get_device_uses_fresh_system_wifi_snapshot_before_direct(self) -> None:
        udid = "A1B2C3D4"
        wifi = DeviceInfo(
            udid=udid, name="Phone", ios_version="17.4", transport="rsd",
            connection_type="wifi", status="ready", direct_paired=True,
        )
        tunnel = SimpleNamespace(rsd=None, aclose=AsyncMock())
        with (
            patch.object(device_manager, "_direct_usb_present", set()),
            patch.object(device_manager, "_direct_addresses", {udid.lower(): "192.168.1.20"}),
            patch.object(device_manager, "_direct_rsd_devices", {udid.lower(): wifi.model_copy(update={"connection_type": "wireless_direct"})}),
            patch.object(device_manager, "_direct_rsd_tunnels", {udid.lower(): tunnel}),
            patch.object(device_manager, "list_devices", AsyncMock(return_value=[wifi])) as discover,
        ):
            found = await device_manager.get_device(udid)

        self.assertEqual(found.connection_type, "wifi")
        discover.assert_awaited_once()

    async def test_live_explicit_direct_tunnel_has_priority_over_system_wifi_rsd(self) -> None:
        udid = "A1B2C3D4"
        system_rsd = object()
        direct_rsd = object()
        with (
            patch.object(device_manager, "_system_routes", {udid.lower()}),
            patch.object(device_manager, "_direct_rsd_tunnels", {udid.lower(): SimpleNamespace(rsd=direct_rsd)}),
            patch.object(device_manager, "get_tunneld_device_by_udid", AsyncMock(return_value=system_rsd)) as tunneld,
        ):
            self.assertIs(await device_manager.get_rsd(udid), direct_rsd)
        tunneld.assert_not_awaited()

    async def test_usb_or_wifi_disconnect_does_not_activate_pairing_history(self) -> None:
        """未手動啟用 Direct 時，系統路徑消失後不可從授權紀錄自動連線。"""
        udid = "00008101-001239E11EB9003A"
        for mux_type, expected_type in (("USB", "usb"), ("Network", "wifi")):
            with self.subTest(mux_type=mux_type):
                device_manager._direct_addresses.clear()
                device_manager._direct_rsd_devices.clear()
                device_manager._direct_rsd_tunnels.clear()
                device_manager._system_routes.clear()
                online = DeviceInfo(
                    udid=udid, name="Lence", ios_version="26.6.2", transport="rsd",
                    connection_type=expected_type, status="ready", direct_paired=True,
                )
                mux = SimpleNamespace(serial=udid, connection_type=mux_type)

                with (
                    patch.object(device_manager, "_list_tunnel_udids", AsyncMock(side_effect=[{udid}, set()])),
                    patch.object(device_manager, "usbmux_list_devices", AsyncMock(side_effect=[[mux], []])),
                    patch.object(device_manager, "_describe_device", AsyncMock(return_value=online)),
                    patch.object(device_manager, "iter_remote_paired_identifiers", return_value=[udid]),
                    patch.object(pairing_store, "list_udids", return_value=[udid]),
                    patch.object(pairing_store, "load_version", return_value="26.6.2"),
                ):
                    first = await device_manager._scan_devices()
                    disconnected = await device_manager._scan_devices()

                self.assertEqual(first[0].connection_type, expected_type)
                self.assertEqual(disconnected, [])
                self.assertNotIn(udid.lower(), device_manager._direct_addresses)
                self.assertNotIn(udid.lower(), device_manager._direct_rsd_tunnels)

    async def test_multi_device_probing_skips_active_navigation_session(self) -> None:
        udid_a = "PHONE_A_NAVIGATING"
        udid_b = "PHONE_B_IDLE"
        rsd_b = SimpleNamespace(udid=udid_b, name="Phone B", product_version="17.4")

        class MockTunnel:
            def __init__(self, serial=None, ip=None, **_kwargs):
                self.serial = serial
                self.ip = ip
                self.peer_ip = ip

            async def aopen(self):
                return rsd_b

            async def aclose(self):
                pass

        class MockProvider:
            def __init__(self, target_udid):
                self.target_udid = target_udid
                self.hostname = "192.168.1.55"

            async def close(self):
                pass

        class Channel:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

        async def mock_create_tunnel(target_udid, ip, port, autopair=True):
            self.assertFalse(autopair)
            if target_udid == udid_a:
                raise AssertionError("Active navigation device A should NOT have been probed!")
            if target_udid == udid_b and ip == "192.168.1.55":
                return MockProvider(target_udid)
            raise ConnectionRefusedError("Wrong target")

        with (
            patch.object(device_manager, "_has_active_session", side_effect=lambda u: u == udid_a),
            patch.object(device_manager, "iter_remote_paired_identifiers", return_value=[udid_a, udid_b]),
            patch.object(device_manager.tunnel_service, "create_core_device_tunnel_service_using_remotepairing", side_effect=mock_create_tunnel),
            patch.object(device_manager, "WiFiRsdTunnel", MockTunnel),
            patch.object(device_manager, "DvtProvider", return_value=Channel()),
            patch.object(device_manager, "LocationSimulation", return_value=Channel()),
            patch.object(pairing_store, "exists", return_value=True),
            patch.object(pairing_store, "load_version", return_value="17.4"),
            patch.object(pairing_store, "save_address") as mock_save_addr,
            patch.object(pairing_store, "save_version"),
        ):
            # Probing auto with Device B's IP should connect Device B and skip Device A
            connected = await device_manager.connect_direct("auto", "192.168.1.55")
            self.assertEqual(connected.udid, udid_b)
            self.assertEqual(connected.ip_address, "192.168.1.55")
            mock_save_addr.assert_called_with(udid_b, "192.168.1.55")

    async def test_bonjour_fallback_saves_actual_new_peer_ip(self) -> None:
        udid = "PHONE_IP_CHANGE"
        rsd = SimpleNamespace(udid=udid, name="Phone", product_version="17.4")

        class MockFallbackTunnel:
            def __init__(self, serial=None, ip=None, fallback_bonjour=True, **_kwargs):
                self.serial = serial
                self.ip = ip
                self.fallback_bonjour = fallback_bonjour
                # Bonjour resolved to new IP 192.168.1.88
                self.peer_ip = "192.168.1.88" if ip is None else ip

            async def aopen(self):
                if self.ip == "192.168.1.50":  # stale IP
                    raise ConnectionRefusedError("stale IP")
                return rsd

            async def aclose(self):
                pass

        class Channel:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

        with (
            patch.object(device_manager, "_has_active_session", return_value=False),
            patch.object(device_manager, "WiFiRsdTunnel", MockFallbackTunnel),
            patch.object(device_manager, "DvtProvider", return_value=Channel()),
            patch.object(device_manager, "LocationSimulation", return_value=Channel()),
            patch.object(pairing_store, "exists", return_value=True),
            patch.object(pairing_store, "load_version", return_value="17.4"),
            patch.object(pairing_store, "save_address") as mock_save_addr,
            patch.object(pairing_store, "save_version"),
        ):
            # Connecting with stale IP 192.168.1.50 should fallback to Bonjour (ip=None),
            # and save the ACTUAL peer IP (192.168.1.88)
            connected = await device_manager.connect_direct(udid, "192.168.1.50")
            self.assertEqual(connected.ip_address, "192.168.1.88")
            # Verify actual IP is saved to pairing store, NOT the stale IP
            mock_save_addr.assert_called_with(udid, "192.168.1.88")

    async def test_list_direct_endpoints_creates_fresh_snapshot(self) -> None:
        with (
            patch.object(device_manager, "_get_arp_map_async", AsyncMock(return_value={})),
            patch.object(device_manager, "_browse_dns_sd_services", AsyncMock(return_value=[])),
            patch.object(device_manager, "browse_mobdev2", AsyncMock(return_value=[])),
            patch.object(pairing_store, "list_udids", return_value=[]),
            patch.object(device_manager, "_discovered_direct_endpoints", {"old_ip:49152": {"endpoint": "old_ip:49152", "status": "online"}}),
        ):
            endpoints = await device_manager.list_direct_endpoints()
            self.assertEqual(len(endpoints), 0)
            self.assertEqual(len(device_manager._discovered_direct_endpoints), 0)

    async def test_reassigned_ip_connects_to_new_owner_not_old_cached_phone(self) -> None:
        """舊 IP 被另一台手機取得時，掃描端點不誤植舊身分，連線嚴格匹配新持有者，不回退 Bonjour 至舊手機。"""
        udid_a = "00008030-0011111111111111"
        udid_b = "00008030-0022222222222222"
        reassigned_ip = "192.168.1.50"

        # 1. Verify list_direct_endpoints does NOT assign Phone A's UDID to Phone B's endpoint
        with (
            patch.object(device_manager, "_get_arp_map_async", AsyncMock(return_value={})),
            patch.object(device_manager, "_browse_dns_sd_services", AsyncMock(return_value=[])),
            patch.object(device_manager, "_resolve_dns_sd_instance", AsyncMock(return_value=(None, None))),
            patch.object(device_manager, "browse_mobdev2", AsyncMock(return_value=[])),
            patch.object(pairing_store, "list_udids", return_value=[udid_a]),
            patch.object(pairing_store, "load_address", side_effect=lambda u: reassigned_ip if u == udid_a else None),
            patch.object(pairing_store, "load_version", return_value="17.4"),
            patch.object(device_manager, "_ping_tcp_async", AsyncMock(return_value=True)),
        ):
            with patch.dict(device_manager._discovered_direct_endpoints, clear=True):
                # Use Apple MAC prefix "f0:1f:c7" so ARP table filtering accepts the device
                with patch.object(device_manager, "_get_arp_map_async", AsyncMock(return_value={"f0:1f:c7:11:22:33": reassigned_ip})):
                    with patch("platform.system", return_value="Darwin"):
                        with patch.object(device_manager, "_browse_dns_sd_services", AsyncMock(return_value=[])):
                            endpoints = await device_manager.list_direct_endpoints()
                            live_ep = next((e for e in endpoints if e["ip"] == reassigned_ip and e["status"] == "online"), None)
                            self.assertIsNone(live_ep, "ARP alone must not claim that RemotePairing is available")

        # 2. Strict connect to reassigned_ip with Phone A and fallback_bonjour=False MUST fail and NOT connect via Bonjour
        with (
            patch.object(device_manager, "_has_active_session", return_value=False),
            patch.object(pairing_store, "exists", return_value=True),
            patch.object(pairing_store, "load_version", return_value="17.4"),
            patch.object(device_manager, "_connect_direct_rsd", AsyncMock(side_effect=ConnectionRefusedError("Wrong device"))),
        ):
            with self.assertRaises((ConnectionRefusedError, ValueError)):
                await device_manager.connect_direct(udid_a, reassigned_ip, fallback_bonjour=False)

        # 3. Auto connect to reassigned_ip probes candidates and connects to Phone B (the actual owner)
        rsd_b = SimpleNamespace(udid=udid_b, name="Phone B", product_version="17.4")
        class MockBProvider:
            async def close(self):
                pass

        class MockTunnelB:
            def __init__(self, serial=None, ip=None, **_kwargs):
                self.serial = serial
                self.ip = ip
                self.peer_ip = ip

            async def aopen(self):
                return rsd_b

            async def aclose(self):
                pass

        class Channel:
            async def __aenter__(self):
                return self
            async def __aexit__(self, *_args):
                return None

        async def fake_probe(cand, ip, _port, autopair=True):
            self.assertFalse(autopair)
            if cand == udid_b and ip == reassigned_ip:
                return MockBProvider()
            raise ConnectionRefusedError("Handshake failed")

        with (
            patch.object(device_manager, "_has_active_session", return_value=False),
            patch.object(device_manager, "iter_remote_paired_identifiers", return_value=[udid_a, udid_b]),
            patch.object(device_manager.tunnel_service, "create_core_device_tunnel_service_using_remotepairing", side_effect=fake_probe),
            patch.object(device_manager, "WiFiRsdTunnel", MockTunnelB),
            patch.object(device_manager, "DvtProvider", return_value=Channel()),
            patch.object(device_manager, "LocationSimulation", return_value=Channel()),
            patch.object(pairing_store, "exists", return_value=True),
            patch.object(pairing_store, "load_version", return_value="17.4"),
            patch.object(pairing_store, "save_address") as mock_save,
            patch.object(pairing_store, "save_version"),
        ):
            connected = await device_manager.connect_direct("auto", reassigned_ip)
            self.assertEqual(connected.udid, udid_b)
            self.assertEqual(connected.ip_address, reassigned_ip)
            mock_save.assert_called_with(udid_b, reassigned_ip)

    async def test_ipv6_direct_rsd_connection_saves_address_and_registers_tunnel(self) -> None:
        """IPv6 位址（包含 fe80::1234%en0）連線成功後能正常保存且保留 scope，通道完成登記無外洩。"""
        udid = "00008030-001234567890ABCD"
        ipv6_scoped = "fe80::1234%en0"
        rsd = SimpleNamespace(udid=udid, name="IPv6 iPhone", product_version="17.4")

        class MockIPv6Tunnel:
            def __init__(self, serial=None, ip=None, **_kwargs):
                self.serial = serial
                self.ip = ip
                self.peer_ip = ipv6_scoped
                self.closed = False

            async def aopen(self):
                return rsd

            async def aclose(self):
                self.closed = True

        class Channel:
            async def __aenter__(self):
                return self
            async def __aexit__(self, *_args):
                return None

        # Clean state
        device_manager._direct_rsd_tunnels.pop(udid.lower(), None)
        device_manager._direct_rsd_devices.pop(udid.lower(), None)
        device_manager._direct_addresses.pop(udid.lower(), None)

        with (
            patch.object(device_manager, "_has_active_session", return_value=False),
            patch.object(device_manager, "WiFiRsdTunnel", MockIPv6Tunnel),
            patch.object(device_manager, "DvtProvider", return_value=Channel()),
            patch.object(device_manager, "LocationSimulation", return_value=Channel()),
            patch.object(pairing_store, "exists", return_value=True),
            patch.object(pairing_store, "load_version", return_value="17.4"),
            patch.object(pairing_store, "save_address", wraps=pairing_store.save_address) as mock_save_addr,
            patch.object(pairing_store, "save_version"),
            patch.object(pairing_store, "_atomic_write") as mock_atomic_write,
        ):
            connected = await device_manager.connect_direct(udid, ipv6_scoped, fallback_bonjour=False)
            self.assertEqual(connected.udid, udid)
            self.assertEqual(connected.ip_address, ipv6_scoped)

            # Check that pairing_store.save_address was called with ipv6_scoped
            mock_save_addr.assert_called_with(udid, ipv6_scoped)
            # Check atomic write wrote the intact scoped IPv6 address "fe80::1234%en0"
            mock_atomic_write.assert_called()
            args, _ = mock_atomic_write.call_args
            self.assertEqual(args[1], b"fe80::1234%en0")

            # Verify tunnel and device are successfully registered in device_manager dicts
            self.assertIn(udid.lower(), device_manager._direct_rsd_tunnels)
            self.assertIn(udid.lower(), device_manager._direct_rsd_devices)
            self.assertFalse(device_manager._direct_rsd_tunnels[udid.lower()].closed)

    async def test_ipv6_reconnect_from_saved_address_preserves_scope(self) -> None:
        """驗證從 .address 載入帶 scope 的 IPv6 位址後能成功復連，且不會遺失 scope。"""
        udid = "00008030-001234567890ABCD"
        ipv6_scoped = "fe80::1234%en0"
        rsd = SimpleNamespace(udid=udid, name="IPv6 iPhone", product_version="17.4")

        tunnel_created_with_ip = None

        class MockIPv6Tunnel:
            def __init__(self, serial=None, ip=None, **_kwargs):
                nonlocal tunnel_created_with_ip
                self.serial = serial
                self.ip = ip
                tunnel_created_with_ip = ip
                self.peer_ip = ip

            async def aopen(self):
                return rsd

            async def aclose(self):
                pass

        class Channel:
            async def __aenter__(self):
                return self
            async def __aexit__(self, *_args):
                return None

        # Clean state
        device_manager._direct_rsd_tunnels.pop(udid.lower(), None)
        device_manager._direct_rsd_devices.pop(udid.lower(), None)
        device_manager._direct_addresses.pop(udid.lower(), None)

        with (
            patch.object(device_manager, "_has_active_session", return_value=False),
            patch.object(device_manager, "WiFiRsdTunnel", MockIPv6Tunnel),
            patch.object(device_manager, "DvtProvider", return_value=Channel()),
            patch.object(device_manager, "LocationSimulation", return_value=Channel()),
            patch.object(pairing_store, "exists", return_value=True),
            patch.object(pairing_store, "load_version", return_value="17.4"),
            patch.object(pairing_store, "load_address", return_value=ipv6_scoped),
            patch.object(pairing_store, "save_address"),
            patch.object(pairing_store, "save_version"),
        ):
            # Simulate quick reconnect: caller passes cached IP loaded from pairing_store
            cached_ip = pairing_store.load_address(udid)
            self.assertEqual(cached_ip, ipv6_scoped)
            connected = await device_manager.connect_direct(udid, cached_ip, fallback_bonjour=True)
            self.assertEqual(connected.udid, udid)
            self.assertEqual(tunnel_created_with_ip, ipv6_scoped, "Tunnel must be opened with the intact scoped IPv6 address")

    async def test_ios16_connect_direct_strict_ip_no_bonjour_fallback(self) -> None:
        """iOS 16 在 fallback_bonjour=False 時，若指定 IP 連線失敗，絕不嘗試快取、Bonjour 或其他掃描位址。"""
        udid = "00008030-0016161616161616"
        target_ip = "192.168.1.100"
        cached_ip = "192.168.1.200"

        with (
            patch.object(device_manager, "_has_active_session", return_value=False),
            patch.object(pairing_store, "exists", return_value=True),
            patch.object(pairing_store, "load_version", return_value="16.7"),
            patch.object(pairing_store, "load_address", return_value=cached_ip),
            patch.object(device_manager, "_describe_direct", AsyncMock(side_effect=ConnectionRefusedError("Offline at target IP"))),
            patch.object(device_manager, "browse_mobdev2", AsyncMock(return_value=[])) as mock_browse,
        ):
            with self.assertRaises(ValueError) as ctx:
                await device_manager.connect_direct(udid, target_ip, fallback_bonjour=False)
            self.assertIn(f"無法在 {target_ip} 連線至裝置 {udid}", str(ctx.exception))
            # Verify browse_mobdev2 was NEVER called because fallback_bonjour=False
            mock_browse.assert_not_called()
