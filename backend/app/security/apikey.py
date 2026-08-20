"""
X-API-Key dependency for authority / analytics routes.

The citizen upload endpoint is intentionally *public* (it's the whole point of
the product); everything a dashboard consumes requires the key.
"""

from fastapi import Header, HTTPException, status

from ..config import settings


async def require_api_key(x_api_key: str | None = Header(default=None, alias="X-API-Key")) -> None:
    """Reject the request if the header is missing or wrong."""
    if not x_api_key or x_api_key != settings.API_KEY:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Missing or invalid X-API-Key header",
        )
