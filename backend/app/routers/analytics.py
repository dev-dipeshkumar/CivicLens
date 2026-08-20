"""
Analytics endpoints — all aggregated in SQL, all guarded by X-API-Key.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Report
from ..schemas import AnalyticsSummary, HeatmapResponse, HeatPoint
from ..security.apikey import require_api_key

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def _bucket(rows: list[tuple[str, int]]) -> dict[str, int]:
    return {k: int(v) for k, v in rows}


@router.get("/summary", response_model=AnalyticsSummary, dependencies=[Depends(require_api_key)])
async def summary(db: Session = Depends(get_db)) -> AnalyticsSummary:
    base = select(Report).where(Report.duplicate_of.is_(None)).subquery()

    total = db.execute(select(func.count()).select_from(base)).scalar_one()

    by_status = _bucket(db.execute(
        select(base.c.status, func.count()).group_by(base.c.status)
    ).all())

    by_severity = _bucket(db.execute(
        select(base.c.severity, func.count()).group_by(base.c.severity)
    ).all())

    by_category = _bucket(db.execute(
        select(base.c.category, func.count()).group_by(base.c.category)
    ).all())

    by_department = _bucket(db.execute(
        select(base.c.department, func.count()).group_by(base.c.department)
    ).all())

    today = datetime.now(timezone.utc).date()
    reports_today = db.execute(
        select(func.count()).select_from(base).where(func.date(base.c.created_at) == today)
    ).scalar_one()

    critical_open = db.execute(
        select(func.count()).select_from(base)
        .where(base.c.severity == "critical")
        .where(base.c.status != "resolved")
    ).scalar_one()

    # 14-day trend
    start = today - timedelta(days=13)
    trend_rows = db.execute(
        select(func.date(base.c.created_at), func.count())
        .where(func.date(base.c.created_at) >= start)
        .group_by(func.date(base.c.created_at))
    ).all()
    trend_map = {str(d): int(c) for d, c in trend_rows}
    trend_14d = [
        {"date": str(start + timedelta(days=i)),
         "count": trend_map.get(str(start + timedelta(days=i)), 0)}
        for i in range(14)
    ]

    return AnalyticsSummary(
        total=int(total),
        by_status=by_status,
        by_severity=by_severity,
        by_category=by_category,
        by_department=by_department,
        reports_today=int(reports_today),
        critical_open=int(critical_open),
        trend_14d=trend_14d,
    )


@router.get("/heatmap", response_model=HeatmapResponse, dependencies=[Depends(require_api_key)])
async def heatmap(db: Session = Depends(get_db)) -> HeatmapResponse:
    """
    Aggregated heat points. Weight = 1 + confirmations, and open critical
    issues get a further boost so hotspots stand out.
    """
    weight_expr = (
        1
        + func.coalesce(Report.confirmations, 0)
        + case((Report.severity == "critical", 2), else_=0)
        + case((Report.severity == "high", 1), else_=0)
    )
    rows = db.execute(
        select(Report.lat, Report.lng, weight_expr)
        .where(Report.duplicate_of.is_(None))
        .where(Report.status != "resolved")
    ).all()
    return HeatmapResponse(
        points=[HeatPoint(lat=float(lat), lng=float(lng), weight=float(w)) for lat, lng, w in rows]
    )
