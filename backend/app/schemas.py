"""
Pydantic v2 schemas for request/response validation.

We keep response models flat and JSON-friendly so the frontend can render
them without further transformation.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

# Enumerations used across the API
Category = Literal["pothole", "garbage", "streetlight", "road_damage", "uncertain"]
Severity = Literal["low", "medium", "high", "critical"]
Status = Literal["new", "assigned", "in_progress", "resolved"]
Department = Literal["roads", "sanitation", "lighting", "general"]


# ---------- Report responses ----------

class ReportOut(BaseModel):
    """Full report returned by list/detail endpoints."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    image_path: str
    image_hash: str
    category: Category
    confidence: float
    severity: Severity
    severity_reason: str
    description: Optional[str] = None
    lat: float
    lng: float
    status: Status
    department: Department
    confirmations: int
    duplicate_of: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ReportCreateResult(BaseModel):
    """
    Response for POST /api/reports.

    Wraps the persisted report and adds a `duplicate` flag so the citizen UI
    can render the "others reported this issue nearby" corroboration banner.
    """

    report: ReportOut
    duplicate: bool = False
    duplicate_distance_m: Optional[float] = None
    confirmations: int = 0
    message: str = "Report accepted"


# ---------- Status updates ----------

class StatusUpdate(BaseModel):
    status: Status


# ---------- Analytics ----------

class AnalyticsSummary(BaseModel):
    total: int
    by_status: dict[str, int]
    by_severity: dict[str, int]
    by_category: dict[str, int]
    by_department: dict[str, int]
    reports_today: int
    critical_open: int
    trend_14d: list[dict]  # [{date: str, count: int}]


class HeatPoint(BaseModel):
    lat: float
    lng: float
    weight: float


class HeatmapResponse(BaseModel):
    points: list[HeatPoint]


# ---------- Query params ----------

class ReportQuery(BaseModel):
    status: Optional[Status] = None
    category: Optional[Category] = None
    severity: Optional[Severity] = None
    limit: int = Field(default=100, ge=1, le=500)
    offset: int = Field(default=0, ge=0)


# ---------- Multipart form validation ----------

class ReportCreateForm(BaseModel):
    """Validates the non-file fields of the multipart upload."""

    lat: float
    lng: float
    description: Optional[str] = Field(default=None, max_length=500)

    @field_validator("lat")
    @classmethod
    def _lat_range(cls, v: float) -> float:
        if not -90.0 <= v <= 90.0:
            raise ValueError("lat must be in [-90, 90]")
        return v

    @field_validator("lng")
    @classmethod
    def _lng_range(cls, v: float) -> float:
        if not -180.0 <= v <= 180.0:
            raise ValueError("lng must be in [-180, 180]")
        return v
