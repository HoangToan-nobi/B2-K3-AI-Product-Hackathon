import re
import unicodedata
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.rag import RagDocument, RagRepository
from app.services.llm import LlmService
from app.services.lessons import LessonService
from app.services.rag_agent import RagAgent
from app.services.web_search import WebSearchService


STOPWORDS = {
    "anh",
    "ban",
    "bạn",
    "cho",
    "cua",
    "của",
    "duoc",
    "được",
    "gi",
    "gì",
    "giai",
    "giải",
    "hay",
    "hãy",
    "khong",
    "không",
    "la",
    "là",
    "nay",
    "này",
    "slide",
    "theo",
    "toi",
    "tôi",
    "trang",
    "ve",
    "về",
}


def _normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", text)


def _terms(text: str) -> set[str]:
    return {
        word
        for word in re.findall(r"[a-z0-9]+", _normalize(text))
        if (len(word) >= 3 or word == "ai") and word not in STOPWORDS
    }


def _score_document(doc: RagDocument, query_terms: set[str], selected_text: str | None) -> float:
    content = _normalize(f"{doc.title}\n{doc.content}")
    score = 0.0
    for term in query_terms:
        if term in content:
            score += 2.0 + min(content.count(term), 5) * 0.25
    if selected_text and _normalize(selected_text) in content:
        score += 8.0
    if score > 0 and doc.source_type == "slide":
        score += 0.5
    return score


def _truncate(text: str, limit: int = 1200) -> str:
    normalized = re.sub(r"\s+", " ", text).strip()
    return normalized[:limit].rstrip()


class ChatService:
    def __init__(self, session: AsyncSession | None):
        self.lesson_service = LessonService(session)
        self.rag_repository = RagRepository(session)
        self.llm_service = LlmService()
        self.web_search_service = WebSearchService()
        self.rag_agent = RagAgent(self.llm_service, self.web_search_service)

    async def reply(
        self,
        *,
        lesson_id: str,
        message: str,
        current_slide_page: int | None,
        selected_text: str | None,
    ) -> dict[str, Any]:
        lesson_id = self._canonical_lesson_id(lesson_id)
        question_id = await self.rag_repository.save_student_question(
            lesson_id=lesson_id,
            message=message,
            current_slide_page=current_slide_page,
            selected_text=selected_text,
        )
        pages = await self.rag_repository.list_slide_pages(lesson_id)
        if not pages:
            fallback_pages = await self.lesson_service.list_slide_pages(lesson_id)
            pages = [
                RagDocument(
                    source_type="slide",
                    source_id=f"runtime-slide-{page['pageNumber']}",
                    title=f"Slide {page['pageNumber']}",
                    page_number=page["pageNumber"],
                    content=page.get("textContent", ""),
                )
                for page in (fallback_pages or [])
                if page.get("textContent")
            ]
        if not pages:
            fallback_lesson_id = "day1-foundation"
            if lesson_id != fallback_lesson_id:
                pages = await self.rag_repository.list_slide_pages(fallback_lesson_id)
                lesson_id = fallback_lesson_id
        if not pages:
            return {
                "reply": "Em chưa tìm thấy text slide cho bài học này. Lab Coach hãy bấm Transcribe lại slide có sẵn hoặc upload lại PDF/PPTX để VLười đọc slide.",
                "citations": "",
                "context_sources": [],
            }

        target_pages: list[RagDocument]
        lower_msg = message.lower()

        if selected_text:
            matched = next((page for page in pages if selected_text in page.content), None)
            fallback = self._page_by_number(pages, current_slide_page or 1) or pages[0]
            target_pages = [matched or fallback]
        else:
            match = re.search(r"(?:trang|slide)\s+(\d+)", lower_msg)
            if match:
                page_num = int(match.group(1))
                explicit_page = [page for page in pages if page.page_number == page_num]
                ranked = self._rank_pages(pages, message, selected_text=None, limit=5)
                target_pages = self._dedupe_docs([*explicit_page, *ranked])
            elif "toàn bộ slide" in lower_msg or "toan bo slide" in lower_msg or "tom tat" in lower_msg:
                target_pages = self._rank_pages(pages, message, selected_text=None, limit=8)
                if not target_pages:
                    target_pages = pages[:8]
            else:
                ranked = self._rank_pages(pages, message, selected_text=None, limit=4)
                current_page = self._page_by_number(pages, current_slide_page or 1)
                target_pages = ranked if ranked else ([current_page] if current_page else [pages[0]])

        if not target_pages:
            return {"reply": "Không tìm thấy nội dung phù hợp trong slide cho câu hỏi này.", "citations": ""}

        query_terms = _terms(message)
        chat_docs = await self.rag_repository.search_chat_history(lesson_id, " ".join(query_terms), limit=3)
        transcript_docs = await self.rag_repository.search_transcripts(lesson_id, message, limit=2)
        expanded_pages = self._rank_pages(pages, message, selected_text=None, limit=12) or pages[:12]
        agent_result = await self.rag_agent.invoke(
            question=message,
            target_pages=target_pages,
            expanded_pages=expanded_pages,
            transcript_docs=transcript_docs,
            chat_docs=chat_docs,
        )
        if agent_result["reply"]:
            await self.rag_repository.update_student_question_answer_metadata(
                question_id=question_id,
                reply=agent_result["reply"],
                citations=agent_result.get("citations") or "",
                context_sources=agent_result.get("context_sources") or [],
            )
            return agent_result

        fallback_result = {
            "reply": self._extractive_answer(message=message, pages=target_pages),
            "citations": self._build_citations(target_pages),
            "context_sources": [],
        }
        await self.rag_repository.update_student_question_answer_metadata(
            question_id=question_id,
            reply=fallback_result["reply"],
            citations=fallback_result["citations"],
            context_sources=[],
        )
        return fallback_result

    @staticmethod
    def _page_by_number(pages: list[RagDocument], page_number: int) -> RagDocument | None:
        return next((page for page in pages if page.page_number == page_number), None)

    @staticmethod
    def _canonical_lesson_id(lesson_id: str) -> str:
        aliases = {
            "day1-lesson": "day1-foundation",
            "day2-lesson": "day2-prompting",
            "day3-lesson": "day3-rag",
            "day4-lesson": "day4-agents",
            "day5-lesson": "day5-product",
        }
        cleaned = (lesson_id or "").strip()
        if cleaned in {"", "undefined", "null", "none"}:
            return "day1-foundation"
        if cleaned.startswith("pack-"):
            cleaned = cleaned.removeprefix("pack-").rsplit("-", 1)[0]
        return aliases.get(cleaned, cleaned)

    def _rank_pages(
        self, pages: list[RagDocument], message: str, selected_text: str | None, limit: int
    ) -> list[RagDocument]:
        query_terms = _terms(message)
        ranked = sorted(
            (
                RagDocument(
                    source_type=page.source_type,
                    source_id=page.source_id,
                    title=page.title,
                    page_number=page.page_number,
                    content=page.content,
                    score=_score_document(page, query_terms, selected_text),
                )
                for page in pages
            ),
            key=lambda page: page.score,
            reverse=True,
        )
        positive = [page for page in ranked if page.score > 0]
        return positive[:limit]

    @staticmethod
    def _dedupe_docs(docs: list[RagDocument]) -> list[RagDocument]:
        seen: set[tuple[str, str]] = set()
        unique: list[RagDocument] = []
        for doc in docs:
            key = (doc.source_type, doc.source_id)
            if key in seen:
                continue
            seen.add(key)
            unique.append(doc)
        return unique

    @staticmethod
    def _is_insufficient_answer(answer: str | None) -> bool:
        if not answer:
            return True
        normalized = _normalize(answer)
        markers = [
            "chua du du lieu",
            "khong co thong tin",
            "khong tim thay",
            "du lieu chua du",
            "context nay khong",
            "context duoc cung cap khong",
            "ngoai pham vi",
            "chi co the tra loi dua tren",
            "khong du de tra loi",
        ]
        return any(marker in normalized for marker in markers)

    @staticmethod
    def _build_context(docs: list[RagDocument]) -> str:
        chunks = []
        for doc in docs[:12]:
            label = doc.title if doc.source_type == "slide" else f"{doc.title} ({doc.source_type})"
            chunks.append(f"[{label}]\n{_truncate(doc.content)}")
        return "\n\n".join(chunks)

    @staticmethod
    def _build_citations(pages: list[RagDocument]) -> str:
        page_numbers = []
        for page in pages:
            if page.page_number is not None and page.page_number not in page_numbers:
                page_numbers.append(page.page_number)
        return ", ".join(f"Slide {page}" for page in page_numbers)

    @staticmethod
    def _extractive_answer(*, message: str, pages: list[RagDocument]) -> str:
        if not pages:
            return "Em chưa tìm thấy nội dung liên quan trong slide để trả lời câu hỏi này."

        first = pages[0]
        text = _truncate(first.content, 1400)
        if "agenda" in _normalize(message):
            bullets = [
                line.strip("•- \t")
                for line in first.content.splitlines()
                if line.strip().startswith("•")
            ]
            if bullets:
                return "Agenda của buổi học gồm:\n" + "\n".join(f"- {item}" for item in bullets)

        return (
            f"Dựa trên {first.title}, nội dung liên quan là:\n{text}\n\n"
            "Bạn có thể hỏi rõ hơn theo trang hoặc theo một khái niệm cụ thể để em thu hẹp phần giải thích."
        )
