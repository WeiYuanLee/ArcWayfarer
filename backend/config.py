import os
from pathlib import Path

# The HTTP middleware keeps all non-loopback callers behind QR pairing.
API_HOST = "0.0.0.0"
API_PORT = int(os.environ.get("ARCWAYFARER_API_PORT", "8787"))

APP_DATA_DIR = Path.home() / ".arcwayfarer"
SETTINGS_FILE = APP_DATA_DIR / "settings.json"
BOOKMARKS_FILE = APP_DATA_DIR / "bookmarks.json"
ROUTES_FILE = APP_DATA_DIR / "routes.json"
HISTORY_FILE = APP_DATA_DIR / "history.json"

MAX_HISTORY_ENTRIES = 30
HISTORY_DEDUPE_DIST_M = 10.0

ROUTING_ENGINES = ("osrm", "valhalla", "brouter")
DEFAULT_ROUTING_ENGINE = "osrm"

# The public OSRM demo server only serves the "driving" profile. The FOSSGIS
# mirror hosts separate foot/bike/car routed instances, which Navigate needs
# for walk/bike/drive.
OSRM_FOSSGIS_BASE_URL = "https://routing.openstreetmap.de"
NAV_MODE_PROFILE = {"walk": "foot", "bike": "bike", "drive": "car"}
NAV_MODE_SPEED_MPS = {"walk": 5 / 3.6, "bike": 18.9 / 3.6, "drive": 40 / 3.6}
NAVIGATE_TICK_SECONDS = 1.0

# Developer Disk Image mounting can involve a first-time download from Apple;
# give it a generous ceiling so a stuck mount fails with a clear error instead
# of hanging the request forever.
MOUNT_TIMEOUT_SECONDS = 120.0

MAX_GROUP_DEVICES = 3


def ensure_app_data_dir() -> None:
    APP_DATA_DIR.mkdir(parents=True, exist_ok=True)
