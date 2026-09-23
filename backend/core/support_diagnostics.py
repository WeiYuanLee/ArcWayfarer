"""Support-safe runtime facts for cross-platform device acceptance reports."""

from importlib.metadata import PackageNotFoundError, version
import platform
import ssl


def runtime_diagnostic() -> dict[str, str]:
    """Return versions useful for packaging/TLS diagnosis, without secrets."""
    try:
        pymobiledevice3_version = version("pymobiledevice3")
    except PackageNotFoundError:
        pymobiledevice3_version = "unknown"
    return {
        "platform": platform.system(),
        "platform_release": platform.release(),
        "machine": platform.machine(),
        "python_version": platform.python_version(),
        "openssl_version": ssl.OPENSSL_VERSION,
        "pymobiledevice3_version": pymobiledevice3_version,
    }
