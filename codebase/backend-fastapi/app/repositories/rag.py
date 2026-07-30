import json
from datetime import datetime, timezone
from dataclasses import dataclass
from typing import Any
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.paths import get_pack_path
from app.services.slides import ensure_slide_artifact, lesson_config, read_transcript_excerpt


@dataclass(frozen=True)
class RagDocument:
    source_type: str
    source_id: str
    title: str
    content: str
    page_number: int | None = None
    score: float = 0.0


class RagRepository:
    def __init__(self, session: AsyncSession | None):
        self.session = session

    async def list_slide_pages(self, lesson_id: str) -> list[RagDocument]:
        docs: list[RagDocument] = []
        if self.session is not None:
            try:
                rows = (
                    await self.session.execute(
                        text(
                            """
                            SELECT sp.id, sp."pageNumber", sp."textContent"
                            FROM "SlidePage" sp
                            JOIN "SlideDeck" sd ON sd.id = sp."deckId"
                            WHERE sd."lessonId" = :lesson_id
                            ORDER BY sp."pageNumber"
                            """
                        ),
                        {"lesson_id": lesson_id},
                    )
                ).mappings().all()
                docs.extend(
                    RagDocument(
                        source_type="slide",
                        source_id=str(row["id"]),
                        title=f"Slide {row['pageNumber']}",
                        page_number=int(row["pageNumber"]),
                        content=row["textContent"] or "",
                    )
                    for row in rows
                    if row["textContent"]
                )
            except Exception:
                docs = []

        if docs:
            return docs

        if lesson_id in {"day1-foundation", "day1-lesson"}:
            try:
                slide = json.loads((get_pack_path("day1-foundation").parent / "slide-day1-foundation.json").read_text())
                return [
                    RagDocument(
                        source_type="slide",
                        source_id=f"artifact-slide-{page['page']}",
                        title=f"Slide {page['page']}",
                        page_number=int(page["page"]),
                        content=page["text"],
                    )
                    for page in slide.get("pages", [])
                    if page.get("text")
                ]
            except Exception:
                pass

        try:
            slide = ensure_slide_artifact(lesson_id)
            return [
                RagDocument(
                    source_type="slide",
                    source_id=f"artifact-slide-{page['page']}",
                    title=f"Slide {page['page']}",
                    page_number=int(page["page"]),
                    content=page["text"],
                )
                for page in slide.get("pages", [])
                if page.get("text")
            ]
        except Exception:
            return []

        return []

    async def save_student_question(
        self,
        *,
        lesson_id: str,
        message: str,
        current_slide_page: int | None,
        selected_text: str | None,
        anonymized_user_id: str = "runtime-student",
    ) -> None:
        if self.session is None or not message.strip():
            return

        db_lesson_id = self._db_lesson_id(lesson_id)
        slide_page_id = await self._find_slide_page_id(db_lesson_id, current_slide_page)
        normalized_message = json.dumps(
            {
                "current_slide_page": current_slide_page,
                "selected_text": selected_text or "",
            },
            ensure_ascii=False,
        )
        try:
            await self.session.execute(
                text(
                    """
                    INSERT INTO "StudentQuestion" (
                        id, "lessonId", "anonymizedUserId", message,
                        "normalizedMessage", "slidePageHint", "createdAt"
                    )
                    SELECT
                        :id, :lesson_id, :anonymized_user_id, :message,
                        :normalized_message, :slide_page_hint, :created_at
                    WHERE EXISTS (
                        SELECT 1 FROM "Lesson" WHERE id = :lesson_id
                    )
                    """
                ),
                {
                    "id": f"sq_{uuid4().hex[:24]}",
                    "lesson_id": db_lesson_id,
                    "anonymized_user_id": anonymized_user_id,
                    "message": message.strip(),
                    "normalized_message": normalized_message,
                    "slide_page_hint": slide_page_id,
                    "created_at": datetime.now(timezone.utc),
                },
            )
            await self.session.commit()
        except Exception:
            await self.session.rollback()

    async def search_chat_history(self, lesson_id: str, query: str, limit: int = 5) -> list[RagDocument]:
        if self.session is None or not query.strip():
            return []
        try:
            rows = (
                await self.session.execute(
                    text(
                        """
                        SELECT id, message
                        FROM "StudentQuestion"
                        WHERE "lessonId" = :lesson_id
                          AND message ILIKE '%' || :query || '%'
                        ORDER BY "createdAt" DESC
                        LIMIT :limit
                        """
                    ),
                    {"lesson_id": self._db_lesson_id(lesson_id), "query": query[:80], "limit": limit},
                )
            ).mappings().all()
        except Exception:
            return []
        return [
            RagDocument(
                source_type="chat_history",
                source_id=str(row["id"]),
                title="Chat history",
                content=row["message"] or "",
            )
            for row in rows
        ]

    async def _find_slide_page_id(self, lesson_id: str, page_number: int | None) -> str | None:
        if self.session is None or page_number is None:
            return None
        try:
            row = (
                await self.session.execute(
                    text(
                        """
                        SELECT sp.id
                        FROM "SlidePage" sp
                        JOIN "SlideDeck" sd ON sd.id = sp."deckId"
                        WHERE sd."lessonId" = :lesson_id
                          AND sp."pageNumber" = :page_number
                        ORDER BY sp."createdAt" DESC
                        LIMIT 1
                        """
                    ),
                    {"lesson_id": lesson_id, "page_number": page_number},
                )
            ).mappings().first()
        except Exception:
            return None
        return str(row["id"]) if row else None

    async def search_transcripts(self, lesson_id: str, query: str, limit: int = 3) -> list[RagDocument]:
        if self.session is None:
            try:
                content = read_transcript_excerpt(lesson_id, limit=2500)
                return [
                    RagDocument(
                        source_type="transcript",
                        source_id=f"transcript-{lesson_id}",
                        title="Transcript",
                        content=self._extract_excerpt(content, query),
                    )
                ] if content else []
            except Exception:
                return []
        db_lesson_id = self._db_lesson_id(lesson_id)
        try:
            rows = (
                await self.session.execute(
                    text(
                        """
                        SELECT id, filename, content
                        FROM "Transcript"
                        WHERE "lessonId" = :lesson_id
                        ORDER BY filename
                        LIMIT :limit
                        """
                    ),
                    {"lesson_id": db_lesson_id, "limit": limit},
                )
            ).mappings().all()
        except Exception:
            return []
        return [
            RagDocument(
                source_type="transcript",
                source_id=str(row["id"]),
                title=row["filename"],
                content=self._extract_excerpt(row["content"] or "", query),
            )
            for row in rows
        ]

    @staticmethod
    def _db_lesson_id(lesson_id: str) -> str:
        aliases = {
            "day1-foundation": "day1-lesson",
            "day2-prompting": "day2-lesson",
            "day3-rag": "day3-lesson",
            "day4-agents": "day4-lesson",
            "day5-product": "day5-lesson",
        }
        try:
            lesson_config(lesson_id)
            return aliases.get(lesson_id, lesson_id)
        except ValueError:
            return lesson_id

    @staticmethod
    def _extract_excerpt(content: str, query: str, window: int = 900) -> str:
        lower = content.lower()
        terms = [term for term in query.lower().split() if len(term) >= 3]
        positions = [lower.find(term) for term in terms if lower.find(term) >= 0]
        start = max(0, min(positions) - window // 2) if positions else 0
        return content[start : start + window].strip()
