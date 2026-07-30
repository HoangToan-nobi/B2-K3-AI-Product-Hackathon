from __future__ import annotations

import io
import mimetypes
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

import httpx

from app.core.config import get_settings
from app.core.paths import BACKEND_ROOT


_MEMORY_STORAGE: dict[str, bytes] = {}


@dataclass(frozen=True)
class StoredAsset:
    storage_key: str
    url: str
    public_id: str
    provider: str


class CloudStorageService:
    def __init__(self) -> None:
        self.settings = get_settings()

    @property
    def cloudinary_enabled(self) -> bool:
        if self.settings.cloudinary_url:
            return True
        return bool(
            self.settings.cloudinary_cloud_name
            and self.settings.cloudinary_api_key
            and self.settings.cloudinary_api_secret
        )

    def upload_bytes(
        self,
        *,
        data: bytes,
        filename: str,
        folder: str,
        mime_type: str | None = None,
        public_id: str | None = None,
    ) -> StoredAsset:
        if self.cloudinary_enabled:
            return self._upload_cloudinary(
                data=data,
                filename=filename,
                folder=folder,
                mime_type=mime_type,
                public_id=public_id,
            )
        return self._upload_memory(data=data, filename=filename, folder=folder, public_id=public_id)

    async def read_bytes(self, storage_key: str) -> bytes:
        if storage_key.startswith("memory://"):
            return _MEMORY_STORAGE[storage_key]
        if storage_key.startswith(("http://", "https://")):
            async with httpx.AsyncClient(timeout=60) as client:
                response = await client.get(storage_key)
                response.raise_for_status()
                return response.content
        path = Path(storage_key)
        if not path.is_absolute():
            path = BACKEND_ROOT / path
        return path.read_bytes()

    def _upload_cloudinary(
        self,
        *,
        data: bytes,
        filename: str,
        folder: str,
        mime_type: str | None,
        public_id: str | None,
    ) -> StoredAsset:
        import cloudinary
        import cloudinary.uploader

        if self.settings.cloudinary_url:
            credentials = _parse_cloudinary_url(self.settings.cloudinary_url)
            cloudinary.config(**credentials, secure=True)
        else:
            cloudinary.config(
                cloud_name=self.settings.cloudinary_cloud_name,
                api_key=self.settings.cloudinary_api_key,
                api_secret=self.settings.cloudinary_api_secret,
                secure=True,
            )

        target_public_id = _clean_public_id(public_id or filename)
        full_public_id = f"{self.settings.cloudinary_folder}/{folder}/{target_public_id}".strip("/")
        options: dict[str, Any] = {
            "resource_type": "raw",
            "public_id": full_public_id,
            "overwrite": True,
            "use_filename": False,
        }
        detected_type = mime_type or mimetypes.guess_type(filename)[0]
        if detected_type:
            options["type"] = "upload"

        result = cloudinary.uploader.upload(io.BytesIO(data), **options)
        secure_url = str(result["secure_url"])
        return StoredAsset(
            storage_key=secure_url,
            url=secure_url,
            public_id=str(result["public_id"]),
            provider="cloudinary",
        )

    @staticmethod
    def _upload_memory(*, data: bytes, filename: str, folder: str, public_id: str | None) -> StoredAsset:
        target_public_id = f"{folder}/{_clean_public_id(public_id or filename)}".strip("/")
        storage_key = f"memory://{target_public_id}"
        _MEMORY_STORAGE[storage_key] = data
        return StoredAsset(
            storage_key=storage_key,
            url=storage_key,
            public_id=target_public_id,
            provider="memory",
        )


def _clean_public_id(value: str) -> str:
    value = Path(value).name
    return re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip("-") or "asset"


def _parse_cloudinary_url(value: str) -> dict[str, str]:
    parsed = urlparse(value)
    if parsed.scheme != "cloudinary" or not parsed.hostname or not parsed.username or not parsed.password:
        raise ValueError("Invalid CLOUDINARY_URL. Expected cloudinary://API-Key:API-Secret@Cloud-name")
    return {
        "cloud_name": parsed.hostname,
        "api_key": unquote(parsed.username),
        "api_secret": unquote(parsed.password),
    }
