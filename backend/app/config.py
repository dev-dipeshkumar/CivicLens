"""
Application configuration.

Loads environment variables (via pydantic-settings) into a strongly typed
Settings object that is imported everywhere else in the app.
"""

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, populated from environment / .env file."""

    # --- Networking ---
    FRONTEND_ORIGIN: str = Field(default="http://localhost:5173")

    # --- Security ---
    API_KEY: str = Field(default="civiclens-demo-key")

    # --- AI ---
    AI_MODE: str = Field(default="mock")  # roboflow | local | mock
    ROBOFLOW_API_KEY: str = Field(default="")
    # Legacy single-model config (still supported)
    ROBOFLOW_MODEL_URL: str = Field(default="")
    # Preferred: comma-separated "<category>:<slug/version>" entries.
    # Example: "pothole:pothole-detection-yolov8/1,garbage:garbage_detection-wvzwv/9"
    ROBOFLOW_MODELS: str = Field(default="")

    # --- Demo geography ---
    DEMO_CENTER_LAT: float = Field(default=26.9124)   # Jaipur by default
    DEMO_CENTER_LNG: float = Field(default=75.7873)

    # --- Storage ---
    DB_PATH: str = Field(default="./civiclens.db")
    UPLOAD_DIR: str = Field(default="./uploads")

    # --- Uploads ---
    MAX_UPLOAD_BYTES: int = 8 * 1024 * 1024  # 8 MB

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    @property
    def upload_path(self) -> Path:
        p = Path(self.UPLOAD_DIR).resolve()
        p.mkdir(parents=True, exist_ok=True)
        return p


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()


settings = get_settings()
