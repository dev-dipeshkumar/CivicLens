"""
SQLAlchemy engine, session factory, and Base declarative class.

Uses SQLite for zero-setup local demo. `check_same_thread=False` is required
because FastAPI runs multiple threads.
"""

from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings

SQLITE_URL = f"sqlite:///{settings.DB_PATH}"

engine = create_engine(
    SQLITE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
    future=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""
    pass


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a scoped DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all tables. Safe to call repeatedly."""
    # Import models so they register with Base.metadata before create_all.
    from . import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
