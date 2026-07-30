import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.entities import KnowledgeItem, KnowledgePack, Lesson, User


def _parse_metadata(value: str | None) -> dict[str, Any]:
    if not value:
        return {}
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


def _pack_to_contract(lesson: Lesson, pack: KnowledgePack) -> dict[str, Any]:
    items = pack.knowledge_items
    summary = []
    class_insights = []
    review_questions = []

    for item in items:
        metadata = _parse_metadata(item.metadata_)
        if item.type == "summary":
            summary.append(
                {
                    "id": item.id,
                    "title": item.title or "",
                    "content": item.content,
                    "source_pages": metadata.get("source_pages", []),
                    "source_excerpt": metadata.get("source_excerpt", ""),
                    "confidence": item.confidence or 1,
                    "status": item.status,
                }
            )
        elif item.type in {"insight", "misconception", "blindspot"}:
            class_insights.append(
                {
                    "id": item.id,
                    "topic": item.title or "",
                    "common_confusion": item.title or "",
                    "correct_understanding": item.content,
                    "source_pages": metadata.get("source_pages", []),
                    "source_excerpt": metadata.get("source_excerpt", ""),
                    "confidence": item.confidence or 1,
                    "status": item.status,
                    "unique_user_count": metadata.get("unique_user_count", 1),
                    "question_count": metadata.get("question_count", 1),
                    "representative_questions": metadata.get("representative_questions", []),
                }
            )
        elif item.type in {"qa", "quiz"}:
            raw = _parse_metadata(item.content)
            review_questions.append(
                {
                    "id": item.id,
                    "type": "multiple_choice",
                    "question": raw.get("question") or item.title or "",
                    "options": raw.get("options", []),
                    "correct_option": raw.get("correct_answer_index", 0),
                    "answer": raw.get("explanation") or item.content,
                    "explanation": raw.get("explanation") or item.content,
                    "source_pages": raw.get("source_pages", []),
                    "source_excerpt": raw.get("source_excerpt", ""),
                    "confidence": item.confidence or 1,
                    "status": item.status,
                }
            )

    generated_at = pack.generated_at or datetime.now(timezone.utc)
    return {
        "schema_version": "1.0",
        "pack_id": pack.id,
        "status": pack.status,
        "generated_at": generated_at.isoformat(),
        "lesson": {
            "id": lesson.id,
            "title": lesson.title,
            "slide_count": lesson.slide_decks[0].page_count if lesson.slide_decks else 29,
        },
        "analysis": {
            "student_question_count": 0,
            "unique_user_count": 0,
            "cluster_count": 0,
            "included_cluster_count": 0,
            "excluded_noise_count": 0,
        },
        "summary": summary,
        "class_insights": class_insights,
        "review_questions": review_questions,
        "warnings": [],
    }


class ReviewPackRepository:
    def __init__(self, session: AsyncSession | None):
        self.session = session

    async def list_users(self) -> list[dict[str, str]] | None:
        if self.session is None:
            return None
        result = await self.session.execute(select(User))
        users = result.scalars().all()
        if not users:
            return None
        return [{"id": user.id, "name": user.name or "", "role": user.role} for user in users]

    async def read_pack(self, lesson_id: str) -> dict[str, Any] | None:
        if self.session is None:
            return None
        result = await self.session.execute(
            select(Lesson)
            .where(Lesson.id == lesson_id)
            .options(
                selectinload(Lesson.slide_decks),
                selectinload(Lesson.knowledge_packs).selectinload(KnowledgePack.knowledge_items),
            )
        )
        lesson = result.scalar_one_or_none()
        if lesson is None or not lesson.knowledge_packs:
            return None
        return _pack_to_contract(lesson, lesson.knowledge_packs[0])

    async def update_item(self, pack_id: str, item_id: str, action: str) -> dict[str, Any] | None:
        if self.session is None:
            return None
        item = await self.session.get(KnowledgeItem, item_id)
        if item is None:
            return None
        if action == "approve":
            item.status = "ready"
        elif action == "drop":
            await self.session.delete(item)
        await self.session.commit()

        result = await self.session.execute(select(KnowledgePack).where(KnowledgePack.id == pack_id))
        pack = result.scalar_one_or_none()
        if pack is None:
            return None
        return await self.read_pack(pack.lesson_id)

    async def list_student_questions(self, lesson_id: str, limit: int = 80) -> list[dict[str, Any]]:
        if self.session is None:
            return []
        alias_lesson_id = {
            "day1-foundation": "day1-lesson",
            "day2-prompting": "day2-lesson",
            "day3-rag": "day3-lesson",
            "day4-agents": "day4-lesson",
            "day5-product": "day5-lesson",
        }.get(lesson_id, lesson_id)
        rows = (
            await self.session.execute(
                text(
                    """
                    SELECT
                        sq.id,
                        sq."anonymizedUserId",
                        sq.message,
                        sq."normalizedMessage",
                        sp."pageNumber"
                    FROM "StudentQuestion" sq
                    LEFT JOIN "SlidePage" sp ON sp.id = sq."slidePageHint"
                    WHERE sq."lessonId" IN (:lesson_id, :alias_lesson_id)
                    ORDER BY sq."createdAt" DESC
                    LIMIT :limit
                    """
                ),
                {"lesson_id": lesson_id, "alias_lesson_id": alias_lesson_id, "limit": limit},
            )
        ).mappings().all()
        questions: list[dict[str, Any]] = []
        for row in rows:
            metadata = _parse_metadata(row["normalizedMessage"])
            page_number = row["pageNumber"] or metadata.get("current_slide_page")
            questions.append(
                {
                    "id": str(row["id"]),
                    "user_id": row["anonymizedUserId"] or "",
                    "content": row["message"] or "",
                    "source_page": int(page_number) if str(page_number or "").isdigit() else None,
                    "source": "runtime_db",
                }
            )
        return questions
