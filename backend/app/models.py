"""
SQLAlchemy ORM models.

A single `Report` table is enough for the prototype; duplicates are represented
by a self-referential FK (`duplicate_of`) and a `confirmations` counter on the
canonical (parent) row.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class Report(Base):
    """A citizen-submitted civic issue report."""

    __tablename__ = "reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)

    # --- Media ---
    image_path: Mapped[str] = mapped_column(String(512), nullable=False)
    image_hash: Mapped[str] = mapped_column(String(64), index=True, nullable=False)

    # --- AI output ---
    category: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    severity: Mapped[str] = mapped_column(String(16), index=True, nullable=False)
    severity_reason: Mapped[str] = mapped_column(String(256), nullable=False, default="")

    # --- User content ---
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # --- Location ---
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)

    # --- Workflow ---
    status: Mapped[str] = mapped_column(
        String(16), index=True, default="new", nullable=False
    )
    department: Mapped[str] = mapped_column(String(32), index=True, nullable=False)

    # --- Duplicate bookkeeping ---
    confirmations: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    duplicate_of: Mapped[Optional[str]] = mapped_column(
        ForeignKey("reports.id", ondelete="SET NULL"), nullable=True, index=True
    )
    parent = relationship("Report", remote_side="Report.id", uselist=False)

    # --- Timestamps ---
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
