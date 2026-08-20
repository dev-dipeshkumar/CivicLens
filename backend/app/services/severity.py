"""
Deterministic + explainable severity engine.

Computes a numeric score from category, bounding-box area coverage and
detection confidence, then buckets it into a severity level. Also emits
a human-readable `severity_reason` that the UI can display verbatim.
"""

from __future__ import annotations

from dataclasses import dataclass

BASE_WEIGHT: dict[str, int] = {
    "pothole": 3,
    "streetlight": 3,
    "road_damage": 3,
    "garbage": 2,
    "uncertain": 1,
}

DEPARTMENT_MAP: dict[str, str] = {
    "pothole": "roads",
    "road_damage": "roads",
    "garbage": "sanitation",
    "streetlight": "lighting",
    "uncertain": "general",
}

CATEGORY_LABEL: dict[str, str] = {
    "pothole": "Pothole",
    "garbage": "Garbage / Litter",
    "streetlight": "Broken Streetlight",
    "road_damage": "Road Damage",
    "uncertain": "Uncertain issue",
}


@dataclass(frozen=True)
class SeverityResult:
    level: str            # low | medium | high | critical
    score: int
    reason: str


def _area_tier(area_pct: float) -> tuple[int, str]:
    """Convert bounding-box coverage % into a 0-3 tier."""
    if area_pct < 6:
        return 0, "small area"
    if area_pct < 12:
        return 1, "moderate area"
    if area_pct < 18:
        return 2, "large area"
    return 3, "very large area"


def _bucket(score: int) -> str:
    if score >= 8:
        return "critical"
    if score >= 6:
        return "high"
    if score >= 4:
        return "medium"
    return "low"


def compute_severity(category: str, confidence: float, area_pct: float) -> SeverityResult:
    """
    Return an explainable severity for a detection.

    - base_weight[category]
    - + area tier from bbox coverage
    - + confidence bonus if > 0.85
    """
    base = BASE_WEIGHT.get(category, 1)
    area_add, area_word = _area_tier(area_pct)
    conf_bonus = 1 if confidence > 0.85 else 0
    score = base + area_add + conf_bonus
    level = _bucket(score)

    label = CATEGORY_LABEL.get(category, category.title())
    reason = (
        f"{label} detected covering ~{area_pct:.0f}% of frame "
        f"({area_word}), model confidence {confidence * 100:.0f}%."
    )
    if conf_bonus:
        reason += " High-confidence detection."
    return SeverityResult(level=level, score=score, reason=reason)


def department_for(category: str) -> str:
    return DEPARTMENT_MAP.get(category, "general")
