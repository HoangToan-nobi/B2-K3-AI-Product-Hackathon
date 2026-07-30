from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.entities import Course, Lesson, SlideChunk, SlideDeck, SlidePage, User


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:24]}"


def _lesson_to_dict(lesson: Lesson) -> dict:
    return {
        "id": lesson.id,
        "courseId": lesson.course_id,
        "title": lesson.title,
        "description": lesson.description,
        "status": lesson.status,
        "createdBy": lesson.created_by,
        "createdAt": lesson.created_at.isoformat() if lesson.created_at else _now_iso(),
        "updatedAt": lesson.updated_at.isoformat() if lesson.updated_at else _now_iso(),
        "slideDecks": [_deck_to_dict(deck) for deck in lesson.slide_decks],
    }


def _deck_to_dict(deck: SlideDeck) -> dict:
    return {
        "id": deck.id,
        "lessonId": deck.lesson_id,
        "originalFilename": deck.original_filename,
        "storageKey": deck.storage_key,
        "mimeType": deck.mime_type,
        "pageCount": deck.page_count,
        "status": deck.status,
        "uploadedBy": deck.uploaded_by,
        "createdAt": deck.created_at.isoformat() if deck.created_at else _now_iso(),
    }


class LessonRepository:
    def __init__(self, session: AsyncSession | None):
        self.session = session

    async def list_lessons(self) -> list[dict] | None:
        if self.session is None:
            return None
        result = await self.session.execute(
            select(Lesson).options(selectinload(Lesson.slide_decks)).order_by(Lesson.created_at.desc())
        )
        lessons = result.scalars().all()
        return [_lesson_to_dict(lesson) for lesson in lessons]

    async def find_slide_deck(self, lesson_id: str) -> dict | None:
        if self.session is None:
            return None
        result = await self.session.execute(select(SlideDeck).where(SlideDeck.lesson_id == lesson_id))
        deck = result.scalar_one_or_none()
        return _deck_to_dict(deck) if deck else None

    async def list_slide_pages(self, lesson_id: str) -> list[dict] | None:
        if self.session is None:
            return None
        deck_result = await self.session.execute(select(SlideDeck).where(SlideDeck.lesson_id == lesson_id))
        deck = deck_result.scalar_one_or_none()
        if deck is None:
            return None
        page_result = await self.session.execute(
            select(SlidePage).where(SlidePage.deck_id == deck.id).order_by(SlidePage.page_number)
        )
        return [
            {"pageNumber": page.page_number, "textContent": page.text_content or ""}
            for page in page_result.scalars().all()
        ]

    async def create_uploaded_lesson(
        self,
        *,
        title: str,
        course_id: str | None,
        original_filename: str,
        storage_key: str,
        mime_type: str,
        page_texts: list[str],
    ) -> tuple[dict, dict] | None:
        if self.session is None:
            return None

        user_result = await self.session.execute(select(User).limit(1))
        user = user_result.scalar_one_or_none()
        owner_id = user.id if user else ""

        target_course_id = course_id
        if not target_course_id:
            course_result = await self.session.execute(select(Course).limit(1))
            course = course_result.scalar_one_or_none()
            if course:
                target_course_id = course.id
            else:
                course = Course(id=_id("course"), title="Default Course", owner_id=owner_id)
                self.session.add(course)
                target_course_id = course.id

        lesson = Lesson(
            id=_id("lesson"),
            title=title,
            course_id=target_course_id,
            created_by=owner_id,
            status="draft",
            updated_at=datetime.utcnow(),
        )
        deck = SlideDeck(
            id=_id("deck"),
            lesson_id=lesson.id,
            original_filename=original_filename,
            storage_key=storage_key,
            mime_type=mime_type,
            page_count=len(page_texts),
            status="ready",
            uploaded_by=owner_id,
        )
        self.session.add_all([lesson, deck])
        await self.session.flush()

        for index, page_text in enumerate(page_texts, start=1):
            page = SlidePage(
                id=_id("page"),
                deck_id=deck.id,
                page_number=index,
                text_content=page_text.strip(),
            )
            self.session.add(page)
            await self.session.flush()
            self.session.add(
                SlideChunk(
                    id=_id("chunk"),
                    page_id=page.id,
                    deck_id=deck.id,
                    lesson_id=lesson.id,
                    chunk_index=index - 1,
                    content=page_text.strip(),
                    token_count=len(page_text.split()),
                )
            )

        await self.session.commit()
        deck_dict = _deck_to_dict(deck)
        lesson_dict = {
            "id": lesson.id,
            "courseId": lesson.course_id,
            "title": lesson.title,
            "description": lesson.description,
            "status": lesson.status,
            "createdBy": lesson.created_by,
            "createdAt": lesson.created_at.isoformat() if lesson.created_at else _now_iso(),
            "updatedAt": lesson.updated_at.isoformat() if lesson.updated_at else _now_iso(),
            "slideDecks": [deck_dict],
        }
        return lesson_dict, deck_dict

    async def replace_slide_pages(
        self,
        *,
        lesson_id: str,
        deck_id: str,
        page_texts: list[str],
    ) -> None:
        if self.session is None:
            return

        await self.session.execute(delete(SlideChunk).where(SlideChunk.deck_id == deck_id))
        await self.session.execute(delete(SlidePage).where(SlidePage.deck_id == deck_id))

        for index, page_text in enumerate(page_texts, start=1):
            page = SlidePage(
                id=_id("page"),
                deck_id=deck_id,
                page_number=index,
                text_content=page_text.strip(),
            )
            self.session.add(page)
            await self.session.flush()
            self.session.add(
                SlideChunk(
                    id=_id("chunk"),
                    page_id=page.id,
                    deck_id=deck_id,
                    lesson_id=lesson_id,
                    chunk_index=index - 1,
                    content=page_text.strip(),
                    token_count=len(page_text.split()),
                )
            )

        deck_result = await self.session.execute(select(SlideDeck).where(SlideDeck.id == deck_id))
        deck = deck_result.scalar_one_or_none()
        if deck:
            deck.page_count = len(page_texts)
            deck.status = "ready"
        await self.session.commit()
