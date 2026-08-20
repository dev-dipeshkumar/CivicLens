"""Geographic helpers: haversine distance + radius queries."""

from __future__ import annotations

import math
from typing import Iterable, Tuple

EARTH_RADIUS_M = 6_371_000.0


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance between two WGS-84 points, in meters."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlmb / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def bounding_box(lat: float, lng: float, radius_m: float) -> Tuple[float, float, float, float]:
    """
    Return a (min_lat, max_lat, min_lng, max_lng) box that contains all points
    within `radius_m` meters of (lat, lng). Used as a cheap SQL pre-filter
    before the exact haversine check in Python.
    """
    dlat = radius_m / 111_320.0  # meters per degree latitude
    # meters per degree of longitude shrinks with latitude
    dlng = radius_m / (111_320.0 * max(math.cos(math.radians(lat)), 1e-6))
    return lat - dlat, lat + dlat, lng - dlng, lng + dlng


def within_radius(
    points: Iterable[Tuple[float, float]], lat: float, lng: float, radius_m: float
) -> list[Tuple[float, float, float]]:
    """Filter (lat, lng) points to those within `radius_m`; annotate with distance."""
    out: list[Tuple[float, float, float]] = []
    for plat, plng in points:
        d = haversine_m(lat, lng, plat, plng)
        if d <= radius_m:
            out.append((plat, plng, d))
    return out
