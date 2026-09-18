"""Read-only probe for the wireless connection spike.

Run with the project's pinned pymobiledevice3 version. This does not pair,
change iPhone settings, save pairing records, or simulate a location.
"""

import argparse
import asyncio
import hashlib
import ipaddress
from importlib.metadata import version

from pymobiledevice3.bonjour import browse_mobdev2, browse_remoted
from pymobiledevice3.lockdown import create_using_tcp, create_using_usbmux
from pymobiledevice3.pair_records import get_preferred_pair_record
from pymobiledevice3.remote.userspace_tunnel import UserspaceRsdTunnel
from pymobiledevice3.services.dvt.instruments.dvt_provider import DvtProvider
from pymobiledevice3.services.dvt.instruments.location_simulation import LocationSimulation
from pymobiledevice3.usbmux import list_devices
from pymobiledevice3.common import get_home_folder


TIMEOUT_SECONDS = 12


def device_label(udid: str) -> str:
    return hashlib.sha256(udid.lower().encode()).hexdigest()[:10]


async def probe_mux(udid: str, connection_type: str) -> dict | None:
    try:
        lockdown = await asyncio.wait_for(
            create_using_usbmux(serial=udid, connection_type=connection_type, autopair=False),
            timeout=TIMEOUT_SECONDS,
        )
        async with lockdown:
            try:
                wifi_enabled = await asyncio.wait_for(lockdown.get_enable_wifi_connections(), TIMEOUT_SECONDS)
            except Exception as exc:  # A failed setting query must not hide a working connection.
                wifi_enabled = f"unknown ({type(exc).__name__})"
            return {
                "ios": lockdown.product_version,
                "paired": lockdown.paired,
                "pair_record_available": lockdown.pair_record is not None,
                "wifi_connections_enabled": wifi_enabled,
            }
    except Exception as exc:
        print(f"{connection_type}: failed ({type(exc).__name__})")
        return None


async def probe_tcp(ip: str, udid: str, pair_record: dict) -> bool:
    try:
        lockdown = await asyncio.wait_for(
            create_using_tcp(
                hostname=ip,
                identifier=udid,
                pair_record=pair_record,
                autopair=False,
                keep_alive=True,
            ),
            timeout=TIMEOUT_SECONDS,
        )
        async with lockdown:
            matched = lockdown.udid.lower() == udid.lower()
            print(f"Direct TCP: {'paired and identity matched' if lockdown.paired and matched else 'identity or pairing failed'}")
            print(f"Direct TCP iOS: {lockdown.product_version}")
            return lockdown.paired and matched
    except Exception as exc:
        print(f"Direct TCP: failed ({type(exc).__name__})")
        return False


async def probe_rsd(udid: str) -> None:
    try:
        async with asyncio.timeout(30):
            async with UserspaceRsdTunnel(serial=udid, autopair=False) as rsd:
                matched = rsd.udid.lower() == udid.lower()
                async with DvtProvider(rsd) as dvt:
                    async with LocationSimulation(dvt):
                        print(f"Userspace RSD/DVT location channel: {'ready' if matched else 'identity mismatch'}")
    except Exception as exc:
        print(f"Userspace RSD/DVT location channel: failed ({type(exc).__name__})")


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--udid", help="Target a device when more than one is listed")
    parser.add_argument("--ip", help="Optionally test direct TCP to this known iPhone IP")
    parser.add_argument("--auto-tcp", action="store_true", help="Try advertised IPv4 mobdev2 addresses for this paired device")
    parser.add_argument("--probe-rsd", action="store_true", help="Open an iOS 17+ userspace RSD/DVT location channel without changing location")
    args = parser.parse_args()

    print(f"pymobiledevice3: {version('pymobiledevice3')}")
    try:
        devices = await asyncio.wait_for(list_devices(), timeout=TIMEOUT_SECONDS)
        paths: dict[str, set[str]] = {}
        for device in devices:
            paths.setdefault(device.serial, set()).add(device.connection_type)
        print(f"usbmux unique devices: {len(paths)}")
        for udid, types in paths.items():
            print(f"  {device_label(udid)}: {', '.join(sorted(types))}")
    except Exception as exc:
        print(f"usbmux listing: failed ({type(exc).__name__})")
        paths = {}

    mobdev2_services = []
    for name, browse in (("mobdev2", browse_mobdev2), ("remoted", browse_remoted)):
        try:
            services = await asyncio.wait_for(browse(timeout=3), timeout=5)
            print(f"mDNS {name} services: {len(services)}")
            if name == "mobdev2":
                mobdev2_services = services
        except Exception as exc:
            print(f"mDNS {name}: failed ({type(exc).__name__})")

    if args.udid:
        udid = args.udid
    elif len(paths) == 1:
        udid = next(iter(paths))
    else:
        print("Device probe: skipped (supply --udid to select a device)")
        return

    for connection_type in ("USB", "Network"):
        if connection_type in paths.get(udid, set()):
            result = await probe_mux(udid, connection_type)
            if result is not None:
                print(f"{connection_type}: {result}")

    if args.ip or args.auto_tcp:
        pair_record = await get_preferred_pair_record(udid, get_home_folder())
        if pair_record is None:
            print("Direct TCP: skipped (no existing pairing record found)")
        elif args.ip:
            await probe_tcp(args.ip, udid, pair_record)
        else:
            addresses = list(dict.fromkeys(
                address.full_ip
                for service in mobdev2_services
                for address in service.addresses
                if ipaddress.ip_address(address.ip).version == 4
            ))
            print(f"Direct TCP advertised IPv4 candidates: {len(addresses)}")
            for address in addresses:
                if await probe_tcp(address, udid, pair_record):
                    break

    if args.probe_rsd:
        await probe_rsd(udid)


if __name__ == "__main__":
    asyncio.run(main())
