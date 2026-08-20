"""
Deterministic seed script — creates 24 believable reports around
DEMO_CENTER_LAT / DEMO_CENTER_LNG, spread over 14 days.

Distribution:
  * 45% pothole, 30% garbage, 15% streetlight, 10% road_damage
  * mixed severities and statuses
  * 3 tight spatial clusters (4–5 reports each, ±30 m) so the heatmap
    shows obvious hotspots on first load

Run:  python -m app.seed
"""

from __future__ import annotations

import io
import logging
import random
import uuid
from datetime import datetime, timedelta, timezone

import imagehash
from PIL import Image, ImageDraw, ImageFont

from .config import settings
from .database import SessionLocal, init_db
from .models import Report
from .services.severity import compute_severity, department_for

log = logging.getLogger("civiclens.seed")
logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")

CATEGORY_MIX = (
    ["pothole"] * 45 + ["garbage"] * 30 + ["streetlight"] * 15 + ["road_damage"] * 10
)

STATUS_MIX = ["new"] * 10 + ["assigned"] * 6 + ["in_progress"] * 5 + ["resolved"] * 3

CATEGORY_COLORS = {
    "pothole":     (55, 65, 81),      # slate
    "garbage":     (34, 139, 34),     # green
    "streetlight": (250, 204, 21),    # amber
    "road_damage": (120, 53, 15),     # brown
}

# Small offsets (~in meters) used to build 3 tight clusters
CLUSTER_OFFSETS = [
    (0.00020, 0.00025), (-0.00018, 0.00030),
    (0.00015, -0.00022), (-0.00025, -0.00020),
    (0.00005, 0.00030),
]


def _placeholder_image(category: str, idx: int) -> bytes:
    """Generate a colored placeholder JPG with category text overlay."""
    color = CATEGORY_COLORS.get(category, (100, 100, 100))
    img = Image.new("RGB", (640, 480), color=color)
    draw = ImageDraw.Draw(img)
    # Add some noise so each image gets a distinct hash
    rng = random.Random(f"{category}-{idx}")
    for _ in range(400):
        x = rng.randint(0, 639)
        y = rng.randint(0, 479)
        r = rng.randint(2, 18)
        c = tuple(max(0, min(255, ch + rng.randint(-40, 40))) for ch in color)
        draw.ellipse((x - r, y - r, x + r, y + r), fill=c)
    try:
        font = ImageFont.load_default()
    except Exception:  # pragma: no cover
        font = None
    draw.text((20, 20), f"DEMO • {category} #{idx}", fill=(255, 255, 255), font=font)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def _random_offset(rng: random.Random, radius_deg: float = 0.01) -> tuple[float, float]:
    return rng.uniform(-radius_deg, radius_deg), rng.uniform(-radius_deg, radius_deg)


def seed() -> None:
    init_db()
    rng = random.Random(42)  # deterministic
    center_lat = settings.DEMO_CENTER_LAT
    center_lng = settings.DEMO_CENTER_LNG

    settings.upload_path.mkdir(parents=True, exist_ok=True)

    db = SessionLocal()
    try:
        # Wipe existing rows so re-seeding is idempotent
        db.query(Report).delete()
        db.commit()

        # ---- 3 tight clusters (up-front so they always appear) ----
        cluster_centers: list[tuple[float, float, str]] = []
        for i in range(3):
            dlat, dlng = _random_offset(rng, 0.008)
            cluster_centers.append((center_lat + dlat, center_lng + dlng,
                                    ["pothole", "garbage", "pothole"][i]))

        created_records: list[Report] = []
        idx = 0
        # 3 clusters × ~4-5 reports = 13 reports
        for c_lat, c_lng, c_cat in cluster_centers:
            n = rng.choice([4, 5])
            for _ in range(n):
                d_lat, d_lng = CLUSTER_OFFSETS[rng.randint(0, len(CLUSTER_OFFSETS) - 1)]
                lat = c_lat + d_lat * rng.uniform(0.5, 1.5)
                lng = c_lng + d_lng * rng.uniform(0.5, 1.5)
                created_records.append(_build_report(idx, c_cat, lat, lng, rng))
                idx += 1

        # ---- Remaining scattered reports to reach 24 ----
        while idx < 24:
            cat = rng.choice(CATEGORY_MIX)
            dlat, dlng = _random_offset(rng, 0.012)
            created_records.append(
                _build_report(idx, cat, center_lat + dlat, center_lng + dlng, rng)
            )
            idx += 1

        db.add_all(created_records)
        db.commit()

        log.info("Seeded %d reports around (%.4f, %.4f)",
                 len(created_records), center_lat, center_lng)
    finally:
        db.close()


def _build_report(idx: int, category: str, lat: float, lng: float, rng: random.Random) -> Report:
    # Deterministic image + hash
    img_bytes = _placeholder_image(category, idx)
    filename = f"seed_{idx:02d}_{uuid.uuid4().hex[:8]}.jpg"
    out_path = settings.upload_path / filename
    out_path.write_bytes(img_bytes)

    phash = str(imagehash.phash(Image.open(io.BytesIO(img_bytes)), hash_size=16))

    confidence = round(rng.uniform(0.68, 0.96), 3)
    area_pct = round(rng.uniform(4.0, 22.0), 2)
    sev = compute_severity(category, confidence, area_pct)

    status = rng.choice(STATUS_MIX)
    created_at = datetime.now(timezone.utc) - timedelta(
        days=rng.randint(0, 13), hours=rng.randint(0, 23), minutes=rng.randint(0, 59)
    )
    confirmations = rng.choice([0, 0, 0, 1, 1, 2, 3, 4])

    return Report(
        image_path=f"uploads/{filename}",
        image_hash=phash,
        category=category,
        confidence=confidence,
        severity=sev.level,
        severity_reason=sev.reason,
        description=None,
        lat=lat,
        lng=lng,
        status=status,
        department=department_for(category),
        confirmations=confirmations,
        created_at=created_at,
        updated_at=created_at,
    )


if __name__ == "__main__":
    seed()
