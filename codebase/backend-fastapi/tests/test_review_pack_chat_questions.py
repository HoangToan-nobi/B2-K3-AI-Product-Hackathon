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


@pytest.mark.anyio
async def test_review_pack_uses_runtime_db_questions_without_csv_fallback(monkeypatch):
    service = ReviewPackService(None)
    service.repository = _FakeReviewPackRepository()

    def fail_csv(_mapping):
        raise AssertionError("CSV should not be read when Postgres questions exist")

    monkeypatch.setattr(ReviewPackService, "_csv_chat_questions_for_lesson", staticmethod(fail_csv))

    questions = await service._chat_questions_for_lesson(
        {"lesson_id": "day3-rag", "day_codes": ["any"]}
    )

    assert [item["source"] for item in questions] == ["runtime_db"]


def test_select_chat_context_questions_prioritizes_page_and_user_diversity():
    questions = [
        {"user_id": "u1", "content": "Câu hỏi mở đầu không có trang", "source_page": None},
        {"user_id": "u1", "content": "Trang 2 hỏi lần một", "source_page": 2},
        {"user_id": "u1", "content": "Trang 2 hỏi lần hai", "source_page": 2},
        {"user_id": "u2", "content": "Trang 4 hỏi khác người", "source_page": 4},
        {"user_id": "u3", "content": "Trang 9 hỏi khác trang", "source_page": 9},
    ]

    selected = ReviewPackService._select_chat_context_questions(questions, limit=3)

    assert [item["content"] for item in selected] == [
        "Trang 2 hỏi lần một",
        "Trang 4 hỏi khác người",
        "Trang 9 hỏi khác trang",
    ]


def test_fallback_summary_uses_important_content_across_all_slides():
    slide_pages = [
        {"page": 1, "text": "[Slide 1] Trang bìa"},
        {"page": 2, "text": "[Slide 2] Agenda và giới thiệu"},
        {"page": 3, "text": "[Slide 3] Hoạt động mở đầu"},
        {
            "page": 10,
            "text": "[Slide 10] LLM là model nền dùng chung cho tóm tắt, viết code, dịch và phân tích.",
        },
        {
            "page": 14,
            "text": "[Slide 14] Context là bàn làm việc có hạn; context quá dài làm model dễ bỏ sót.",
        },
        {
            "page": 23,
            "text": "[Slide 23] Agent là LLM có goal, tools, memory và action để làm nhiều bước.",
        },
    ]

    fallback = ReviewPackService._fallback_generated(slide_pages, [])

    titles = [item["title"] for item in fallback["summary"]]
    all_source_pages = [page for item in fallback["summary"] for page in item["source_pages"]]
    assert "Nội dung trọng tâm slide 1" not in titles
    assert any(page >= 10 for page in all_source_pages)
    assert 3 <= len(fallback["review_questions"]) <= 5
    assert all(len(item["options"]) == 4 for item in fallback["review_questions"])


def test_fallback_quiz_uses_summary_and_student_question_topics():
    slide_pages = [
        {"page": 4, "text": "Token là đơn vị văn bản mà model xử lý khi đọc và sinh câu trả lời."},
    ]
    summary = [
        {
            "title": "Token",
            "content": "Token là đơn vị văn bản mà model xử lý.",
            "source_pages": [4],
            "source_excerpt": "Token là đơn vị văn bản mà model xử lý.",
        }
    ]
    insights = [
        {
            "topic": "Vì sao model không đọc theo từ?",
            "common_confusion": "Vì sao model không đọc theo từ?",
            "correct_understanding": "Model xử lý văn bản theo token thay vì theo từ như con người.",
            "source_pages": [4],
            "source_excerpt": "Token là đơn vị văn bản mà model xử lý.",
        }
    ]

    quiz = ReviewPackService._fallback_quiz_items(summary, insights, slide_pages, limit=5)

    assert quiz[0]["question"].startswith("Ý nào mô tả đúng nhất")
    assert len(quiz[0]["options"]) == 4
    assert any("học viên hỏi" in item["question"] for item in quiz)


def test_fallback_insights_are_student_question_answer_cards():
    slide_pages = [
        {
            "page": 7,
            "text": "RAG kết hợp retrieval từ tài liệu với generation để câu trả lời bám nguồn và có trích dẫn.",
        }
    ]
    chat_questions = [
        {
            "user_id": "student-1",
            "content": "RAG khác gì so với hỏi trực tiếp LLM?",
            "source_page": 7,
            "source": "runtime_db",
        }
    ]

    fallback = ReviewPackService._fallback_generated(slide_pages, chat_questions)
    insight = fallback["class_insights"][0]

    assert insight["topic"] == "RAG khác gì so với hỏi trực tiếp LLM?"
    assert insight["common_confusion"] == "RAG khác gì so với hỏi trực tiếp LLM?"
    assert "Trả lời gợi ý:" in insight["correct_understanding"]
    assert "Giải thích:" in insight["correct_understanding"]
    assert "JSON" not in insight["common_confusion"]


def test_normalized_pack_keeps_slide_grounded_summary_out_of_review():
    service = ReviewPackService(None)
    pack = service._normalize_generated_pack(
        lesson_id="lesson-1",
        title="Lesson 1",
        slide_count=1,
        generated={
            "summary": [
                {
                    "title": "LLM và context",
                    "content": "Context là phần thông tin model nhìn thấy trong một lần trả lời.",
                    "source_pages": [1],
                    "confidence": 0.5,
                }
            ],
            "class_insights": [],
            "review_questions": [],
        },
        chat_questions=[],
        slide_pages=[
            {
                "page": 1,
                "text": "[Slide 1] Context là bàn làm việc có hạn của model.",
            }
        ],
    )

    assert pack["summary"][0]["status"] == "ready"
    assert pack["status"] == "ready"
    assert pack["warnings"] == []
