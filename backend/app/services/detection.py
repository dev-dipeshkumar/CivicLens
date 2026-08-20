"""
Detection service with a hard 3-mode fallback chain.

    roboflow  ->  local (YOLOv8)  ->  mock

Roboflow mode supports MULTIPLE hosted models, each mapped to one of our
normalized categories. This is important because most public Roboflow
Universe models are single-class (pothole-only, garbage-only, ...), so we
call several in parallel and keep the strongest detection.

Configure with either:

  # Single model (legacy)
  ROBOFLOW_MODEL_URL=https://serverless.roboflow.com/pothole-detection-yolov8/1

  # Multi-model (recommended). Format: <category>:<model_slug/version>, comma separated.
  ROBOFLOW_MODELS=pothole:pothole-detection-yolov8/1,garbage:garbage_detection-wvzwv/9

The mock is DETERMINISTIC (seeded from the image's SHA-256) so repeated
uploads of the same image return the same result — great for demos.
Every fallback is logged loudly so it's obvious what happened.
"""

from __future__ import annotations

import base64
import concurrent.futures
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

ROBOFLOW_BASE = "https://serverless.roboflow.com"

# Raw model class name -> our normalized category. Public Roboflow models
# have wildly different class names for the same concept; we normalize.
CLASS_MAP: dict[str, str] = {
    "pothole": "pothole", "potholes": "pothole", "hole": "pothole",
    "pothole_-_v1_raw": "pothole", "pothole - v1 raw": "pothole",
    "garbage": "garbage", "trash": "garbage", "litter": "garbage",
    "waste": "garbage", "plastic": "garbage", "paper": "garbage",
    "streetlight": "streetlight", "street_light": "streetlight",
    "broken_light": "streetlight", "lamp": "streetlight",
    "road_damage": "road_damage", "crack": "road_damage", "cracks": "road_damage",
}


@dataclass
class Detection:
    """The single top prediction returned to callers."""
    category: str          # normalized: pothole | garbage | streetlight | road_damage | uncertain
    confidence: float      # 0..1
    area_pct: float        # bbox area / image area * 100
    source: str            # "roboflow:<slug>" | "local" | "mock"
    raw_class: str = ""


def _normalize_class(raw: str) -> str:
    key = raw.lower().strip().replace(" ", "_")
    return CLASS_MAP.get(key, "uncertain")


# --------------------------------------------------------------------------- #
# Mock detector — deterministic, always succeeds                              #
# --------------------------------------------------------------------------- #

def _mock_detect(image_bytes: bytes) -> Detection:
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
# Roboflow hosted inference (multi-model)                                     #
# --------------------------------------------------------------------------- #

def _parse_roboflow_models() -> list[tuple[str, str]]:
    """
    Return [(category, model_url), ...].

    Supports either:
      * ROBOFLOW_MODELS="pothole:slug/1,garbage:slug/9" (preferred)
      * ROBOFLOW_MODEL_URL="https://.../slug/1"        (legacy single model,
                                                        category inferred from
                                                        model classes)
    """
    out: list[tuple[str, str]] = []
    multi = getattr(settings, "ROBOFLOW_MODELS", "") or ""
    if multi.strip():
        for entry in multi.split(","):
            entry = entry.strip()
            if not entry or ":" not in entry:
                continue
            category, slug = entry.split(":", 1)
            category = category.strip().lower()
            slug = slug.strip()
            # If the user passed a bare "slug/version", prepend the serverless base.
            url = slug if slug.startswith("http") else f"{ROBOFLOW_BASE}/{slug}"
            out.append((category, url))
    elif settings.ROBOFLOW_MODEL_URL:
        # legacy: category inferred from returned class names
        out.append(("", settings.ROBOFLOW_MODEL_URL))
    return out


def _call_roboflow_model(
    client: httpx.Client, category_hint: str, model_url: str, b64: str
) -> Optional[Detection]:
    """POST a single image to one Roboflow endpoint; return top prediction or None."""
    url = f"{model_url}?api_key={settings.ROBOFLOW_API_KEY}"
    slug = model_url.rstrip("/").rsplit("/", 2)[-2] if "/" in model_url else model_url
    try:
        resp = client.post(
            url, data=b64,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.warning("Roboflow model %s failed: %s", slug, e)
        return None

    preds = data.get("predictions") or []
    if not preds:
        return None
    preds.sort(key=lambda p: p.get("confidence", 0.0), reverse=True)
    top = preds[0]
    raw_class = str(top.get("class", ""))
    confidence = float(top.get("confidence", 0.0))
    w = float(top.get("width", 0.0))
    h = float(top.get("height", 0.0))
    img_w = float(data.get("image", {}).get("width", 1.0))
    img_h = float(data.get("image", {}).get("height", 1.0))
    area_pct = (w * h) / max(img_w * img_h, 1.0) * 100.0
    # Prefer the explicit category hint from ROBOFLOW_MODELS; fall back to
    # normalization of the raw class name (used by ROBOFLOW_MODEL_URL legacy path).
    category = category_hint or _normalize_class(raw_class)
    logger.info("ROBOFLOW %s -> %s (%s) conf=%.2f area=%.1f%%",
                slug, category, raw_class, confidence, area_pct)
    return Detection(
        category=category, confidence=confidence, area_pct=area_pct,
        source=f"roboflow:{slug}", raw_class=raw_class,
    )


def _try_roboflow(image_bytes: bytes) -> Optional[Detection]:
    """Run all configured Roboflow models in parallel; return the best hit."""
    if not settings.ROBOFLOW_API_KEY:
        logger.info("Roboflow API key not set — skipping")
        return None
    models = _parse_roboflow_models()
    if not models:
        logger.info("No Roboflow models configured — skipping")
        return None

    # Encode once, reuse across every model call.
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")

    results: list[Detection] = []
    with httpx.Client(timeout=15.0) as client:
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(4, len(models))) as pool:
            futures = [
                pool.submit(_call_roboflow_model, client, cat, url, b64)
                for cat, url in models
            ]
            for f in concurrent.futures.as_completed(futures):
                r = f.result()
                if r is not None:
                    results.append(r)

    if not results:
        return None
    # Highest-confidence detection wins.
    results.sort(key=lambda d: d.confidence, reverse=True)
    return results[0]


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
