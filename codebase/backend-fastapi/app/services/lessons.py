from datetime import datetime, timezone
import tempfile
from pathlib import Path
import json
from typing import Any
from uuid import uuid4

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.paths import FALLBACK_SLIDE_PDF, LOCAL_DB_PATH
from app.repositories.lessons import LessonRepository
from app.services.cloud_storage import CloudStorageService
from app.services.slides import extract_slide_deck, list_static_lesson_options, lesson_config, refresh_all_static_slide_artifacts


UPLOADED_LESSONS: dict[str, dict[str, Any]] = {}
UPLOADED_PAGES: dict[str, list[dict[str, Any]]] = {}
HIDDEN_STATIC_LESSON_IDS: set[str] = set()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:24]}"


class LessonService:
    def __init__(self, session: AsyncSession | None):
        self.repository = LessonRepository(session)
        self.settings = get_settings()
        self.storage = CloudStorageService()

    async def list_lessons(self) -> list[dict[str, Any]]:
        static_lessons = self._visible_static_lessons()
        merged: dict[str, dict[str, Any]] = {lesson["id"]: lesson for lesson in static_lessons}
        static_ids = set(merged)
        try:
            lessons = await self.repository.list_lessons()
            if lessons:
                for lesson in lessons:
                    if lesson["id"] not in static_ids:
                        merged[lesson["id"]] = lesson
        except Exception:
            pass

        for lesson in UPLOADED_LESSONS.values():
            merged[lesson["id"]] = lesson

        return list(merged.values())

    async def upload_lesson(
        self,
        *,
        title: str,
        course_id: str | None,
        file: UploadFile | None = None,
        files: list[UploadFile] | None = None,
        progress: Any | None = None,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        upload_files = files if files else ([file] if file else [])
        if not title or not upload_files:
            raise ValueError("Missing title or files")

        await self._emit_progress(
            progress,
            5,
            "Nhận file từ Lab Coach",
            "VLười đã nhận file và đang kiểm tra thông tin ngày học.",
        )
        first_file = upload_files[0]
        lesson_id = _id("lesson")
        original_filename = first_file.filename or "slides.pdf"
        mime_type = first_file.content_type or "application/pdf"
        file_bytes = await first_file.read()
        await self._emit_progress(
            progress,
            18,
            "Đưa file vào nơi lưu trữ",
            "VLười đang đưa slide lên kho lưu trữ để không phải giữ file trong thư mục dự án.",
            detail=original_filename,
        )
        asset = self.storage.upload_bytes(
            data=file_bytes,
            filename=original_filename,
            folder="slides",
            mime_type=mime_type,
            public_id=f"{lesson_id}-{original_filename}",
        )
        storage_key = asset.storage_key

        try:
            await self._emit_progress(
                progress,
                34,
                "Đọc chữ trong slide",
                "VLười đang mở file và lấy text theo từng trang.",
            )
            extracted_deck = self._extract_slide_deck_from_bytes(file_bytes, original_filename, mime_type)
            extracted_pages = extracted_deck["pages"]
            page_texts = [page["text"] for page in extracted_pages]
            await self._emit_progress(
                progress,
                58,
                "Kiểm tra trang khó đọc",
                "VLười đang đánh dấu các trang ít chữ để Lab Coach biết nếu cần đổi file rõ hơn.",
                detail=f"{len(page_texts)} trang đã được đọc.",
            )
            extraction_meta = {
                "sourceType": extracted_deck["source_type"],
                "emptyPages": extracted_deck["empty_pages"],
                "ocrAvailable": extracted_deck["ocr_available"],
                "storageProvider": asset.provider,
                "storageUrl": asset.url,
            }
        except Exception:
            page_texts = ["[Slide 1]\nKhông tách được text từ file này. Hãy dùng PDF/PPTX có text selectable để chatbot trả lời chính xác."]
            extraction_meta = {
                "sourceType": "failed",
                "emptyPages": [1],
                "ocrAvailable": False,
                "storageProvider": asset.provider,
                "storageUrl": asset.url,
            }

        try:
            await self._emit_progress(
                progress,
                76,
                "Lưu ngày học",
                "VLười đang lưu tên ngày học, danh sách slide và nội dung từng trang.",
            )
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
                self._remember_uploaded_lesson(lesson, page_texts)
                for extra_file in upload_files[1:]:
                    try:
                        await self.add_slide_to_lesson(lesson_id=lesson["id"], file=extra_file, progress=progress)
                    except Exception:
                        pass
                await self._emit_progress(
                    progress,
                    94,
                    "Chuẩn bị cho học viên",
                    "VLười đã sắp xếp slide để học viên có thể xem và hỏi đáp.",
                )
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
        await self._emit_progress(
            progress,
            94,
            "Chuẩn bị cho học viên",
            "VLười đã sắp xếp slide để học viên có thể xem và hỏi đáp.",
        )
        return lesson, slide_deck

    @staticmethod
    def _remember_uploaded_lesson(lesson: dict[str, Any], page_texts: list[str]) -> None:
        lesson_id = str(lesson.get("id") or "")
        if not lesson_id:
            return
        UPLOADED_LESSONS[lesson_id] = lesson
        UPLOADED_PAGES[lesson_id] = [
            {"pageNumber": index, "textContent": text} for index, text in enumerate(page_texts, start=1)
        ]

    async def get_slide_file(self, lesson_id: str) -> tuple[bytes, str, str]:
        try:
            deck = await self.repository.find_slide_deck(lesson_id)
        except Exception:
            deck = None

        if deck is None:
            lesson = UPLOADED_LESSONS.get(lesson_id)
            deck = lesson["slideDecks"][0] if lesson and lesson.get("slideDecks") else None

        if deck:
            try:
                data = await self.storage.read_bytes(deck["storageKey"])
            except Exception:
                data = FALLBACK_SLIDE_PDF.read_bytes()
            return data, deck.get("mimeType") or "application/pdf", deck.get("originalFilename") or "slides.pdf"

        try:
            static_lesson = lesson_config(lesson_id)
            path = Path(static_lesson["slide_pdf"])
            if path.exists():
                return path.read_bytes(), "application/pdf", path.name
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
                extracted_pages = await self._extract_pages_from_deck(deck)
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

    async def _extract_pages_from_deck(self, deck: dict[str, Any]) -> list[dict[str, Any]]:
        storage_key = deck.get("storageKey")
        if not storage_key:
            return []
        try:
            data = await self.storage.read_bytes(storage_key)
        except Exception:
            return []
        extracted = self._extract_slide_deck_from_bytes(
            data,
            deck.get("originalFilename") or "slides.pdf",
            deck.get("mimeType"),
        )
        return [page for page in extracted["pages"] if page.get("text")]

    async def reingest_static_lessons(self) -> dict[str, Any]:
        self._set_hidden_static_lessons(set())
        return refresh_all_static_slide_artifacts()

    async def update_lesson(self, *, lesson_id: str, title: str | None) -> dict[str, Any]:
        try:
            result = await self.repository.update_lesson(lesson_id=lesson_id, title=title)
            if result:
                return result
        except Exception:
            pass
        if lesson_id not in UPLOADED_LESSONS:
            raise ValueError("Lesson not found")
        if title:
            UPLOADED_LESSONS[lesson_id]["title"] = title
        return UPLOADED_LESSONS[lesson_id]

    async def delete_lesson(self, *, lesson_id: str) -> None:
        try:
            deleted = await self.repository.delete_lesson(lesson_id=lesson_id)
            if deleted:
                return
        except Exception:
            pass
        if lesson_id in UPLOADED_LESSONS:
            del UPLOADED_LESSONS[lesson_id]
            UPLOADED_PAGES.pop(lesson_id, None)
            return
        static_ids = {lesson["id"] for lesson in list_static_lesson_options()}
        if lesson_id in static_ids:
            hidden = self._hidden_static_lesson_ids()
            hidden.add(lesson_id)
            self._set_hidden_static_lessons(hidden)
            return
        raise ValueError("Lesson not found")

    async def add_slide_to_lesson(self, *, lesson_id: str, file: UploadFile, progress: Any | None = None) -> dict[str, Any]:
        if file is None:
            raise ValueError("Missing file")
        await self._emit_progress(
            progress,
            8,
            "Nhận slide mới",
            "VLười đã nhận file slide mới và đang chuẩn bị thêm vào ngày học.",
        )
        original_filename = file.filename or "slides.pdf"
        deck_id = _id("deck")
        mime_type = file.content_type or "application/pdf"
        file_bytes = await file.read()
        await self._emit_progress(
            progress,
            24,
            "Đưa slide vào nơi lưu trữ",
            "VLười đang đưa file slide mới lên kho lưu trữ.",
            detail=original_filename,
        )
        asset = self.storage.upload_bytes(
            data=file_bytes,
            filename=original_filename,
            folder="slides",
            mime_type=mime_type,
            public_id=f"{deck_id}-{original_filename}",
        )
        storage_key = asset.storage_key
        try:
            await self._emit_progress(
                progress,
                48,
                "Đọc chữ trong slide mới",
                "VLười đang lấy chữ từng trang để trợ lý hỏi đáp dùng được nội dung mới.",
            )
            extracted_deck = self._extract_slide_deck_from_bytes(file_bytes, original_filename, mime_type)
            page_texts = [page["text"] for page in extracted_deck["pages"]]
        except Exception:
            page_texts = ["[Slide]\nKhông tách được text."]
        try:
            await self._emit_progress(
                progress,
                76,
                "Gắn slide vào ngày học",
                "VLười đang lưu slide mới vào đúng ngày học đã chọn.",
            )
            result = await self.repository.add_slide_deck(
                lesson_id=lesson_id,
                deck_id=deck_id,
                original_filename=original_filename,
                storage_key=storage_key,
                mime_type=mime_type,
                page_texts=page_texts,
            )
            if result:
                await self._emit_progress(
                    progress,
                    94,
                    "Cập nhật danh sách slide",
                    "VLười đã thêm slide mới và giao diện sắp tải lại danh sách.",
                )
                return result
        except Exception:
            pass
        now = _now_iso()
        slide_deck = {
            "id": deck_id,
            "lessonId": lesson_id,
            "originalFilename": original_filename,
            "storageKey": storage_key,
            "mimeType": mime_type,
            "pageCount": len(page_texts),
            "status": "ready",
            "uploadedBy": "labcoach-demo",
            "createdAt": now,
        }
        if lesson_id in UPLOADED_LESSONS:
            UPLOADED_LESSONS[lesson_id].setdefault("slideDecks", []).append(slide_deck)
        await self._emit_progress(
            progress,
            94,
            "Cập nhật danh sách slide",
            "VLười đã thêm slide mới và giao diện sắp tải lại danh sách.",
        )
        return slide_deck

    @staticmethod
    async def _emit_progress(
        progress: Any | None,
        percent: int,
        step: str,
        message: str,
        detail: str | None = None,
    ) -> None:
        if progress is None:
            return
        await progress.emit(percent=percent, step=step, message=message, detail=detail)

    @staticmethod
    def _extract_slide_deck_from_bytes(data: bytes, filename: str, mime_type: str | None) -> dict[str, Any]:
        suffix = Path(filename).suffix or (".pptx" if "presentation" in (mime_type or "") else ".pdf")
        with tempfile.NamedTemporaryFile(prefix="vluoi-slide-", suffix=suffix) as temp_file:
            temp_file.write(data)
            temp_file.flush()
            return extract_slide_deck(Path(temp_file.name), mime_type)

    async def delete_slide(self, *, lesson_id: str, deck_id: str) -> None:
        try:
            deleted = await self.repository.delete_slide_deck(deck_id=deck_id)
            if deleted:
                return
        except Exception:
            pass
        lesson = UPLOADED_LESSONS.get(lesson_id)
        if lesson:
            lesson["slideDecks"] = [d for d in lesson.get("slideDecks", []) if d["id"] != deck_id]
            if not lesson["slideDecks"]:
                UPLOADED_PAGES.pop(lesson_id, None)
            return
        raise ValueError("Slide not found")

    def _visible_static_lessons(self) -> list[dict[str, Any]]:
        hidden = self._hidden_static_lesson_ids()
        return [lesson for lesson in list_static_lesson_options() if lesson["id"] not in hidden]

    @staticmethod
    def _hidden_static_lesson_ids() -> set[str]:
        if HIDDEN_STATIC_LESSON_IDS:
            return set(HIDDEN_STATIC_LESSON_IDS)
        try:
            db = json.loads(LOCAL_DB_PATH.read_text(encoding="utf-8"))
            return set(str(item) for item in db.get("hidden_static_lesson_ids", []))
        except Exception:
            return set()

    @staticmethod
    def _set_hidden_static_lessons(hidden: set[str]) -> None:
        HIDDEN_STATIC_LESSON_IDS.clear()
        HIDDEN_STATIC_LESSON_IDS.update(hidden)
        try:
            db = json.loads(LOCAL_DB_PATH.read_text(encoding="utf-8"))
        except Exception:
            db = {
                "active_lesson_id": "day1-foundation",
                "published_pack_ids": ["pack-day1-foundation-001"],
                "users": [],
            }
        db["hidden_static_lesson_ids"] = sorted(hidden)
        LOCAL_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        LOCAL_DB_PATH.write_text(json.dumps(db, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
