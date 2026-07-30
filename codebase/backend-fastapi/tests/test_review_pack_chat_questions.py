import pytest

from app.services.review_packs import ReviewPackService


@pytest.fixture
def anyio_backend():
    return "asyncio"


class _FakeReviewPackRepository:
    async def list_student_questions(self, lesson_id: str, limit: int = 80) -> list[dict]:
        return [
            {
                "user_id": "student-1",
                "content": "Giải thích RAG ở slide này",
                "source_page": 7,
                "source": "runtime_db",
            }
        ]


@pytest.mark.anyio
async def test_review_pack_chat_questions_include_runtime_db_questions_first():
    service = ReviewPackService(None)
    service.repository = _FakeReviewPackRepository()

    questions = await service._chat_questions_for_lesson(
        {"lesson_id": "day3-rag", "day_codes": ["__no_csv_match__"]}
    )

    assert questions[0]["content"] == "Giải thích RAG ở slide này"
    assert questions[0]["source_page"] == 7
    assert service._format_chat_context_item(questions[0]) == "- [Slide 7] Giải thích RAG ở slide này"
