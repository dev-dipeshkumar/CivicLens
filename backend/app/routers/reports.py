"""
Report endpoints — create (public, rate-limited), list/detail/patch (authority).

NOTE: We intentionally do NOT use `from __future__ import annotations` here —
FastAPI must resolve UploadFile at runtime to build the multipart form parser.
"""

import asyncio
import logging
from typing import Optional

from fastapi import (
    APIRouter, Depends, File, Form, HTTPException, Path, Query, Request,
    UploadFile, status,
)
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Report
from ..schemas import (
    Category, ReportCreateForm, ReportCreateResult, ReportOut, Severity, Status,
    StatusUpdate,
)
from ..security.apikey import require_api_key
from ..security.upload import read_and_validate, sanitize_and_save
from ..services.dedupe import compute_phash, find_duplicate
from ..services.detection import detect
from ..services.severity import compute_severity, department_for

log = logging.getLogger("civiclens.reports")

limiter = Limiter(key_func=get_remote_address)

router = APIRouter(prefix="/api/reports", tags=["reports"])


VALID_TRANSITIONS: dict[str, set[str]] = {
    "new": {"assigned", "in_progress", "resolved"},
    "assigned": {"in_progress", "resolved", "new"},
    "in_progress": {"resolved", "assigned"},
    "resolved": {"in_progress"},  # allow reopen
}


# --------------------------------------------------------------------------- #
# CREATE — public, rate-limited                                               #
# --------------------------------------------------------------------------- #

@router.post("", response_model=ReportCreateResult, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def create_report(
    request: Request,
    image: UploadFile = File(...),
    lat: float = Form(...),
    lng: float = Form(...),
    description: Optional[str] = Form(default=None),
    db: Session = Depends(get_db),
) -> ReportCreateResult:
    """
    Full ingestion pipeline:
      validate upload -> sanitize (strip EXIF) -> AI detect -> severity ->
      duplicate check -> persist (or corroborate parent).
    """
    form = ReportCreateForm(lat=lat, lng=lng, description=description)

    raw = await read_and_validate(image)
    rel_path, clean = sanitize_and_save(raw)

    loop = asyncio.get_running_loop()
    # CPU-bound work goes to the default threadpool to keep the event loop free.
    detection = await loop.run_in_executor(None, detect, clean)
    phash_hex = await loop.run_in_executor(None, compute_phash, clean)

    # Handle "uncertain" detections gracefully but still accept them.
    category = detection.category if detection.confidence >= 0.45 else "uncertain"

    sev = compute_severity(category, detection.confidence, detection.area_pct)

    dup = find_duplicate(db, phash_hex, form.lat, form.lng)
    if dup is not None:
        dup.parent.confirmations = (dup.parent.confirmations or 0) + 1
        # Also persist the child linked to the parent for audit/history.
        child = Report(
            image_path=rel_path,
            image_hash=phash_hex,
            category=category,
            confidence=detection.confidence,
            severity=sev.level,
            severity_reason=sev.reason,
            description=form.description,
            lat=form.lat,
            lng=form.lng,
            status="new",
            department=department_for(category),
            confirmations=0,
            duplicate_of=dup.parent.id,
        )
        db.add(child)
        db.commit()
        db.refresh(dup.parent)
        log.info(
            "DEDUPE hit: child %s corroborates parent %s (%.0fm, phash=%d)",
            child.id, dup.parent.id, dup.distance_m, dup.phash_distance,
        )
        return ReportCreateResult(
            report=ReportOut.model_validate(dup.parent),
            duplicate=True,
            duplicate_distance_m=round(dup.distance_m, 1),
            confirmations=dup.parent.confirmations,
            message=(
                f"{dup.parent.confirmations} other citizen"
                f"{'s have' if dup.parent.confirmations != 1 else ' has'} "
                f"reported this nearby — your report strengthens it."
            ),
        )

    report = Report(
        image_path=rel_path,
        image_hash=phash_hex,
        category=category,
        confidence=detection.confidence,
        severity=sev.level,
        severity_reason=sev.reason,
        description=form.description,
        lat=form.lat,
        lng=form.lng,
        status="new",
        department=department_for(category),
        confirmations=0,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    log.info("NEW report %s cat=%s sev=%s via=%s", report.id, category, sev.level, detection.source)

    return ReportCreateResult(
        report=ReportOut.model_validate(report),
        duplicate=False,
        confirmations=0,
        message="Report accepted. Thank you for making your city better.",
    )


# --------------------------------------------------------------------------- #
# LIST / DETAIL — authority                                                   #
# --------------------------------------------------------------------------- #

@router.get("", response_model=list[ReportOut], dependencies=[Depends(require_api_key)])
async def list_reports(
    status_: Optional[Status] = Query(default=None, alias="status"),
    category: Optional[Category] = Query(default=None),
    severity: Optional[Severity] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    include_duplicates: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> list[ReportOut]:
    stmt = select(Report)
    if not include_duplicates:
        stmt = stmt.where(Report.duplicate_of.is_(None))
    if status_:
        stmt = stmt.where(Report.status == status_)
    if category:
        stmt = stmt.where(Report.category == category)
    if severity:
        stmt = stmt.where(Report.severity == severity)
    stmt = stmt.order_by(Report.created_at.desc()).limit(limit).offset(offset)
    rows = db.execute(stmt).scalars().all()
    return [ReportOut.model_validate(r) for r in rows]


@router.get("/{report_id}", response_model=ReportOut, dependencies=[Depends(require_api_key)])
async def get_report(report_id: str = Path(...), db: Session = Depends(get_db)) -> ReportOut:
    row = db.get(Report, report_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")
    return ReportOut.model_validate(row)


@router.patch(
    "/{report_id}/status", response_model=ReportOut, dependencies=[Depends(require_api_key)]
)
async def patch_status(
    body: StatusUpdate,
    report_id: str = Path(...),
    db: Session = Depends(get_db),
) -> ReportOut:
    row = db.get(Report, report_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")

    allowed = VALID_TRANSITIONS.get(row.status, set())
    if body.status not in allowed and body.status != row.status:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot transition from '{row.status}' to '{body.status}'",
        )
    row.status = body.status
    db.commit()
    db.refresh(row)
    log.info("STATUS %s -> %s", row.id, row.status)
    return ReportOut.model_validate(row)
