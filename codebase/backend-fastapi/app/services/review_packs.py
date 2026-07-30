import json
import re
from copy import deepcopy
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.paths import EVAL_RUNS_DIR, LOCAL_DB_PATH, SHARED_DIR, get_lesson_mapping, get_pack_path, get_pdf_path
from app.repositories.review_packs import ReviewPackRepository
from app.services.lessons import LessonService
from app.services.llm import LlmService
from app.services.pdf_export import generate_review_pack_pdf
from app.services.slides import CHATLOG_PATH, ensure_slide_artifact, list_static_lesson_options, read_transcript_excerpt


def _pack_lesson_id(pack_id: str) -> str:
    return pack_id.removeprefix("pack-").rsplit("-", 1)[0]


def _default_local_db() -> dict[str, Any]:
    return {
        "active_lesson_id": "day1-foundation",
        "published_pack_ids": ["pack-day1-foundation-001"],
        "users": [
            {"id": "student-demo", "name": "Học viên demo", "role": "student"},
            {"id": "labcoach-demo", "name": "Lab Coach demo", "role": "labcoach"},
        ],
    }


class ReviewPackService:
    def __init__(self, session: AsyncSession | None):
        self.repository = ReviewPackRepository(session)
        self.lesson_service = LessonService(session)
        self.llm_service = LlmService()

    async def read_local_db(self) -> dict[str, Any]:
        try:
            users = await self.repository.list_users()
            if users:
                return {
                    "active_lesson_id": "day1-foundation",
                    "published_pack_ids": [],
                    "users": users,
                }
        except Exception:
            pass

        try:
            return json.loads(LOCAL_DB_PATH.read_text(encoding="utf-8"))
        except Exception:
            return _default_local_db()

    async def read_review_pack(self, lesson_id: str = "day1-foundation") -> dict[str, Any]:
        try:
            db_pack = await self.repository.read_pack(lesson_id)
            if db_pack:
                return db_pack
        except Exception:
            pass

        return json.loads(get_pack_path(lesson_id).read_text(encoding="utf-8"))

    def filter_pack_for_role(self, pack: dict[str, Any], role: str) -> dict[str, Any]:
        if role == "labcoach":
            return pack
        visible = deepcopy(pack)
        visible["status"] = "ready"
        visible["warnings"] = []
        visible["summary"] = [item for item in visible["summary"] if item.get("status") == "ready"]
        visible["class_insights"] = [
            item for item in visible["class_insights"] if item.get("status") == "ready"
        ]
        visible["review_questions"] = [
            item for item in visible["review_questions"] if item.get("status") == "ready"
        ]
        return visible

    async def create_review_pack(self, lesson_id: str | None, run_pipeline: bool) -> dict[str, Any]:
        db = await self.read_local_db()
        mapping = await self._lesson_mapping(lesson_id or db["active_lesson_id"])
        if run_pipeline:
            pack, job = await self._generate_pack_with_ai(mapping)
        else:
            pack = await self.read_review_pack(mapping["lesson_id"])
            job = {"mode": "existing_artifact"}
        return {
            "pack": pack,
            "job": job,
            "lesson_mapping": mapping,
        }

    async def update_review_pack_item(self, pack_id: str, item_id: str, action: str) -> dict[str, Any]:
        try:
            db_pack = await self.repository.update_item(pack_id, item_id, action)
            if db_pack:
                return db_pack
        except Exception:
            pass

        lesson_id = _pack_lesson_id(pack_id)
        pack = await self.read_review_pack(lesson_id)
        target = None
        for section in ("summary", "class_insights", "review_questions"):
            for item in pack[section]:
                if item.get("id") == item_id:
                    target = item
                    break
            if target:
                break

        if target is None:
            raise ValueError(f"Unknown item_id: {item_id}")

        if action == "approve":
            target["status"] = "ready"
        elif action == "drop":
            for section in ("summary", "class_insights", "review_questions"):
                pack[section] = [item for item in pack[section] if item.get("id") != item_id]

        SHARED_DIR.mkdir(parents=True, exist_ok=True)
        get_pack_path(lesson_id).write_text(json.dumps(pack, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return pack

    async def export_review_pack_pdf(self, pack_id: str, role: str = "labcoach") -> tuple[bytes, str, str]:
        lesson_id = _pack_lesson_id(pack_id)
        pack = self.filter_pack_for_role(await self.read_review_pack(lesson_id), role)
        bytes_ = generate_review_pack_pdf(pack)
        output_path = get_pdf_path(pack_id)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(bytes_)
        return bytes_, f"{pack_id}.pdf", str(output_path)

    def list_artifacts(self, lesson_id: str = "day1-foundation") -> dict[str, str]:
        return {
            "slide": str(SHARED_DIR / f"slide-{lesson_id}.json"),
            "questions": str(SHARED_DIR / f"questions-{lesson_id}.json"),
            "clusters": str(SHARED_DIR / f"clusters-{lesson_id}.json"),
            "generated": str(SHARED_DIR / f"generated-{lesson_id}.json"),
            "review_pack": str(get_pack_path(lesson_id)),
            "eval_runs": str(EVAL_RUNS_DIR),
        }

    async def list_lesson_cards(self, role: str) -> list[dict[str, Any]]:
        lessons = []
        for lesson in await self.lesson_service.list_lessons():
            lesson_id = lesson["id"]
            if not self._visible_lesson(lesson):
                continue
            pack_path = get_pack_path(lesson_id)
            pack_id = f"pack-{lesson_id}-001"
            status = "missing"
            if pack_path.exists():
                try:
                    pack = self.filter_pack_for_role(json.loads(pack_path.read_text(encoding="utf-8")), role)
                    status = pack.get("status", "ready")
                    pack_id = pack.get("pack_id", pack_id)
                except Exception:
                    status = "missing"
            lessons.append(
                {
                    "id": lesson_id,
                    "title": lesson["title"],
                    "slide_count": lesson["slideDecks"][0]["pageCount"],
                    "pack_id": pack_id,
                    "status": status,
                }
            )
        return lessons

    @staticmethod
    def _visible_lesson(lesson: dict[str, Any]) -> bool:
        lesson_id = str(lesson.get("id") or "")
        title = str(lesson.get("title") or "").lower()
        if re.fullmatch(r"day[1-5]-lesson", lesson_id):
            return False
        if title.startswith("debug ") or " smoke" in title:
            return False
        return bool(lesson.get("slideDecks"))

    async def _lesson_mapping(self, lesson_id: str) -> dict[str, Any]:
        try:
            return get_lesson_mapping(lesson_id)
        except ValueError:
            lessons = await self.lesson_service.list_lessons()
            lesson = next((item for item in lessons if item["id"] == lesson_id), None)
            if not lesson:
                raise
            deck = lesson["slideDecks"][0] if lesson.get("slideDecks") else {"pageCount": 0}
            return {
                "lesson_id": lesson_id,
                "title": lesson["title"],
                "slide_pdf": deck.get("storageKey", ""),
                "chatlog_csv": "",
                "day_codes": [],
                "max_page": deck.get("pageCount") or 0,
                "mapping_signals": ["uploaded lesson slide pages from DB"],
            }

    async def _generate_pack_with_ai(self, mapping: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
        lesson_id = mapping["lesson_id"]
        slide = await self._slide_payload(lesson_id)
        slide_context = self._slide_context(slide)
        transcript_context = self._safe_transcript_excerpt(lesson_id)
        chat_questions = await self._chat_questions_for_lesson(mapping)
        chat_context = "\n".join(self._format_chat_context_item(item) for item in chat_questions[:28])
        generated: dict[str, Any] | None = None
        job: dict[str, Any] = {"mode": "ai_generated"}
        try:
            generated = await self.llm_service.generate_review_pack(
                lesson_title=mapping["title"],
                slide_context=slide_context,
                transcript_context=transcript_context,
                chat_context=chat_context,
            )
        except Exception as exc:
            job = {"mode": "ai_failed_fallback", "error": exc.__class__.__name__}

        pack = self._normalize_generated_pack(
            lesson_id=lesson_id,
            title=mapping["title"],
            slide_count=int(slide["page_count"]),
            generated=generated,
            chat_questions=chat_questions,
            slide_pages=slide.get("pages", []),
        )
        output_path = get_pack_path(lesson_id)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return pack, job

    async def _slide_payload(self, lesson_id: str) -> dict[str, Any]:
        try:
            return ensure_slide_artifact(lesson_id)
        except Exception:
            pages = await self.lesson_service.list_slide_pages(lesson_id) or []
            return {
                "lesson_id": lesson_id,
                "source_pdf": "",
                "page_count": len(pages),
                "pages": [
                    {"page": page["pageNumber"], "text": page.get("textContent", "")}
                    for page in pages
                    if page.get("textContent")
                ],
            }

    @staticmethod
    def _safe_transcript_excerpt(lesson_id: str) -> str:
        try:
            return read_transcript_excerpt(lesson_id)
        except Exception:
            return ""

    @staticmethod
    def _slide_context(slide: dict[str, Any], limit: int = 6500) -> str:
        chunks = []
        for page in slide.get("pages", []):
            text = re.sub(r"\s+", " ", page.get("text", "")).strip()
            if text:
                chunks.append(f"[Slide {page['page']}] {text[:900]}")
        return "\n".join(chunks)[:limit]

    async def _chat_questions_for_lesson(self, mapping: dict[str, Any]) -> list[dict[str, Any]]:
        runtime_questions: list[dict[str, Any]] = []
        try:
            runtime_questions = await self.repository.list_student_questions(mapping["lesson_id"])
        except Exception:
            runtime_questions = []
        csv_questions = self._csv_chat_questions_for_lesson(mapping)

        seen: set[tuple[int | None, str]] = set()
        merged: list[dict[str, Any]] = []
        for item in [*runtime_questions, *csv_questions]:
            content = re.sub(r"\s+", " ", str(item.get("content") or "")).strip()
            if len(content) < 8:
                continue
            key = (item.get("source_page"), content.lower())
            if key in seen:
                continue
            seen.add(key)
            merged.append({**item, "content": content})
        return merged

    @staticmethod
    def _csv_chat_questions_for_lesson(mapping: dict[str, Any]) -> list[dict[str, Any]]:
        if not CHATLOG_PATH.exists():
            return []
        import csv

        day_codes = set(mapping.get("day_codes") or [])
        rows: list[dict[str, Any]] = []
        with CHATLOG_PATH.open(encoding="utf-8") as file:
            for row in csv.DictReader(file):
                if row.get("role") != "student":
                    continue
                content = (row.get("content") or "").strip()
                if len(content) < 8:
                    continue
                day_code = row.get("day_code") or ""
                if day_codes and day_code not in day_codes:
                    page_match = re.search(r"Trang\s+(\d+)", content, flags=re.IGNORECASE)
                    if not page_match:
                        continue
                page_match = re.search(r"Trang\s+(\d+)", content, flags=re.IGNORECASE)
                rows.append(
                    {
                        "user_id": row.get("user_id") or "",
                        "content": content,
                        "source_page": int(page_match.group(1)) if page_match else None,
                        "source": "csv",
                    }
                )
        return rows

    @staticmethod
    def _format_chat_context_item(item: dict[str, Any]) -> str:
        page = item.get("source_page")
        prefix = f"[Slide {page}] " if page else ""
        return f"- {prefix}{item['content']}"

    def _normalize_generated_pack(
        self,
        *,
        lesson_id: str,
        title: str,
        slide_count: int,
        generated: dict[str, Any] | None,
        chat_questions: list[dict[str, Any]],
        slide_pages: list[dict[str, Any]],
    ) -> dict[str, Any]:
        fallback = self._fallback_generated(slide_pages, chat_questions)
        data = generated if isinstance(generated, dict) else fallback
        summary = [self._summary_item(item, index, slide_pages) for index, item in enumerate((data.get("summary") or fallback["summary"])[:6], start=1)]
        insights = [
            self._insight_item(item, index, slide_pages)
            for index, item in enumerate((data.get("class_insights") or fallback["class_insights"])[:6], start=1)
        ]
        questions = [
            self._question_item(item, index, slide_pages)
            for index, item in enumerate((data.get("review_questions") or fallback["review_questions"])[:6], start=1)
        ]
        needs_review = [item["id"] for item in [*summary, *insights, *questions] if item["status"] == "needs_review"]
        return {
            "schema_version": "1.0",
            "pack_id": f"pack-{lesson_id}-001",
            "status": "needs_review" if needs_review else "ready",
            "lesson": {"id": lesson_id, "title": title, "slide_count": slide_count},
            "analysis": {
                "student_question_count": len(chat_questions),
                "unique_user_count": len({item["user_id"] for item in chat_questions if item.get("user_id")}),
                "cluster_count": len(insights),
                "included_cluster_count": len([item for item in insights if item["status"] == "ready"]),
                "excluded_noise_count": 0,
            },
            "summary": summary,
            "class_insights": insights,
            "review_questions": questions,
            "warnings": [
                {"code": "LOW_CONFIDENCE", "message": "Một số mục cần Lab Coach đối chiếu slide trước khi phát hành.", "item_ids": needs_review}
            ] if needs_review else [],
            "generated_at": "2026-07-30T00:00:00+00:00",
        }

    @staticmethod
    def _safe_pages(value: Any, slide_pages: list[dict[str, Any]]) -> list[int]:
        pages = [int(page) for page in value if isinstance(page, int | float) or str(page).isdigit()] if isinstance(value, list) else []
        max_page = max([int(page.get("page", 1)) for page in slide_pages] or [1])
        valid = [page for page in pages if 1 <= page <= max_page]
        return valid[:4] or [1]

    @staticmethod
    def _excerpt(pages: list[int], slide_pages: list[dict[str, Any]], provided: Any = "") -> str:
        if isinstance(provided, str) and provided.strip():
            return provided.strip()[:500]
        page = next((item for item in slide_pages if int(item.get("page", 0)) == pages[0]), None)
        return re.sub(r"\s+", " ", (page or {}).get("text", "")).strip()[:500]

    def _summary_item(self, item: dict[str, Any], index: int, slide_pages: list[dict[str, Any]]) -> dict[str, Any]:
        pages = self._safe_pages(item.get("source_pages"), slide_pages)
        confidence = float(item.get("confidence") or 0.65)
        return {
            "id": f"summary-{index:02d}",
            "title": str(item.get("title") or f"Ý chính {index}")[:160],
            "content": str(item.get("content") or "")[:900],
            "source_pages": pages,
            "source_excerpt": self._excerpt(pages, slide_pages, item.get("source_excerpt")),
            "confidence": confidence,
            "status": "ready" if confidence >= 0.72 else "needs_review",
        }

    def _insight_item(self, item: dict[str, Any], index: int, slide_pages: list[dict[str, Any]]) -> dict[str, Any]:
        pages = self._safe_pages(item.get("source_pages"), slide_pages)
        confidence = float(item.get("confidence") or 0.6)
        questions = item.get("representative_questions") if isinstance(item.get("representative_questions"), list) else []
        return {
            "id": f"insight-cluster-{index:02d}",
            "topic": str(item.get("topic") or f"Blindspot {index}")[:160],
            "common_confusion": str(item.get("common_confusion") or "")[:700],
            "correct_understanding": str(item.get("correct_understanding") or "")[:900],
            "source_pages": pages,
            "source_excerpt": self._excerpt(pages, slide_pages, item.get("source_excerpt")),
            "confidence": confidence,
            "status": "ready" if confidence >= 0.72 else "needs_review",
            "unique_user_count": int(item.get("unique_user_count") or 1),
            "question_count": int(item.get("question_count") or max(1, len(questions))),
            "representative_questions": [str(question)[:260] for question in questions[:5]],
        }

    def _question_item(self, item: dict[str, Any], index: int, slide_pages: list[dict[str, Any]]) -> dict[str, Any]:
        pages = self._safe_pages(item.get("source_pages"), slide_pages)
        confidence = float(item.get("confidence") or 0.65)
        options = item.get("options") if isinstance(item.get("options"), list) and len(item.get("options")) >= 2 else ["Đúng", "Sai"]
        answer = str(item.get("answer") or options[int(item.get("correct_option") or 0)])
        return {
            "id": f"question-{index:02d}",
            "type": "multiple_choice",
            "question": str(item.get("question") or f"Câu hỏi {index}")[:260],
            "options": [str(option)[:180] for option in options[:4]],
            "correct_option": int(item.get("correct_option") or 0),
            "answer": answer[:240],
            "explanation": str(item.get("explanation") or "")[:700],
            "source_pages": pages,
            "source_excerpt": self._excerpt(pages, slide_pages, item.get("source_excerpt")),
            "confidence": confidence,
            "status": "ready" if confidence >= 0.72 else "needs_review",
        }

    @staticmethod
    def _fallback_generated(slide_pages: list[dict[str, Any]], chat_questions: list[dict[str, Any]]) -> dict[str, Any]:
        useful_pages = [page for page in slide_pages if page.get("text")][:6]
        summary = [
            {
                "title": f"Nội dung trọng tâm slide {page['page']}",
                "content": re.sub(r"\s+", " ", page["text"]).strip()[:520],
                "source_pages": [int(page["page"])],
                "source_excerpt": re.sub(r"\s+", " ", page["text"]).strip()[:360],
                "confidence": 0.55,
            }
            for page in useful_pages[:5]
        ]
        representatives = [item["content"] for item in chat_questions[:5]]
        return {
            "summary": summary,
            "class_insights": [
                {
                    "topic": "Các câu hỏi học viên cần Lab Coach phân loại",
                    "common_confusion": "Backend chưa nhận được JSON hợp lệ từ AI nên chỉ gom câu hỏi tiêu biểu để duyệt.",
                    "correct_understanding": "Lab Coach cần chạy lại DeepSeek hoặc duyệt thủ công dựa trên slide.",
                    "source_pages": [1],
                    "source_excerpt": summary[0]["source_excerpt"] if summary else "",
                    "confidence": 0.4,
                    "unique_user_count": len({item["user_id"] for item in chat_questions if item.get("user_id")}) or 1,
                    "question_count": len(chat_questions),
                    "representative_questions": representatives,
                }
            ],
            "review_questions": [],
        }
