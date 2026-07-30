import json

import pytest

from app.services.review_packs import ReviewPackService
from app.services.lessons import UPLOADED_LESSONS, UPLOADED_PAGES


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


class _FakeLlmService:
    enabled = True

    def __init__(self) -> None:
        self.calls: list[dict] = []

    async def answer(self, *, question: str, context: str) -> str:
        self.calls.append({"question": question, "context": context})
        return "RLHF là cách căn chỉnh model bằng phản hồi của con người để câu trả lời phù hợp hơn với mong muốn sử dụng."


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


def test_uploaded_lesson_mapping_does_not_use_static_csv_chatlog():
    questions = ReviewPackService._csv_chat_questions_for_lesson(
        {"lesson_id": "lesson_uploaded", "chatlog_csv": "", "day_codes": []}
    )

    assert questions == []


def test_normalized_pack_ignores_generated_insights_without_real_chat_questions():
    service = ReviewPackService(None)
    pack = service._normalize_generated_pack(
        lesson_id="lesson-empty-chat",
        title="Lesson",
        slide_count=1,
        generated={
            "summary": [
                {
                    "title": "Token",
                    "content": "Token là đơn vị văn bản mà model xử lý.",
                    "source_pages": [1],
                    "source_excerpt": "Token là đơn vị văn bản mà model xử lý.",
                    "confidence": 0.9,
                }
            ],
            "class_insights": [
                {
                    "topic": "Câu bịa từ AI",
                    "common_confusion": "Câu bịa từ AI",
                    "correct_understanding": "Không được xuất hiện nếu không có chatlog thật.",
                    "source_pages": [1],
                    "source_excerpt": "Token là đơn vị văn bản mà model xử lý.",
                    "confidence": 0.9,
                }
            ],
            "review_questions": [],
        },
        chat_questions=[],
        slide_pages=[{"page": 1, "text": "Token là đơn vị văn bản mà model xử lý."}],
    )

    assert pack["class_insights"] == []


def test_normalized_pack_strips_markdown_from_visible_fields():
    service = ReviewPackService(None)
    pack = service._normalize_generated_pack(
        lesson_id="lesson-markdown",
        title="Lesson",
        slide_count=1,
        generated={
            "summary": [
                {
                    "title": "**Token** và context",
                    "content": "- **Token:** đơn vị văn bản model xử lý.",
                    "source_pages": [1],
                    "source_excerpt": "**Token** là đơn vị văn bản.",
                    "confidence": 0.9,
                }
            ],
            "class_insights": [
                {
                    "topic": "**Những câu hỏi liên quan đến RLHF**",
                    "common_confusion": "- rlhf là gì",
                    "correct_understanding": "**RLHF** là cách căn chỉnh model bằng phản hồi của con người.",
                    "source_pages": [1],
                    "source_excerpt": "**RLHF** là bước căn chỉnh.",
                    "confidence": 0.9,
                    "representative_questions": ["**rlhf là gì**"],
                }
            ],
            "review_questions": [
                {
                    "question": "**Token** là gì?",
                    "options": ["**Một mảnh chữ**", "Một file", "Một slide", "Một ảnh"],
                    "correct_option": 0,
                    "answer": "**Một mảnh chữ**",
                    "explanation": "**Token** là đơn vị model xử lý.",
                    "source_pages": [1],
                    "source_excerpt": "**Token** là đơn vị văn bản.",
                    "confidence": 0.9,
                }
            ],
        },
        chat_questions=[{"user_id": "u1", "content": "rlhf là gì", "source_page": 1}],
        slide_pages=[{"page": 1, "text": "Token là đơn vị văn bản. RLHF là bước căn chỉnh."}],
    )

    visible_blob = json.dumps(pack, ensure_ascii=False)
    assert "**" not in visible_blob
    assert "- rlhf" not in visible_blob
    assert pack["summary"][0]["title"] == "Token và context"
    assert pack["class_insights"][0]["correct_understanding"].startswith("RLHF là cách căn chỉnh")


@pytest.mark.anyio
async def test_review_pack_mapping_falls_back_to_recent_uploaded_lesson_cache():
    lesson_id = "lesson_recent_upload"
    UPLOADED_LESSONS[lesson_id] = {
        "id": lesson_id,
        "title": "Recent Uploaded Lesson",
        "slideDecks": [
            {
                "id": "deck_recent_upload",
                "lessonId": lesson_id,
                "storageKey": "cloudinary://slides/recent-upload.pdf",
                "pageCount": 1,
            }
        ],
    }
    UPLOADED_PAGES[lesson_id] = [{"pageNumber": 1, "textContent": "AI khác gì ML?"}]

    try:
        service = ReviewPackService(None)
        mapping = await service._lesson_mapping(lesson_id)

        assert mapping["lesson_id"] == lesson_id
        assert mapping["title"] == "Recent Uploaded Lesson"
        assert mapping["max_page"] == 1
    finally:
        UPLOADED_LESSONS.pop(lesson_id, None)
        UPLOADED_PAGES.pop(lesson_id, None)


@pytest.mark.anyio
async def test_review_pack_mapping_retries_recent_lesson_lookup(monkeypatch):
    class _RetryLessonService:
        def __init__(self) -> None:
            self.calls = 0

        async def list_lessons(self) -> list[dict]:
            self.calls += 1
            if self.calls == 1:
                return []
            return [
                {
                    "id": "lesson_retry",
                    "title": "Retry Lesson",
                    "slideDecks": [{"storageKey": "cloudinary://slides/retry.pdf", "pageCount": 2}],
                }
            ]

    async def no_sleep(_seconds: float) -> None:
        return None

    service = ReviewPackService(None)
    retry_lesson_service = _RetryLessonService()
    service.lesson_service = retry_lesson_service
    monkeypatch.setattr("app.services.review_packs.asyncio.sleep", no_sleep)

    mapping = await service._lesson_mapping("lesson_retry")

    assert retry_lesson_service.calls == 2
    assert mapping["lesson_id"] == "lesson_retry"
    assert mapping["max_page"] == 2


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
    assert "Trả lời & giải thích:" in insight["correct_understanding"]
    assert "Lab Coach cần kiểm tra" not in insight["correct_understanding"]
    assert "JSON" not in insight["common_confusion"]


def test_top_chat_question_groups_keep_single_question_and_rank_top_ten():
    questions = [
        {"user_id": "u1", "content": "AI khác gì ML?", "source_page": 3},
        {"user_id": "u2", "content": "AI khác gì ML?", "source_page": 3},
        {"user_id": "u3", "content": "Token có chi phí như thế nào?", "source_page": 12},
        {"user_id": "u-extra-1", "content": "Context window là gì?", "source_page": 4},
        {"user_id": "u-extra-2", "content": "Attention hoạt động như thế nào?", "source_page": 5},
        {"user_id": "u-extra-3", "content": "Hallucination vì sao xảy ra?", "source_page": 6},
        {"user_id": "u-extra-4", "content": "Agent khác workflow ở đâu?", "source_page": 7},
        {"user_id": "u-extra-5", "content": "Temperature dùng để làm gì?", "source_page": 8},
        {"user_id": "u-extra-6", "content": "Prompt engineering là gì?", "source_page": 9},
        {"user_id": "u-extra-7", "content": "RAG khác fine-tuning thế nào?", "source_page": 10},
        {"user_id": "u-extra-8", "content": "Parameter là gì?", "source_page": 11},
    ]

    groups = ReviewPackService._top_chat_question_groups(questions, limit=10)

    assert len(groups) == 10
    assert groups[0]["representative_questions"] == ["AI khác gì ML?"]
    assert groups[0]["topic"] == "Câu hỏi về AI / ML"
    assert groups[0]["question_count"] == 2
    assert any(group["representative_questions"] == ["Token có chi phí như thế nào?"] for group in groups)

    single = ReviewPackService._top_chat_question_groups(
        [{"user_id": "u1", "content": "Parameter là gì?", "source_page": 8}],
        limit=10,
    )

    assert len(single) == 1
    assert single[0]["representative_questions"] == ["Parameter là gì?"]
    assert single[0]["topic"] == "Câu hỏi về Parameter"


def test_top_chat_question_groups_cluster_related_rlhf_questions():
    questions = [
        {"user_id": "u1", "content": "rlhf là gì", "source_page": 18},
        {"user_id": "u2", "content": "giải thích kỹ về rlhf", "source_page": 18},
        {"user_id": "u3", "content": "rlhf khác gì bình thường", "source_page": 19},
    ]

    groups = ReviewPackService._top_chat_question_groups(questions, limit=10)

    assert len(groups) == 1
    assert groups[0]["signature"] == "rlhf"
    assert groups[0]["topic"] == "Những câu hỏi liên quan đến RLHF"
    assert groups[0]["question_count"] == 3
    assert groups[0]["unique_user_count"] == 3
    assert groups[0]["best_question"] == "rlhf khác gì bình thường"
    assert groups[0]["representative_questions"] == [
        "rlhf là gì",
        "giải thích kỹ về rlhf",
        "rlhf khác gì bình thường",
    ]


@pytest.mark.anyio
async def test_answer_chat_question_groups_asks_llm_with_best_cluster_question():
    service = ReviewPackService(None)
    fake_llm = _FakeLlmService()
    service.llm_service = fake_llm

    insights = await service._answer_chat_question_groups(
        slide_pages=[
            {
                "page": 18,
                "text": "RLHF dùng phản hồi của con người để căn chỉnh model sau giai đoạn huấn luyện nền.",
            }
        ],
        chat_questions=[
            {"user_id": "u1", "content": "rlhf là gì", "source_page": 18, "cited_pages": [18]},
            {"user_id": "u2", "content": "giải thích kỹ về rlhf", "source_page": 18, "cited_pages": [18]},
            {"user_id": "u3", "content": "rlhf khác gì bình thường", "source_page": 18, "cited_pages": [18]},
        ],
        generated_insights=[],
    )

    assert fake_llm.calls == [
        {
            "question": "rlhf khác gì bình thường",
            "context": "[Slide 18] RLHF dùng phản hồi của con người để căn chỉnh model sau giai đoạn huấn luyện nền.",
        }
    ]
    assert len(insights) == 1
    assert insights[0]["topic"] == "Những câu hỏi liên quan đến RLHF"
    assert insights[0]["source_pages"] == [18]
    assert insights[0]["correct_understanding"].startswith("RLHF là cách căn chỉnh")


def test_normalized_pack_locks_insights_to_real_chat_questions():
    service = ReviewPackService(None)
    pack = service._normalize_generated_pack(
        lesson_id="lesson-chat",
        title="Lesson",
        slide_count=3,
        generated={
            "summary": [
                {
                    "title": "AI và ML",
                    "content": "AI là hệ rộng hơn, ML là nhánh học từ dữ liệu.",
                    "source_pages": [3],
                    "source_excerpt": "AI là hệ rộng hơn ML.",
                    "confidence": 0.8,
                }
            ],
            "class_insights": [
                {
                    "topic": "Làm thế nào để tải slide về máy?",
                    "common_confusion": "Làm thế nào để tải slide về máy?",
                    "correct_understanding": "Không được xuất hiện vì không có trong chatlog bài này.",
                    "source_pages": [1],
                    "source_excerpt": "Trang bìa",
                    "confidence": 0.95,
                },
                {
                    "topic": "AI khác gì ML?",
                    "common_confusion": "AI khác gì ML?",
                    "correct_understanding": "AI là phạm vi rộng hơn, ML là một nhánh dùng dữ liệu để học mẫu.",
                    "source_pages": [3],
                    "source_excerpt": "AI là hệ rộng hơn ML.",
                    "confidence": 0.9,
                },
            ],
            "review_questions": [],
        },
        chat_questions=[
            {"user_id": "u1", "content": "AI khác gì ML?", "source_page": 3},
            {"user_id": "u2", "content": "Parameter là gì?", "source_page": 4},
        ],
        slide_pages=[
            {"page": 3, "text": "AI là hệ rộng hơn ML."},
            {"page": 4, "text": "Parameter là tham số mà model học được trong quá trình huấn luyện."},
        ],
    )

    topics = [item["topic"] for item in pack["class_insights"]]
    assert topics == ["Câu hỏi về AI / ML", "Câu hỏi về Parameter"]
    assert all("tải slide" not in item["topic"].lower() for item in pack["class_insights"])
    assert pack["class_insights"][0]["correct_understanding"].startswith("AI là phạm vi rộng hơn")


def test_chat_cited_insight_is_ready_and_uses_real_citation_pages():
    service = ReviewPackService(None)
    pack = service._normalize_generated_pack(
        lesson_id="lesson-chat",
        title="Lesson",
        slide_count=12,
        generated={"summary": [], "class_insights": [], "review_questions": []},
        chat_questions=[
            {
                "user_id": "u1",
                "content": "Token có chi phí như thế nào?",
                "source_page": 1,
                "cited_pages": [12],
                "citations": "Slide 12",
                "ai_reply": "Token là đơn vị tính chi phí khi gọi API; nội dung càng nhiều token thì chi phí càng tăng.",
            }
        ],
        slide_pages=[
            {"page": 1, "text": "Trang bìa"},
            {"page": 12, "text": "Token là đơn vị model xử lý và cũng là đơn vị tính chi phí API."},
        ],
    )

    insight = pack["class_insights"][0]
    assert insight["source_pages"] == [12]
    assert insight["source_excerpt"].startswith("Token là đơn vị")
    assert insight["status"] == "ready"
    assert pack["status"] == "ready"


def test_outside_slide_chat_insight_needs_labcoach_review():
    service = ReviewPackService(None)
    pack = service._normalize_generated_pack(
        lesson_id="lesson-chat",
        title="Lesson",
        slide_count=1,
        generated={"summary": [], "class_insights": [], "review_questions": []},
        chat_questions=[
            {
                "user_id": "u1",
                "content": "Hôm nay thời tiết thế nào?",
                "source_page": 1,
                "cited_pages": [],
                "citations": "Ngoài slide",
                "is_outside_slide": True,
                "ai_reply": "Đây là câu hỏi ngoài nội dung slide.",
            }
        ],
        slide_pages=[{"page": 1, "text": "AI là hệ rộng hơn ML."}],
    )

    insight = pack["class_insights"][0]
    assert insight["source_pages"] == []
    assert insight["source_excerpt"] == ""
    assert insight["status"] == "needs_review"
    assert pack["status"] == "needs_review"


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
