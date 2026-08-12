"""Locate the mobile web bundle in development and packaged builds."""

from __future__ import annotations

import os
from pathlib import Path


def mobile_web_dir() -> Path:
    configured = os.environ.get("ARCWAYFARER_WEB_DIR")
    if configured:
        return Path(configured)
    return Path(__file__).resolve().parents[2] / "frontend" / "mobile-dist"


def mobile_web_ready() -> bool:
    return (mobile_web_dir() / "index.html").is_file()
