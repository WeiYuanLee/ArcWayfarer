"""Cross-platform, read-only Wireless Direct endpoint discovery."""

import asyncio
import logging
import platform
import re
import socket
import subprocess

from packaging.version import Version
from pymobiledevice3.bonjour import browse_mobdev2, browse_remotepairing
from pymobiledevice3.remote.tunnel_service import iter_remote_paired_identifiers

from core.pairing_manager import pairing_manager

logger = logging.getLogger(__name__)
IOS_17 = Version("17.0")

_discovered_endpoints: dict[str, dict] = {}


def cached_endpoints() -> tuple[dict, ...]:
    """Return a copy so connection commands cannot mutate scanner state."""
    return tuple(dict(endpoint) for endpoint in _discovered_endpoints.values())


def clear_cache() -> None:
    _discovered_endpoints.clear()


def _normalize_mac(mac: str) -> str:
    parts = mac.lower().replace("-", ":").split(":")
    return ":".join(f"{int(p, 16):02x}" for p in parts if p)


def _get_arp_map_sync() -> dict[str, str]:
    arp_mac_to_ip: dict[str, str] = {}
    try:
        # Windows prints `IP  aa-bb-cc-dd-ee-ff  dynamic`; macOS prints
        # `name (IP) at aa:bb:cc:dd:ee:ff`. ARP only supplements mDNS.
        windows = platform.system() == "Windows"
        out = subprocess.check_output(["arp", "-a" if windows else "-an"], text=True, stderr=subprocess.DEVNULL, timeout=1.5)
        for line in out.splitlines():
            m = (re.search(r"^\s*([\d.]+)\s+([0-9a-fA-F-]{17})\s+", line)
                 if windows else re.search(r"\(([\d\.]+)\)\s+at\s+([0-9a-fA-F:]+)", line))
            if m:
                arp_mac_to_ip[_normalize_mac(m.group(2))] = m.group(1)
    except Exception:
        pass
    return arp_mac_to_ip


async def _get_arp_map_async() -> dict[str, str]:
    try:
        return await asyncio.wait_for(asyncio.to_thread(_get_arp_map_sync), timeout=2.0)
    except Exception:
        return {}


def _resolve_host_ips_sync(host: str) -> list[str]:
    try:
        return [
            ai[4][0]
            for ai in socket.getaddrinfo(host, None, socket.AF_INET)
            if not ai[4][0].startswith("127.")
        ]
    except Exception:
        return []


async def _resolve_host_ips_async(host: str) -> list[str]:
    try:
        return await asyncio.wait_for(asyncio.to_thread(_resolve_host_ips_sync, host), timeout=1.0)
    except Exception:
        return []


def _ping_tcp_sync(ip: str, port: int = 49152) -> bool:
    try:
        with socket.create_connection((ip, port), timeout=0.25):
            return True
    except Exception:
        return False


async def _ping_tcp_async(ip: str, port: int = 49152) -> bool:
    try:
        return await asyncio.wait_for(asyncio.to_thread(_ping_tcp_sync, ip, port), timeout=0.5)
    except Exception:
        return False


async def _browse_dns_sd_services(service_type: str, duration: float = 1.0) -> list[str]:
    instances: list[str] = []
    try:
        proc = await asyncio.create_subprocess_exec(
            "dns-sd", "-B", service_type, "local",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        end_time = asyncio.get_event_loop().time() + duration
        while True:
            rem = end_time - asyncio.get_event_loop().time()
            if rem <= 0:
                break
            try:
                line = await asyncio.wait_for(proc.stdout.readline(), timeout=rem)
                if not line:
                    break
                text = line.decode(errors="ignore")
                parts = text.strip().split()
                if len(parts) >= 7 and parts[1] == "Add":
                    name = " ".join(parts[6:])
                    if name not in instances:
                        instances.append(name)
            except asyncio.TimeoutError:
                break
        try:
            proc.kill()
            await proc.wait()
        except Exception:
            pass
    except Exception:
        pass
    return instances


async def _resolve_dns_sd_instance(instance: str, service_type: str, duration: float = 0.8) -> tuple[str | None, int]:
    host = None
    port = 49152
    try:
        proc = await asyncio.create_subprocess_exec(
            "dns-sd", "-L", instance, service_type, "local",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        end_time = asyncio.get_event_loop().time() + duration
        while True:
            rem = end_time - asyncio.get_event_loop().time()
            if rem <= 0:
                break
            try:
                line = await asyncio.wait_for(proc.stdout.readline(), timeout=rem)
                if not line:
                    break
                text = line.decode(errors="ignore")
                m = re.search(r"can be reached at ([^:]+):(\d+)", text)
                if m:
                    host = m.group(1).rstrip(".")
                    port = int(m.group(2))
                    break
            except asyncio.TimeoutError:
                break
        try:
            proc.kill()
            await proc.wait()
        except Exception:
            pass
    except Exception:
        pass
    return host, port


async def list_direct_endpoints() -> list[dict]:
    # Build a fresh snapshot for this scan round to prevent ghost endpoints
    scan_endpoints: dict[str, dict] = {}
    arp_map = await _get_arp_map_async()

    # pymobiledevice3 11.3.1 already has a DNS-SD browser that retains the
    # advertised port and the interface scope for IPv6 link-local addresses.
    # Windows has no system `dns-sd` command, so use that browser directly.
    if platform.system() == "Windows":
        try:
            services = await asyncio.wait_for(browse_remotepairing(timeout=1.0), timeout=1.5)
            paired = {identifier.lower(): identifier for identifier in iter_remote_paired_identifiers()}
            for service in services:
                instance = re.split(r"\._remotepairing\._tcp\.local\.?$", service.instance, flags=re.IGNORECASE)[0]
                verified_udid = paired.get(instance.lower())
                for address in service.addresses:
                    ip = address.full_ip
                    if ":" in ip and "%" in ip:
                        host, scope = ip.rsplit("%", 1)
                        if not scope.isdecimal():
                            try:
                                # Windows sockets normally use a numeric IPv6
                                # interface index, while mDNS may return a name.
                                ip = f"{host}%{socket.if_nametoindex(scope)}"
                            except OSError:
                                logger.debug("Could not map IPv6 interface %s to an index", scope)
                    if ip.startswith("127."):
                        continue
                    port = service.port
                    endpoint = f"[{ip}]:{port}" if ":" in ip else f"{ip}:{port}"
                    scan_endpoints[endpoint] = {
                        "udid": verified_udid,
                        "ip": ip,
                        "port": port,
                        "endpoint": endpoint,
                        "source": "remotepairing",
                        "status": "history" if ip.startswith("169.254.") else "online",
                        "last_connected": None,
                        "device_name": service.host.removesuffix(".local") if service.host else None,
                        "ios_version": "unknown",
                    }
        except Exception as exc:
            logger.debug("RemotePairing mDNS browse failed: %s", exc)

    # 1. Native macOS dns-sd discovery
    if platform.system() == "Darwin":
        try:
            rp_insts = await _browse_dns_sd_services("_remotepairing._tcp", duration=1.0)

            # Known paired identifiers to strictly verify DNS-SD instance names
            rp_paired_identifiers = {i.lower(): i for i in iter_remote_paired_identifiers()}
            known_udids = {u.lower(): u for u in pairing_manager.list_udids()}

            # Resolve remotepairing services
            for inst in rp_insts:
                host, port = await _resolve_dns_sd_instance(inst, "_remotepairing._tcp")
                if host:
                    dev_name = host.replace(".local", "")
                    ips = await _resolve_host_ips_async(host)
                    verified_udid = rp_paired_identifiers.get(inst.lower()) or known_udids.get(inst.lower())
                    for ip in ips:
                        # RemotePairing publishes its current listener port in
                        # the SRV record. It can change when the phone leaves a
                        # hotspot and joins another Wi-Fi network, so carrying
                        # the old/default 49152 here makes the new IP unusable.
                        ep_str = f"{ip}:{port}"
                        is_link_local = ip.startswith("169.254.")
                        scan_endpoints[ep_str] = {
                            "udid": verified_udid,
                            "ip": ip,
                            "port": port,
                            "endpoint": ep_str,
                            "source": "remotepairing",
                            "status": "history" if is_link_local else "online",
                            "last_connected": None,
                            "device_name": dev_name,
                            "ios_version": "unknown",
                        }

        except Exception as e:
            logger.debug("Native dns-sd browse failed: %s", e)

    # 2. pymobiledevice3 browse_mobdev2
    try:
        services = await asyncio.wait_for(browse_mobdev2(timeout=1.0), timeout=1.5)
        for service in services:
            dev_name = service.host.replace(".local", "") if getattr(service, "host", None) else None
            txt_props = getattr(service, "properties", {}) or {}
            identifier = txt_props.get("identifier")
            saved_version = pairing_manager.load_version(identifier) if identifier else None
            # mobdev2 advertises ordinary lockdown Wi-Fi, not an iOS 17+
            # RemotePairing listener. Only expose it for a known, authorized
            # pre-iOS-17 phone; otherwise it becomes a false green :49152 row.
            if not identifier or not saved_version or Version(saved_version) >= IOS_17:
                continue
            service_port = int(getattr(service, "port", 62078) or 62078)
            for address in getattr(service, "addresses", []):
                try:
                    ip_str = getattr(address, "ip", None) or str(address)
                    if "." in ip_str and not ip_str.startswith("127."):
                        ep_str = f"{ip_str}:{service_port}"
                        is_link_local = ip_str.startswith("169.254.")
                        if ep_str not in scan_endpoints:
                            scan_endpoints[ep_str] = {
                                "udid": identifier,
                                "ip": ip_str,
                                "port": service_port,
                                "endpoint": ep_str,
                                "source": "mobdev2",
                                "status": "history" if is_link_local else "online",
                                "last_connected": None,
                                "device_name": dev_name,
                                "ios_version": "unknown",
                            }
                        else:
                            if dev_name and not scan_endpoints[ep_str].get("device_name"):
                                scan_endpoints[ep_str]["device_name"] = dev_name
                            if identifier and not scan_endpoints[ep_str].get("udid"):
                                scan_endpoints[ep_str]["udid"] = identifier
                except Exception:
                    continue
    except Exception as e:
        logger.debug("browse_mobdev2 failed: %s", e)

    # 3. Assemble results from fresh scan
    endpoints: list[dict] = list(scan_endpoints.values())
    seen_endpoints = set(scan_endpoints.keys())

    # 4. Pairing store historical records
    for udid in pairing_manager.list_udids():
        addr = pairing_manager.load_address(udid)
        ver = pairing_manager.load_version(udid)
        if addr:
            mtime_iso = pairing_manager.address_modified_at(udid)
            ep_str = f"{addr}:49152"
            if ep_str not in seen_endpoints:
                is_link_local = addr.startswith("169.254.")
                reachable = is_link_local or await _ping_tcp_async(addr, 49152)
                if not reachable:
                    continue

                seen_endpoints.add(ep_str)
                endpoints.append({
                    "udid": udid,
                    "ip": addr,
                    "port": 49152,
                    "endpoint": ep_str,
                    "source": "paired",
                    "status": "history",
                    "last_connected": mtime_iso,
                    "device_name": None,
                    "ios_version": ver or "unknown",
                })
            else:
                for ep in endpoints:
                    if ep["endpoint"] == ep_str:
                        if not ep.get("last_connected") and mtime_iso:
                            ep["last_connected"] = mtime_iso
                        if ver and ep.get("ios_version") == "unknown":
                            ep["ios_version"] = ver

    # Update global cache with fresh snapshot
    _discovered_endpoints.clear()
    _discovered_endpoints.update(scan_endpoints)

    # Sort: "online" (green) first, then "history" (orange)
    endpoints.sort(key=lambda x: (0 if x.get("status") == "online" else 1, x.get("endpoint", "")))
    return endpoints
