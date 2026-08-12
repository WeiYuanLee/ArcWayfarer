"""Small, dependency-free helpers for choosing a LAN address for QR pairing."""

from __future__ import annotations

import ipaddress
import socket


def primary_lan_ipv4() -> str | None:
    """Return the best private IPv4 address without requiring internet access.

    UDP connect only asks the OS which interface it would use; it doesn't send a
    packet.  The fallbacks cover offline access points and machines with no
    default route.
    """
    candidates: list[str] = []
    for destination in ("192.0.2.1", "198.51.100.1"):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
                sock.connect((destination, 9))
                candidates.append(sock.getsockname()[0])
        except OSError:
            pass
    try:
        candidates.extend(socket.gethostbyname_ex(socket.gethostname())[2])
    except OSError:
        pass

    for address in dict.fromkeys(candidates):
        try:
            parsed = ipaddress.ip_address(address)
        except ValueError:
            continue
        if parsed.version == 4 and parsed.is_private and not parsed.is_loopback:
            return address
    return None
