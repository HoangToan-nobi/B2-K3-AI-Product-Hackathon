from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.paths import BACKEND_ROOT, FALLBACK_SLIDE_PDF
from app.repositories.lessons import LessonRepository
from app.services.slides import extract_slide_deck, extract_slide_pages, list_static_lesson_options, lesson_config, refresh_all_static_slide_artifacts


UPLOADED_LESSONS: dict[str, dict[str, Any]] = {}
UPLOADED_PAGES: dict[str, list[dict[str, Any]]] = {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:24]}"


def _storage_path(storage_key: str) -> Path:
    path = Path(storage_key)
    return path if path.is_absolute() else BACKEND_ROOT / path


class LessonService:
    def __init__(self, session: AsyncSession | None):
        self.repository = LessonRepository(session)
        self.settings = get_settings()

    async def list_lessons(self) -> list[dict[str, Any]]:
        try:
            lessons = await self.repository.list_lessons()
            if lessons:
                static_lessons = list_static_lesson_options()
                static_ids = {lesson["id"] for lesson in static_lessons}
                return [*static_lessons, *[lesson for lesson in lessons if lesson["id"] not in static_ids]]
        except Exception:
            pass

        return [*list_static_lesson_options(), *list(UPLOADED_LESSONS.values())]

    async def upload_lesson(
        self,
        *,
        title: str,
        course_id: str | None,
        file: UploadFile,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        if not title or file is None:
            raise ValueError("Missing title or file")

        lesson_id = _id("lesson")
        upload_dir = _storage_path(str(Path(self.settings.upload_dir) / "slides"))
        upload_dir.mkdir(parents=True, exist_ok=True)
        original_filename = file.filename or "slides.pdf"
        storage_key = str(Path(self.settings.upload_dir) / "slides" / f"{lesson_id}-{original_filename}")
        output_path = _storage_path(storage_key)
        output_path.write_bytes(await file.read())

        mime_type = file.content_type or "application/pdf"

        try:
            extracted_deck = extract_slide_deck(output_path, mime_type)
            extracted_pages = extracted_deck["pages"]
            page_texts = [page["text"] for page in extracted_pages]
            extraction_meta = {
                "sourceType": extracted_deck["source_type"],
                "emptyPages": extracted_deck["empty_pages"],
                "ocrAvailable": extracted_deck["ocr_available"],
            }
        except Exception:
            page_texts = ["[Slide 1]\nKhông tách được text từ file này. Hãy dùng PDF/PPTX có text selectable để chatbot trả lời chính xác."]
            extraction_meta = {"sourceType": "failed", "emptyPages": [1], "ocrAvailable": False}

        try:
            db_created = await self.repository.create_uploaded_lesson(
                title=title,
                course_id=course_id,
                original_filename=original_filename,
                storage_key=storage_key,
                mime_type=mime_type,
                page_texts=page_texts,
            )
            if db_created:
                lesson, slide_deck = db_created
                slide_deck["extraction"] = extraction_meta
                return lesson, slide_deck
        except Exception:
            pass

        now = _now_iso()
        lesson = {
            "id": lesson_id,
            "courseId": course_id or "default-course",
            "title": title,
            "description": None,
            "status": "draft",
            "createdBy": "labcoach-demo",
            "createdAt": now,
            "updatedAt": now,
            "slideDecks": [],
        }
        slide_deck = {
            "id": _id("deck"),
            "lessonId": lesson_id,
            "originalFilename": original_filename,
            "storageKey": storage_key,
            "mimeType": mime_type,
            "pageCount": len(page_texts),
            "status": "ready",
            "uploadedBy": "labcoach-demo",
            "createdAt": now,
            "extraction": extraction_meta,
        }
        lesson["slideDecks"] = [slide_deck]
        UPLOADED_LESSONS[lesson_id] = lesson
        UPLOADED_PAGES[lesson_id] = [
            {"pageNumber": index, "textContent": text} for index, text in enumerate(page_texts, start=1)
        ]
        return lesson, slide_deck

    async def get_slide_file(self, lesson_id: str) -> tuple[Path, str, str]:
        try:
            deck = await self.repository.find_slide_deck(lesson_id)
        except Exception:
            deck = None

        if deck is None:
            lesson = UPLOADED_LESSONS.get(lesson_id)
            deck = lesson["slideDecks"][0] if lesson and lesson.get("slideDecks") else None

        if deck:
            path = _storage_path(deck["storageKey"])
            if not path.exists():
                path = FALLBACK_SLIDE_PDF
            return path, deck.get("mimeType") or "application/pdf", deck.get("originalFilename") or "slides.pdf"

        try:
            static_lesson = lesson_config(lesson_id)
            path = Path(static_lesson["slide_pdf"])
            if path.exists():
                return path, "application/pdf", path.name
        except ValueError:
            pass

        raise FileNotFoundError("Slide not found")

    async def list_slide_pages(self, lesson_id: str) -> list[dict[str, Any]] | None:
        try:
            pages = await self.repository.list_slide_pages(lesson_id)
            if pages:
                return pages
        except Exception:
            pass
        try:
            deck = await self.repository.find_slide_deck(lesson_id)
            if deck:
                extracted_pages = self._extract_pages_from_deck(deck)
                if extracted_pages:
                    await self.repository.replace_slide_pages(
                        lesson_id=lesson_id,
                        deck_id=deck["id"],
                        page_texts=[page["text"] for page in extracted_pages if page.get("text")],
                    )
                    return [
                        {"pageNumber": page["page"], "textContent": page["text"]}
                        for page in extracted_pages
                        if page.get("text")
                    ]
        except Exception:
            pass
        if lesson_id in UPLOADED_PAGES:
            return UPLOADED_PAGES[lesson_id]
        try:
            from app.services.slides import ensure_slide_artifact

            slide = ensure_slide_artifact(lesson_id)
            return [
                {"pageNumber": page["page"], "textContent": page["text"]}
                for page in slide.get("pages", [])
            ]
        except Exception:
            pass
        return None

    def _extract_pages_from_deck(self, deck: dict[str, Any]) -> list[dict[str, Any]]:
        storage_key = deck.get("storageKey")
        if not storage_key:
            return []
        path = _storage_path(storage_key)
        if not path.exists():
            return []
        extracted = extract_slide_deck(path, deck.get("mimeType"))
        return [page for page in extracted["pages"] if page.get("text")]

    async def reingest_static_lessons(self) -> dict[str, Any]:
        return refresh_all_static_slide_artifacts()
