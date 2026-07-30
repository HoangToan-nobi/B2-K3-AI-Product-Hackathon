import pytest

from app.services.lessons import HIDDEN_STATIC_LESSON_IDS, LessonService, UPLOADED_LESSONS, UPLOADED_PAGES
from app.services.review_packs import ReviewPackService


class _FakeLessonRepository:
    async def list_lessons(self) -> list[dict]:
        return [
            {
                "id": "db_lesson",
                "title": "DB Lesson",
                "slideDecks": [
                    {
                        "id": "deck_db",
                        "lessonId": "db_lesson",
                        "originalFilename": "db.pdf",
                        "pageCount": 2,
                    }
                ],
            }
        ]


@pytest.mark.anyio
async def test_lesson_list_merges_runtime_upload_cache_with_db_lessons():
    UPLOADED_LESSONS["lesson_runtime"] = {
        "id": "lesson_runtime",
        "title": "Runtime Uploaded Lesson",
        "slideDecks": [
            {
                "id": "deck_runtime",
                "lessonId": "lesson_runtime",
                "originalFilename": "runtime.pdf",
                "pageCount": 3,
            }
        ],
    }
    UPLOADED_PAGES["lesson_runtime"] = [{"pageNumber": 1, "textContent": "Runtime page"}]

    try:
        service = LessonService(None)
        service.repository = _FakeLessonRepository()
        lessons = await service.list_lessons()
    finally:
        UPLOADED_LESSONS.pop("lesson_runtime", None)
        UPLOADED_PAGES.pop("lesson_runtime", None)

    lesson_ids = {lesson["id"] for lesson in lessons}
    assert "db_lesson" in lesson_ids
    assert "lesson_runtime" in lesson_ids


@pytest.mark.anyio
async def test_review_pack_catalog_includes_uploaded_slide_decks_and_total_pages():
    HIDDEN_STATIC_LESSON_IDS.clear()
    UPLOADED_LESSONS["lesson_runtime_catalog"] = {
        "id": "lesson_runtime_catalog",
        "title": "Runtime Catalog Lesson",
        "slideDecks": [
            {
                "id": "deck_one",
                "lessonId": "lesson_runtime_catalog",
                "originalFilename": "one.pdf",
                "pageCount": 3,
            },
            {
                "id": "deck_two",
                "lessonId": "lesson_runtime_catalog",
                "originalFilename": "two.pdf",
                "pageCount": 4,
            },
        ],
    }

    try:
        cards = await ReviewPackService(None).list_lesson_cards("labcoach")
    finally:
        UPLOADED_LESSONS.pop("lesson_runtime_catalog", None)

    card = next(item for item in cards if item["id"] == "lesson_runtime_catalog")
    assert card["slide_count"] == 7
    assert [deck["id"] for deck in card["slideDecks"]] == ["deck_one", "deck_two"]
