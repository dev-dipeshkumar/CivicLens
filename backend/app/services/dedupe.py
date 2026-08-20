"""
Perceptual-hash based duplicate detection.

A new report is considered a duplicate of an existing one when BOTH:
  * imagehash.phash Hamming distance <= 8   (visually similar)
  * haversine distance < 120m               (physically close)

Duplicates are turned into "corroborations": the existing report's
`confirmations` counter is incremented; the child's `duplicate_of` FK
points at the parent.
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from typing import Optional

import imagehash
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Report
from .geo import bounding_box, haversine_m

PHASH_MAX_DISTANCE = 8
GEO_MAX_METERS = 120.0


def compute_phash(image_bytes: bytes) -> str:
    """Return a 16-bit (16x16 sampled) perceptual hash as hex string."""
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    return str(imagehash.phash(img, hash_size=16))


def _hamming_hex(a: str, b: str) -> int:
    """Hamming distance between two equal-length hex strings."""
    if len(a) != len(b):
        return 10_000
    ai = int(a, 16)
    bi = int(b, 16)
    return (ai ^ bi).bit_count()


@dataclass
class DuplicateMatch:
    parent: Report
    distance_m: float
    phash_distance: int


def find_duplicate(
    db: Session, phash_hex: str, lat: float, lng: float
) -> Optional[DuplicateMatch]:
    """
    Look for a canonical (non-child) report that visually + spatially matches.
    Uses a bounding-box SQL pre-filter so we don't scan the whole table.
    """
    min_lat, max_lat, min_lng, max_lng = bounding_box(lat, lng, GEO_MAX_METERS * 2)
    stmt = (
        select(Report)
        .where(Report.duplicate_of.is_(None))
        .where(Report.lat.between(min_lat, max_lat))
        .where(Report.lng.between(min_lng, max_lng))
    )
    candidates = db.execute(stmt).scalars().all()

    best: Optional[DuplicateMatch] = None
    for c in candidates:
        d_geo = haversine_m(lat, lng, c.lat, c.lng)
        if d_geo >= GEO_MAX_METERS:
            continue
        d_hash = _hamming_hex(phash_hex, c.image_hash)
        if d_hash > PHASH_MAX_DISTANCE:
            continue
        if best is None or d_hash < best.phash_distance:
            best = DuplicateMatch(parent=c, distance_m=d_geo, phash_distance=d_hash)
    return best
