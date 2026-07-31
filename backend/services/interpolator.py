import random
from math import asin, atan2, cos, degrees, radians, sin, sqrt

EARTH_RADIUS_M = 6371000.0


def _haversine_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lng1 = radians(a[0]), radians(a[1])
    lat2, lng2 = radians(b[0]), radians(b[1])
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    h = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlng / 2) ** 2
    return 2 * EARTH_RADIUS_M * atan2(sqrt(h), sqrt(1 - h))


def interpolate(
    points: list[tuple[float, float]], speed_mps: float, tick_seconds: float
) -> list[tuple[float, float]]:
    """Resample a polyline into points spaced `speed_mps * tick_seconds` meters apart."""
    if len(points) < 2:
        return list(points)

    step_m = speed_mps * tick_seconds
    if step_m <= 0:
        return list(points)

    resampled = [points[0]]
    carry_over = 0.0

    for a, b in zip(points, points[1:]):
        segment_len = _haversine_m(a, b)
        if segment_len == 0:
            continue

        distance_along = step_m - carry_over
        while distance_along < segment_len:
            fraction = distance_along / segment_len
            lat = a[0] + (b[0] - a[0]) * fraction
            lng = a[1] + (b[1] - a[1]) * fraction
            resampled.append((lat, lng))
            distance_along += step_m

        carry_over = distance_along - segment_len

    if resampled[-1] != points[-1]:
        resampled.append(points[-1])

    return resampled


def move_point(lat: float, lng: float, bearing_deg: float, distance_m: float) -> tuple[float, float]:
    """Destination point given a start, compass bearing (0=N, 90=E), and distance."""
    bearing = radians(bearing_deg)
    angular_distance = distance_m / EARTH_RADIUS_M

    lat1 = radians(lat)
    lng1 = radians(lng)

    lat2 = asin(sin(lat1) * cos(angular_distance) + cos(lat1) * sin(angular_distance) * cos(bearing))
    lng2 = lng1 + atan2(
        sin(bearing) * sin(angular_distance) * cos(lat1),
        cos(angular_distance) - sin(lat1) * sin(lat2),
    )

    return degrees(lat2), degrees(lng2)


def random_point_in_radius(center_lat: float, center_lng: float, radius_m: float) -> tuple[float, float]:
    """Pick a uniformly-distributed random point within radius_m of the center."""
    bearing = radians(random.uniform(0.0, 360.0))
    distance = radius_m * sqrt(random.random())  # sqrt avoids clustering near the center

    lat1 = radians(center_lat)
    lng1 = radians(center_lng)
    angular_distance = distance / EARTH_RADIUS_M

    lat2 = asin(sin(lat1) * cos(angular_distance) + cos(lat1) * sin(angular_distance) * cos(bearing))
    lng2 = lng1 + atan2(
        sin(bearing) * sin(angular_distance) * cos(lat1),
        cos(angular_distance) - sin(lat1) * sin(lat2),
    )

    return degrees(lat2), degrees(lng2)
