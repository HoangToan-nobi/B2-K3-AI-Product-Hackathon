import pytest

from app.repositories.rag import RagDocument
from app.services.chat import ChatService


@pytest.fixture
def anyio_backend():
    return "asyncio"


class _FakeRagRepository:
    def __init__(self) -> None:
        self.saved: list[dict] = []

    async def save_student_question(self, **kwargs) -> None:
        self.saved.append(kwargs)

    async def list_slide_pages(self, lesson_id: str) -> list[RagDocument]:
        return [
            RagDocument(
                source_type="slide",
                source_id="slide-3",
                title="Slide 3",
                page_number=3,
                content="[Slide 3]\nRAG là retrieval augmented generation.",
            )
        ]

    async def search_chat_history(self, *_args, **_kwargs) -> list[RagDocument]:
        return []

    async def search_transcripts(self, *_args, **_kwargs) -> list[RagDocument]:
        return []


class _FakeRagAgent:
    async def invoke(self, **_kwargs) -> dict:
        return {"reply": "Dựa trên Slide 3.", "citations": "Slide 3", "context_sources": []}


@pytest.mark.anyio
async def test_chat_reply_persists_student_question_with_slide_hint():
    service = ChatService(None)
    fake_repository = _FakeRagRepository()
    service.rag_repository = fake_repository
    service.rag_agent = _FakeRagAgent()

    response = await service.reply(
        lesson_id="day3-rag",
        message="RAG là gì?",
        current_slide_page=3,
        selected_text="RAG",
    )

    assert response["citations"] == "Slide 3"
    assert fake_repository.saved == [
        {
            "lesson_id": "day3-rag",
            "message": "RAG là gì?",
            "current_slide_page": 3,
            "selected_text": "RAG",
        }
    ]
