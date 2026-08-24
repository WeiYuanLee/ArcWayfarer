"""Pure, deterministic geometry helpers for Flower mode.

Kept separate from the runner so path generation can be tested without a
device connection or simulation session.
"""
from __future__ import annotations

import hashlib
import math
import random

Coordinate = tuple[float, float]


def offset_coordinate(point: Coordinate, distance_m: float, bearing_rad: float) -> Coordinate:
    """Approximate local-meter offset; accurate enough for Flower-scale paths."""
    lat, lng = point
    cos_lat = max(math.cos(math.radians(lat)), 1e-8)
    return (
        lat + distance_m * math.cos(bearing_rad) / 111_320.0,
        lng + distance_m * math.sin(bearing_rad) / (111_320.0 * cos_lat),
    )


def _rng(seed: str) -> random.Random:
    digest = hashlib.sha256(seed.encode("utf-8")).digest()
    return random.Random(int.from_bytes(digest[:8], "big"))


def spiral_radii(radius_m: float, circles: float, inner_radius_m: float | None = None) -> list[float]:
    """Return one radius per full/partial ring, from outer to inner."""
    ring_count = max(1, math.ceil(circles))
    inner = inner_radius_m if inner_radius_m is not None else max(12.0, radius_m * 0.60)
    inner = min(radius_m, max(5.0, inner))
    if ring_count == 1:
        return [radius_m]
    return [radius_m - i * (radius_m - inner) / (ring_count - 1) for i in range(ring_count)]


def _ring_path(
    center: Coordinate,
    radius_m: float,
    fraction: float,
    segments: int,
    start_angle: float,
    jitter_m: float,
    seed: str,
) -> list[Coordinate]:
    """Build a polygonal ring or partial ring with stable bounded jitter."""
    count = max(1, math.ceil(fraction * segments))
    rng = _rng(seed)
    offsets: list[float] = []
    for index in range(count + 1):
        # Close a full ring at its true first vertex.  Other vertices use a
        # deterministic, gently changing radial offset, so we do not generate
        # sharp zig-zags or a non-repeatable GPS preview.
        if fraction == 1.0 and index == segments:
            offsets.append(offsets[0])
            continue
        candidate = rng.uniform(-jitter_m, jitter_m) if jitter_m else 0.0
        if offsets:
            candidate = max(offsets[-1] - 1.0, min(offsets[-1] + 1.0, candidate))
        offsets.append(candidate)
    return [
        offset_coordinate(center, max(5.0, radius_m + offset), start_angle + 2 * math.pi * index / segments)
        for index, offset in enumerate(offsets)
    ]


def flower_spiral_path(
    center: Coordinate,
    radius_m: float,
    circles: float,
    segments: int,
    *,
    inner_radius_m: float | None = None,
    jitter_m: float = 1.5,
    seed: str = "flower",
) -> list[Coordinate]:
    """Center → outer ring → progressively inner rings, deterministically."""
    path: list[Coordinate] = [center]
    remaining = circles
    for ring_index, radius in enumerate(spiral_radii(radius_m, circles, inner_radius_m)):
        fraction = min(1.0, remaining)
        ring_seed = f"{seed}:ring:{ring_index}"
        base_angle = _rng(ring_seed).uniform(0.0, 2 * math.pi) + ring_index * math.radians(18)
        ring = _ring_path(center, radius, fraction, segments, base_angle, jitter_m, ring_seed)
        path.extend(ring)
        remaining -= fraction
    return path


def flower_perimeter_path(
    center: Coordinate,
    radius_m: float,
    circles: float,
    segments: int,
) -> list[Coordinate]:
    """Legacy single-radius perimeter geometry for compatibility/debugging."""
    count = max(1, round(circles * segments))
    return [offset_coordinate(center, radius_m, 2 * math.pi * i / segments) for i in range(count + 1)]
