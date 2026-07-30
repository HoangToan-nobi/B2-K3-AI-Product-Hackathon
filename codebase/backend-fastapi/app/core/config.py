from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_ROOT = Path(__file__).resolve().parents[2]
PIPELINE_ENV = BACKEND_ROOT.parent / "pipeline" / ".env"


class Settings(BaseSettings):
    database_url: str | None = Field(default=None, alias="DATABASE_URL")
    deepseek_api_key: str | None = Field(default=None, alias="DEEPSEEK_API_KEY")
    deepseek_api_url: str = Field(
        default="https://api.deepseek.com/chat/completions", alias="DEEPSEEK_API_URL"
    )
    deepseek_model: str = Field(default="deepseek-chat", alias="DEEPSEEK_MODEL")
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


@lru_cache
def get_settings() -> Settings:
    return Settings()
