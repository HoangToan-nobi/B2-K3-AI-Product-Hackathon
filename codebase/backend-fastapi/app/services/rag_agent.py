from typing import Any, Literal, TypedDict

from langgraph.graph import END, START, StateGraph

from app.repositories.rag import RagDocument
from app.services.llm import LlmService
from app.services.web_search import WebSearchService


class RagAgentState(TypedDict, total=False):
    question: str
    route: Literal["slide_rag", "web_general"]
    target_pages: list[RagDocument]
    expanded_pages: list[RagDocument]
    transcript_docs: list[RagDocument]
    chat_docs: list[RagDocument]
    answer: str | None
    citations: str
    context_sources: list[dict[str, Any]]
    insufficient: bool


class RagAgent:
    def __init__(self, llm_service: LlmService, web_search_service: WebSearchService):
        self.llm_service = llm_service
        self.web_search_service = web_search_service
        self.graph = self._build_graph()

    async def invoke(
        self,
        *,
        question: str,
        target_pages: list[RagDocument],
        expanded_pages: list[RagDocument],
        transcript_docs: list[RagDocument],
        chat_docs: list[RagDocument],
    ) -> dict[str, Any]:
        state = await self.graph.ainvoke(
            {
                "question": question,
                "target_pages": target_pages,
                "expanded_pages": expanded_pages,
                "transcript_docs": transcript_docs,
                "chat_docs": chat_docs,
            }
        )
        return {
            "reply": state.get("answer") or "",
            "citations": state.get("citations") or "",
            "context_sources": state.get("context_sources") or [],
        }

    def _build_graph(self):
        workflow = StateGraph(RagAgentState)
        workflow.add_node("route_question", self._route_question)
        workflow.add_node("slide_rag", self._slide_rag)
        workflow.add_node("expand_rag", self._expand_rag)
        workflow.add_node("web_general", self._web_general)
        workflow.add_edge(START, "route_question")
        workflow.add_conditional_edges(
            "route_question",
            self._route_after_intent,
            {"slide_rag": "slide_rag", "web_general": "web_general"},
        )
        workflow.add_conditional_edges(
            "slide_rag",
            self._route_after_slide_answer,
            {"expand_rag": "expand_rag", "end": END},
        )
        workflow.add_conditional_edges(
            "expand_rag",
            self._route_after_expanded_answer,
            {"web_general": "web_general", "end": END},
        )
        workflow.add_edge("web_general", END)
        return workflow.compile()

    async def _route_question(self, state: RagAgentState) -> dict[str, Any]:
        question = state["question"].lower()
        route: Literal["slide_rag", "web_general"] = "web_general" if any(
            marker in question for marker in ["ngoài slide", "ngoài lề", "ngoai slide", "ngoai le"]
        ) else "slide_rag"
        return {"route": route}

    @staticmethod
    def _route_after_intent(state: RagAgentState) -> str:
        return state.get("route", "slide_rag")

    async def _slide_rag(self, state: RagAgentState) -> dict[str, Any]:
        docs = [*state.get("target_pages", []), *state.get("chat_docs", []), *state.get("transcript_docs", [])]
        answer = await self._answer_from_docs(state["question"], docs)
        insufficient = self._is_insufficient_answer(answer)
        return {
            "answer": answer,
            "insufficient": insufficient,
            "citations": self._build_citations(state.get("target_pages", [])),
            "context_sources": self._sources(docs),
        }

    @staticmethod
    def _route_after_slide_answer(state: RagAgentState) -> str:
        return "expand_rag" if state.get("insufficient") else "end"

    async def _expand_rag(self, state: RagAgentState) -> dict[str, Any]:
        docs = [*state.get("expanded_pages", []), *state.get("transcript_docs", [])]
        answer = await self._answer_from_docs(state["question"], docs)
        insufficient = self._is_insufficient_answer(answer)
        return {
            "answer": answer,
            "insufficient": insufficient,
            "citations": self._build_citations(state.get("expanded_pages", [])),
            "context_sources": self._sources(docs),
        }

    @staticmethod
    def _route_after_expanded_answer(state: RagAgentState) -> str:
        return "web_general" if state.get("insufficient") else "end"

    async def _web_general(self, state: RagAgentState) -> dict[str, Any]:
        web_results = await self.web_search_service.search(state["question"], limit=3)
        web_context = "\n".join(
            f"[{result.title}] {result.snippet}\nURL: {result.url}" for result in web_results
        )
        answer = await self.llm_service.answer_general(question=state["question"], web_context=web_context)
        return {
            "answer": answer or "Em chưa tìm được dữ liệu đủ tin cậy để trả lời câu này.",
            "insufficient": False,
            "citations": "Ngoài slide" + (f" · {', '.join(result.url for result in web_results)}" if web_results else ""),
            "context_sources": [
                {"type": "web", "title": result.title, "page_number": None, "source_id": result.url}
                for result in web_results
            ],
        }

    async def _answer_from_docs(self, question: str, docs: list[RagDocument]) -> str | None:
        try:
            return await self.llm_service.answer(question=question, context=self._build_context(docs))
        except Exception:
            return None

    @staticmethod
    def _build_context(docs: list[RagDocument]) -> str:
        chunks = []
        for doc in docs[:12]:
            text = " ".join(doc.content.split())[:1200]
            label = doc.title if doc.source_type == "slide" else f"{doc.title} ({doc.source_type})"
            chunks.append(f"[{label}]\n{text}")
        return "\n\n".join(chunks)

    @staticmethod
    def _build_citations(pages: list[RagDocument]) -> str:
        page_numbers: list[int] = []
        for page in pages:
            if page.page_number is not None and page.page_number not in page_numbers:
                page_numbers.append(page.page_number)
        return ", ".join(f"Slide {page}" for page in page_numbers)

    @staticmethod
    def _sources(docs: list[RagDocument]) -> list[dict[str, Any]]:
        return [
            {
                "type": doc.source_type,
                "title": doc.title,
                "page_number": doc.page_number,
                "source_id": doc.source_id,
            }
            for doc in docs
        ]

    @staticmethod
    def _is_insufficient_answer(answer: str | None) -> bool:
        if not answer:
            return True
        normalized = answer.lower()
        markers = [
            "chưa đủ dữ liệu",
            "không có thông tin",
            "không tìm thấy",
            "dữ liệu chưa đủ",
            "ngoài phạm vi",
            "chỉ có thể trả lời dựa trên",
            "không đủ để trả lời",
        ]
        return any(marker in normalized for marker in markers)
