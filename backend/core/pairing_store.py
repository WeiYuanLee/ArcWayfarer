"""Private local copy of lockdown pairing records used by direct TCP connections."""

import os
import plistlib
import re
import tempfile
from datetime import datetime, timezone
from ipaddress import ip_address
from pathlib import Path

from config import APP_DATA_DIR

PAIRING_DIR = APP_DATA_DIR / "pairing_records"
_UDID_PATTERN = re.compile(r"^[A-Za-z0-9-]{8,64}$")
_REQUIRED_KEYS = {"HostID", "SystemBUID", "HostCertificate", "HostPrivateKey", "RootCertificate", "RootPrivateKey"}


def _path(udid: str) -> Path:
    if not _UDID_PATTERN.fullmatch(udid):
        raise ValueError("Invalid device identifier")
    return PAIRING_DIR / f"{udid.lower()}.plist"


def _validate(record: dict) -> None:
    if not isinstance(record, dict) or not _REQUIRED_KEYS.issubset(record):
        raise ValueError("The device has no complete pairing record")


def save(udid: str, record: dict) -> None:
    _validate(record)
    path = _path(udid)
    _atomic_write(path, plistlib.dumps(record))


def _atomic_write(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if os.name == "posix":
        path.parent.chmod(0o700)
    fd, temporary = tempfile.mkstemp(prefix=".pair-", dir=PAIRING_DIR)
    try:
        if os.name == "posix":
            os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def load(udid: str) -> dict | None:
    path = _path(udid)
    try:
        record = plistlib.loads(path.read_bytes())
    except FileNotFoundError:
        return None
    _validate(record)
    return record


def exists(udid: str) -> bool:
    return _path(udid).is_file()


def list_udids() -> list[str]:
    if not PAIRING_DIR.is_dir():
        return []
    return [path.stem for path in PAIRING_DIR.glob("*.plist") if _UDID_PATTERN.fullmatch(path.stem)]


def save_address(udid: str, ip: str) -> None:
    raw = ip.strip()
    scope = None
    if "%" in raw:
        clean_ip, scope = raw.split("%", 1)
        if not re.fullmatch(r"[A-Za-z0-9._-]+", scope):
            raise ValueError(f"Invalid scope identifier: {scope}")
    else:
        clean_ip = raw

    ip_obj = ip_address(clean_ip)
    # For link-local IPv6 addresses, preserve scope so OS socket calls can route correctly
    address = f"{ip_obj}%{scope}" if scope else str(ip_obj)
    _atomic_write(_path(udid).with_suffix(".address"), address.encode("ascii"))


def load_address(udid: str) -> str | None:
    try:
        raw = _path(udid).with_suffix(".address").read_text(encoding="ascii").strip()
        scope = None
        if "%" in raw:
            clean_ip, scope = raw.split("%", 1)
            if not re.fullmatch(r"[A-Za-z0-9._-]+", scope):
                return None
        else:
            clean_ip = raw
        ip_obj = ip_address(clean_ip)
        return f"{ip_obj}%{scope}" if scope else str(ip_obj)
    except (FileNotFoundError, ValueError):
        return None


def address_modified_at(udid: str) -> str | None:
    try:
        return datetime.fromtimestamp(_path(udid).with_suffix(".address").stat().st_mtime, tz=timezone.utc).isoformat()
    except OSError:
        return None


def save_version(udid: str, ios_version: str) -> None:
    if not re.fullmatch(r"[0-9]+(?:\.[0-9]+){0,3}", ios_version):
        raise ValueError("Invalid iOS version")
    _atomic_write(_path(udid).with_suffix(".version"), ios_version.encode("ascii"))


def load_version(udid: str) -> str | None:
    try:
        value = _path(udid).with_suffix(".version").read_text(encoding="ascii")
    except FileNotFoundError:
        return None
    return value if re.fullmatch(r"[0-9]+(?:\.[0-9]+){0,3}", value) else None


def remove_address(udid: str) -> None:
    _path(udid).with_suffix(".address").unlink(missing_ok=True)


def remove(udid: str) -> None:
    _path(udid).unlink(missing_ok=True)
    _path(udid).with_suffix(".address").unlink(missing_ok=True)
    _path(udid).with_suffix(".version").unlink(missing_ok=True)
