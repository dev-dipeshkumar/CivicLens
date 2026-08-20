"""
Upload validation & sanitization.

Rules:
* Magic-byte sniff (NOT extension) for JPEG / PNG / WebP.
* Enforce max size (default 8 MB).
* Re-encode via Pillow — strips EXIF/GPS metadata (privacy + kills known
  image-parsing exploits) and normalizes format to JPEG.
* Persist with a UUID filename so nothing user-controlled hits the filesystem.
"""

from __future__ import annotations

import io
import uuid
from pathlib import Path
from typing import Tuple

from fastapi import HTTPException, UploadFile, status
from PIL import Image, UnidentifiedImageError

from ..config import settings

ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}
MAGIC_SIGNATURES: tuple[tuple[bytes, str], ...] = (
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"RIFF", "image/webp"),  # WebP starts with RIFF...WEBP
)


def _sniff_mime(head: bytes) -> str | None:
    for sig, mime in MAGIC_SIGNATURES:
        if head.startswith(sig):
            if mime == "image/webp" and b"WEBP" not in head[:16]:
                continue
            return mime
    return None


async def read_and_validate(upload: UploadFile) -> bytes:
    """Read the UploadFile, enforce size + magic bytes, return raw bytes."""
    raw = await upload.read()
    if len(raw) == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Empty upload")
    if len(raw) > settings.MAX_UPLOAD_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"File too large (max {settings.MAX_UPLOAD_BYTES // (1024*1024)} MB)",
        )

    mime = _sniff_mime(raw[:16])
    if mime is None or mime not in ALLOWED_MIME:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "Only JPEG, PNG or WebP images are allowed",
        )
    return raw


def sanitize_and_save(raw: bytes) -> Tuple[str, bytes]:
    """
    Re-encode the image to strip metadata, save with a UUID filename.

    Returns (relative_path, sanitized_bytes). The sanitized bytes are used
    downstream for hashing + detection so we hash the *cleaned* image.
    """
    try:
        img = Image.open(io.BytesIO(raw))
        img.verify()  # structural sanity check
        img = Image.open(io.BytesIO(raw)).convert("RGB")  # reopen after verify
    except (UnidentifiedImageError, Exception) as e:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"Invalid image data: {e.__class__.__name__}"
        )

    # Cap max dimension so mock-uploaded 20MP shots don't nuke inference.
    max_dim = 2048
    if max(img.width, img.height) > max_dim:
        img.thumbnail((max_dim, max_dim), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=88, optimize=True)
    clean = buf.getvalue()

    filename = f"{uuid.uuid4().hex}.jpg"
    path = settings.upload_path / filename
    path.write_bytes(clean)
    return f"uploads/{filename}", clean
