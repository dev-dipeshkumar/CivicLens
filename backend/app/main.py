"""
FastAPI application entry point.

Wires CORS, structured logging, request IDs, global error handler,
rate limiter (slowapi) and static file serving for uploaded images.
"""

from __future__ import annotations

import logging
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import settings
from .database import init_db
from .routers import analytics, reports
from .routers.reports import limiter

# --------------------------------------------------------------------------- #
# Logging (structured-ish: level | request_id | logger | message)             #
# --------------------------------------------------------------------------- #
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-5s | %(name)s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("civiclens")


app = FastAPI(
    title="CivicLens AI",
    version="1.0.0",
    description="Turn citizen photos into AI-detected, deduplicated municipal tasks.",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS: locked to the exact origin from env.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)


# --------------------------------------------------------------------------- #
# Request-ID + access logging middleware                                      #
# --------------------------------------------------------------------------- #

@app.middleware("http")
async def request_context(request: Request, call_next):
    req_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        dur = (time.perf_counter() - start) * 1000
        log.exception("[%s] %s %s failed after %.1fms", req_id, request.method, request.url.path, dur)
        raise
    dur = (time.perf_counter() - start) * 1000
    response.headers["X-Request-ID"] = req_id
    log.info(
        "[%s] %s %s -> %d (%.1fms)",
        req_id, request.method, request.url.path, response.status_code, dur,
    )
    return response


# --------------------------------------------------------------------------- #
# Clean JSON error handlers (never leak stack traces)                         #
# --------------------------------------------------------------------------- #

@app.exception_handler(StarletteHTTPException)
async def http_exc_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail, "status": exc.status_code},
    )


@app.exception_handler(RequestValidationError)
async def validation_exc_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"error": "Validation failed", "details": exc.errors(), "status": 422},
    )


@app.exception_handler(Exception)
async def unhandled_exc_handler(request: Request, exc: Exception):
    log.exception("Unhandled: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "status": 500},
    )


# --------------------------------------------------------------------------- #
# Startup                                                                     #
# --------------------------------------------------------------------------- #

@app.on_event("startup")
def on_startup() -> None:
    init_db()
    Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
    log.info("CivicLens AI ready — AI_MODE=%s frontend=%s",
             settings.AI_MODE, settings.FRONTEND_ORIGIN)


# --------------------------------------------------------------------------- #
# Routes                                                                      #
# --------------------------------------------------------------------------- #

app.include_router(reports.router)
app.include_router(analytics.router)

# Serve uploaded images
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")


@app.get("/health", tags=["meta"])
async def health() -> dict:
    return {
        "status": "ok",
        "ai_mode": settings.AI_MODE,
        "version": app.version,
    }
