"""
Detection service with a hard 3-mode fallback chain.

    roboflow  ->  local (YOLOv8)  ->  mock

The mock is DETERMINISTIC (seeded from the image's perceptual hash) so
repeated uploads of the same image return the same result — great for demos.
Every fallback is logged loudly so it's obvious what happened.
"""

from __future__ import annotations

import hashlib
import io
import logging
import random
from dataclasses import dataclass
from typing import Optional

import httpx
from PIL import Image

from ..config import settings

logger = logging.getLogger("civiclens.detection")

# Roboflow raw class -> our normalized category
CLASS_MAP: dict[str, str] = {
    "pothole": "pothole",
    "potholes": "pothole",
    "hole": "pothole",
    "garbage": "garbage",
    "trash": "garbage",
    "litter": "garbage",
    "waste": "garbage",
    "streetlight": "streetlight",
    "street_light": "streetlight",
    "broken_light": "streetlight",
    "lamp": "streetlight",
    "road_damage": "road_damage",
    "crack": "road_damage",
    "cracks": "road_damage",
}

ALL_CATEGORIES = ("pothole", "garbage", "streetlight", "road_damage")


@dataclass
class Detection:
    """The single top prediction returned to callers."""
    category: str          # normalized category
    confidence: float      # 0..1
    area_pct: float        # bbox area / image area * 100
    source: str            # "roboflow" | "local" | "mock"
    raw_class: str = ""    # for debugging


def _normalize_class(raw: str) -> str:
    key = raw.lower().strip().replace(" ", "_")
    return CLASS_MAP.get(key, "uncertain")


# --------------------------------------------------------------------------- #
# Mock detector — deterministic, always succeeds                              #
# --------------------------------------------------------------------------- #

def _mock_detect(image_bytes: bytes) -> Detection:
    """
    Deterministic pseudo-random detection.

    Cycles: 50% pothole / 35% garbage / 15% streetlight
    bbox area 4–22%, confidence 0.72–0.96.
    """
    digest = hashlib.sha256(image_bytes).digest()
    seed = int.from_bytes(digest[:8], "big")
    rng = random.Random(seed)

    r = rng.random()
    if r < 0.50:
        category = "pothole"
    elif r < 0.85:
        category = "garbage"
    else:
        category = "streetlight"

    confidence = round(rng.uniform(0.72, 0.96), 3)
    area_pct = round(rng.uniform(4.0, 22.0), 2)
    logger.info("MOCK detection -> %s conf=%.2f area=%.1f%%", category, confidence, area_pct)
    return Detection(category=category, confidence=confidence, area_pct=area_pct,
                     source="mock", raw_class=category)


# --------------------------------------------------------------------------- #
# Local YOLOv8 detector — only if ultralytics is importable                   #
# --------------------------------------------------------------------------- #

_yolo_model = None


def _try_local(image_bytes: bytes) -> Optional[Detection]:
    global _yolo_model
    try:
        from ultralytics import YOLO  # type: ignore
    except Exception as e:  # pragma: no cover
        logger.info("Local YOLO unavailable (%s) — falling through", e.__class__.__name__)
        return None

    try:
        if _yolo_model is None:
            _yolo_model = YOLO("yolov8n.pt")
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        result = _yolo_model.predict(img, verbose=False)[0]
        if not len(result.boxes):
            return None
        # take the highest-confidence box
        boxes = result.boxes
        idx = int(boxes.conf.argmax().item())
        cls_id = int(boxes.cls[idx].item())
        conf = float(boxes.conf[idx].item())
        x1, y1, x2, y2 = [float(v) for v in boxes.xyxy[idx].tolist()]
        img_area = img.width * img.height
        area_pct = max(0.0, ((x2 - x1) * (y2 - y1) / img_area) * 100.0)
        raw = _yolo_model.names.get(cls_id, str(cls_id))
        category = _normalize_class(raw)
        logger.info("LOCAL YOLO -> %s (%s) conf=%.2f", category, raw, conf)
        return Detection(category=category, confidence=conf, area_pct=area_pct,
                         source="local", raw_class=raw)
    except Exception as e:  # pragma: no cover
        logger.warning("Local YOLO failed: %s", e)
        return None


# --------------------------------------------------------------------------- #
# Roboflow hosted inference                                                   #
# --------------------------------------------------------------------------- #

def _try_roboflow(image_bytes: bytes) -> Optional[Detection]:
    if not settings.ROBOFLOW_API_KEY or not settings.ROBOFLOW_MODEL_URL:
        logger.info("Roboflow not configured — skipping")
        return None
    try:
        import base64
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        url = f"{settings.ROBOFLOW_MODEL_URL}?api_key={settings.ROBOFLOW_API_KEY}"
        with httpx.Client(timeout=15.0) as client:
            resp = client.post(
                url, data=b64,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            resp.raise_for_status()
            data = resp.json()

        preds = data.get("predictions") or []
        if not preds:
            logger.info("Roboflow returned 0 predictions")
            return None
        preds.sort(key=lambda p: p.get("confidence", 0.0), reverse=True)
        top = preds[0]
        raw_class = str(top.get("class", ""))
        confidence = float(top.get("confidence", 0.0))
        w = float(top.get("width", 0.0))
        h = float(top.get("height", 0.0))
        img_w = float(data.get("image", {}).get("width", img.width))
        img_h = float(data.get("image", {}).get("height", img.height))
        area_pct = (w * h) / max(img_w * img_h, 1.0) * 100.0
        category = _normalize_class(raw_class)
        logger.info("ROBOFLOW -> %s (%s) conf=%.2f", category, raw_class, confidence)
        return Detection(category=category, confidence=confidence, area_pct=area_pct,
                         source="roboflow", raw_class=raw_class)
    except Exception as e:
        logger.warning("Roboflow inference failed: %s — falling through", e)
        return None


# --------------------------------------------------------------------------- #
# Public entry point                                                          #
# --------------------------------------------------------------------------- #

def detect(image_bytes: bytes) -> Detection:
    """Run detection using the configured mode with automatic fallbacks."""
    mode = settings.AI_MODE.lower().strip()

    if mode == "roboflow":
        r = _try_roboflow(image_bytes) or _try_local(image_bytes)
        if r is not None:
            return r
        return _mock_detect(image_bytes)

    if mode == "local":
        r = _try_local(image_bytes)
        if r is not None:
            return r
        return _mock_detect(image_bytes)

    # default / "mock"
    return _mock_detect(image_bytes)
