from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_ROOT = Path(__file__).resolve().parents[2]
PIPELINE_ENV = BACKEND_ROOT.parent / "pipeline" / ".env"


class Settings(BaseSettings):
    database_url: str | None = Field(default=None, alias="DATABASE_URL")
    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")
    openai_api_url: str = Field(
        default="https://api.openai.com/v1/chat/completions", alias="OPENAI_API_URL"
    )
    openai_model: str = Field(default="gpt-4.1-mini", alias="OPENAI_MODEL")
    openai_reasoning_effort: str | None = Field(default=None, alias="OPENAI_REASONING_EFFORT")
    backend_cors_origins: str = Field(
        default="http://localhost:3000", alias="BACKEND_CORS_ORIGINS"
    )
    upload_dir: str = Field(default="uploads", alias="UPLOAD_DIR")
    cloudinary_cloud_name: str | None = Field(default=None, alias="CLOUDINARY_CLOUD_NAME")
    cloudinary_api_key: str | None = Field(default=None, alias="CLOUDINARY_API_KEY")
    cloudinary_api_secret: str | None = Field(default=None, alias="CLOUDINARY_API_SECRET")
    cloudinary_url: str | None = Field(default=None, alias="CLOUDINARY_URL")
    cloudinary_folder: str = Field(default="vluoi", alias="CLOUDINARY_FOLDER")

    model_config = SettingsConfigDict(env_file=(PIPELINE_ENV, BACKEND_ROOT / ".env"), extra="ignore")

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.backend_cors_origins.split(",") if origin.strip()]

    @property
    def async_database_url(self) -> str | None:
        if self.database_url and self.database_url.startswith("postgres://"):
            return self.database_url.replace("postgres://", "postgresql+asyncpg://", 1)
        if self.database_url and self.database_url.startswith("postgresql://"):
            return self.database_url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return self.database_url


@lru_cache
def get_settings() -> Settings:
    return Settings()


def openai_reasoning_effort_for_request(settings: object) -> str | None:
    effort = getattr(settings, "openai_reasoning_effort", None)
    if not effort or str(effort).strip().lower() == "none":
        return None
    return str(effort).strip()
