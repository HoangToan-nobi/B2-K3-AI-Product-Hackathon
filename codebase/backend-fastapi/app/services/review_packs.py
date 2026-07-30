import json
import re
from copy import deepcopy
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.paths import EVAL_RUNS_DIR, LOCAL_DB_PATH, SHARED_DIR, get_lesson_mapping, get_pack_path
from app.repositories.review_packs import ReviewPackRepository
from app.services.cloud_storage import CloudStorageService
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
        self.storage = CloudStorageService()

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

    async def create_review_pack(
        self,
        lesson_id: str | None,
        run_pipeline: bool,
        progress: Any | None = None,
    ) -> dict[str, Any]:
        await self._emit_progress(
            progress,
            4,
            "Chuẩn bị ngày học",
            "VLười đang tìm đúng ngày học và bộ slide Lab Coach đã chọn.",
        )
        db = await self.read_local_db()
        mapping = await self._lesson_mapping(lesson_id or db["active_lesson_id"])
        if run_pipeline:
            pack, job = await self._generate_pack_with_ai(mapping, progress=progress)
        else:
            await self._emit_progress(
                progress,
                45,
                "Mở tài liệu có sẵn",
                "VLười đang mở bản tổng hợp đã tạo trước đó.",
            )
            pack = await self.read_review_pack(mapping["lesson_id"])
            job = {"mode": "existing_artifact"}
        await self._emit_progress(
            progress,
            96,
            "Chuẩn bị kết quả",
            "VLười đang sắp xếp tài liệu để giao diện hiển thị bản mới nhất.",
        )
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
        filename = f"{pack_id}.pdf"
        asset = self.storage.upload_bytes(
            data=bytes_,
            filename=filename,
            folder="exports",
            mime_type="application/pdf",
            public_id=filename,
        )
        return bytes_, filename, asset.url

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

    async def _generate_pack_with_ai(
        self,
        mapping: dict[str, Any],
        progress: Any | None = None,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        lesson_id = mapping["lesson_id"]
        await self._emit_progress(
            progress,
            12,
            "Đọc nội dung slide",
            "VLười đang lấy chữ trên từng trang slide để xác định kiến thức chính.",
        )
        slide = await self._slide_payload(lesson_id)
        slide_context = self._slide_context(slide)
        await self._emit_progress(
            progress,
            24,
            "Đọc transcript buổi học",
            "VLười đang kiểm tra phần lời giảng hoặc ghi chú đi kèm nếu có.",
        )
        transcript_context = self._safe_transcript_excerpt(lesson_id)
        await self._emit_progress(
            progress,
            36,
            "Thu thập câu hỏi học viên",
            "VLười đang gom các câu hỏi thật từ chatlog để biết lớp hay vướng ở đâu.",
        )
        chat_questions = await self._chat_questions_for_lesson(mapping)
        await self._emit_progress(
            progress,
            48,
            "Lọc câu hỏi trùng lặp",
            "VLười đang gộp các câu hỏi giống nhau và giữ lại những câu đại diện nhất.",
            detail=f"Đã tìm thấy {len(chat_questions)} câu hỏi phù hợp.",
        )
        selected_chat_questions = self._select_chat_context_questions(chat_questions)
        chat_context = "\n".join(self._format_chat_context_item(item) for item in selected_chat_questions)
        generated: dict[str, Any] | None = None
        job: dict[str, Any] = {"mode": "ai_generated"}
        try:
            await self._emit_progress(
                progress,
                62,
                "Tổng hợp kiến thức trọng tâm",
                "VLười đang viết lại nội dung ôn tập bằng tiếng Việt có dấu, bám sát slide và câu hỏi của lớp.",
            )
            generated = await self.llm_service.generate_review_pack(
                lesson_title=mapping["title"],
                slide_context=slide_context,
                transcript_context=transcript_context,
                chat_context=chat_context,
            )
        except Exception as exc:
            job = {"mode": "ai_failed_fallback", "error": exc.__class__.__name__}
            await self._emit_progress(
                progress,
                74,
                "Dùng bản dự phòng",
                "VLười chưa tạo được bản AI ổn định, nên đang chuẩn bị bản nháp an toàn từ dữ liệu đã có.",
            )

        await self._emit_progress(
            progress,
            82,
            "Kiểm tra nguồn tham chiếu",
            "VLười đang gắn số trang slide để Lab Coach dễ kiểm tra lại từng ý.",
        )
        pack = self._normalize_generated_pack(
            lesson_id=lesson_id,
            title=mapping["title"],
            slide_count=int(slide["page_count"]),
            generated=generated,
            chat_questions=chat_questions,
            slide_pages=slide.get("pages", []),
        )
        await self._emit_progress(
            progress,
            92,
            "Lưu bản nháp",
            "VLười đang lưu tài liệu ôn tập để Lab Coach duyệt và xuất PDF khi cần.",
        )
        output_path = get_pack_path(lesson_id)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return pack, job

    @staticmethod
    async def _emit_progress(
        progress: Any | None,
        percent: int,
        step: str,
        message: str,
        detail: str | None = None,
    ) -> None:
        if progress is None:
            return
        await progress.emit(percent=percent, step=step, message=message, detail=detail)

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
    def _slide_context(slide: dict[str, Any], limit: int = 24000) -> str:
        chunks = []
        for page in slide.get("pages", []):
            text = re.sub(r"\s+", " ", page.get("text", "")).strip()
            if text:
                chunks.append(f"[Slide {page['page']}] {text[:1400]}")
        return "\n".join(chunks)[:limit]

    async def _chat_questions_for_lesson(self, mapping: dict[str, Any]) -> list[dict[str, Any]]:
        runtime_questions: list[dict[str, Any]] = []
        try:
            runtime_questions = await self.repository.list_student_questions(mapping["lesson_id"])
        except Exception:
            runtime_questions = []
        if runtime_questions:
            return self._dedupe_chat_questions(runtime_questions)
        csv_questions = self._csv_chat_questions_for_lesson(mapping)

        return self._dedupe_chat_questions(csv_questions)

    @staticmethod
    def _dedupe_chat_questions(questions: list[dict[str, Any]]) -> list[dict[str, Any]]:
        seen: set[tuple[int | None, str]] = set()
        merged: list[dict[str, Any]] = []
        for item in questions:
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

    @staticmethod
    def _select_chat_context_questions(questions: list[dict[str, Any]], limit: int = 60) -> list[dict[str, Any]]:
        selected: list[dict[str, Any]] = []
        seen_users: set[str] = set()
        seen_pages: set[int] = set()

        with_page = [item for item in questions if item.get("source_page")]
        without_page = [item for item in questions if not item.get("source_page")]
        for item in sorted(with_page, key=lambda value: (int(value.get("source_page") or 999), value.get("user_id") or "")):
            user_id = str(item.get("user_id") or "")
            page = int(item.get("source_page") or 0)
            if user_id in seen_users and page in seen_pages:
                continue
            selected.append(item)
            if user_id:
                seen_users.add(user_id)
            seen_pages.add(page)
            if len(selected) >= limit:
                return selected

        for item in without_page:
            user_id = str(item.get("user_id") or "")
            if user_id and user_id in seen_users:
                continue
            selected.append(item)
            if user_id:
                seen_users.add(user_id)
            if len(selected) >= limit:
                return selected

        selected_keys = {(item.get("source_page"), item.get("content")) for item in selected}
        for item in questions:
            key = (item.get("source_page"), item.get("content"))
            if key in selected_keys:
                continue
            selected.append(item)
            selected_keys.add(key)
            if len(selected) >= limit:
                break
        return selected

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
        raw_summary = data["summary"] if isinstance(data.get("summary"), list) else fallback["summary"]
        raw_insights = data["class_insights"] if isinstance(data.get("class_insights"), list) else fallback["class_insights"]
        raw_questions = data["review_questions"] if isinstance(data.get("review_questions"), list) else fallback["review_questions"]
        summary = [self._summary_item(item, index, slide_pages) for index, item in enumerate(raw_summary[:6], start=1)]
        insights = [
            self._insight_item(item, index, slide_pages)
            for index, item in enumerate(raw_insights[:6], start=1)
        ]
        if len(raw_questions) < 3:
            raw_questions = [
                *raw_questions,
                *self._fallback_quiz_items(raw_summary, raw_insights, slide_pages, limit=5 - len(raw_questions)),
            ]
        questions = [
            self._question_item(item, index, slide_pages)
            for index, item in enumerate(raw_questions[:5], start=1)
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
        source_excerpt = self._excerpt(pages, slide_pages, item.get("source_excerpt"))
        is_grounded_in_slide = bool(source_excerpt.strip())
        return {
            "id": f"summary-{index:02d}",
            "title": str(item.get("title") or f"Ý chính {index}")[:160],
            "content": str(item.get("content") or "")[:900],
            "source_pages": pages,
            "source_excerpt": source_excerpt,
            "confidence": confidence,
            "status": "ready" if is_grounded_in_slide else "needs_review",
        }

    def _insight_item(self, item: dict[str, Any], index: int, slide_pages: list[dict[str, Any]]) -> dict[str, Any]:
        pages = self._safe_pages(item.get("source_pages"), slide_pages)
        confidence = float(item.get("confidence") or 0.6)
        questions = item.get("representative_questions") if isinstance(item.get("representative_questions"), list) else []
        return {
            "id": f"insight-cluster-{index:02d}",
            "topic": str(item.get("topic") or f"Câu hỏi học viên {index}")[:160],
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
        source_excerpt = self._excerpt(pages, slide_pages, item.get("source_excerpt"))
        options = item.get("options") if isinstance(item.get("options"), list) and len(item.get("options")) >= 2 else ["Đúng", "Sai", "Không đủ dữ liệu", "Tất cả đều sai"]
        correct_option = int(item.get("correct_option") or 0)
        if correct_option < 0 or correct_option >= len(options):
            correct_option = 0
        answer = str(item.get("answer") or options[correct_option])
        return {
            "id": f"question-{index:02d}",
            "type": "multiple_choice",
            "question": str(item.get("question") or f"Câu hỏi {index}")[:260],
            "options": [str(option)[:180] for option in options[:4]],
            "correct_option": correct_option,
            "answer": answer[:240],
            "explanation": str(item.get("explanation") or "")[:700],
            "source_pages": pages,
            "source_excerpt": source_excerpt,
            "confidence": confidence,
            "status": "ready" if source_excerpt.strip() else "needs_review",
        }

    @staticmethod
    def _fallback_generated(slide_pages: list[dict[str, Any]], chat_questions: list[dict[str, Any]]) -> dict[str, Any]:
        summary = ReviewPackService._fallback_summary_from_all_slides(slide_pages)
        class_insights = ReviewPackService._fallback_insights_from_chat(slide_pages, chat_questions)
        review_questions = ReviewPackService._fallback_quiz_items(summary, class_insights, slide_pages, limit=5)

        return {
            "summary": summary,
            "class_insights": class_insights,
            "review_questions": review_questions,
        }

    @staticmethod
    def _fallback_quiz_items(
        summary_items: list[dict[str, Any]],
        insight_items: list[dict[str, Any]],
        slide_pages: list[dict[str, Any]],
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        quiz_items: list[dict[str, Any]] = []
        for item in summary_items[: max(0, limit)]:
            title = str(item.get("title") or "kiến thức trọng tâm").strip()
            content = re.sub(r"\s+", " ", str(item.get("content") or "")).strip()
            if not content:
                continue
            pages = item.get("source_pages") if isinstance(item.get("source_pages"), list) else [1]
            quiz_items.append(
                {
                    "question": f"Ý nào mô tả đúng nhất về {title}?",
                    "options": [
                        content[:170],
                        "Đây là nội dung logistics của lớp, không liên quan kiến thức bài học.",
                        "Đây là ví dụ ngoài slide và không cần dùng khi ôn tập.",
                        "Đây là câu hỏi mở, không có đáp án kiểm chứng từ slide.",
                    ],
                    "correct_option": 0,
                    "answer": content[:220],
                    "explanation": f"Đáp án đúng vì bám vào mục kiến thức trọng tâm: {content[:300]}",
                    "source_pages": pages,
                    "source_excerpt": item.get("source_excerpt") or ReviewPackService._excerpt(pages, slide_pages),
                    "confidence": 0.78,
                }
            )
            if len(quiz_items) >= limit:
                return quiz_items

        for item in insight_items[: max(0, limit - len(quiz_items))]:
            question = re.sub(r"\s+", " ", str(item.get("common_confusion") or item.get("topic") or "")).strip()
            answer = re.sub(r"\s+", " ", str(item.get("correct_understanding") or "")).strip()
            if not question or not answer:
                continue
            pages = item.get("source_pages") if isinstance(item.get("source_pages"), list) else [1]
            quiz_items.append(
                {
                    "question": f"Khi học viên hỏi: “{question[:140]}”, câu trả lời nào đúng nhất?",
                    "options": [
                        answer[:170],
                        "Nên bỏ qua vì câu hỏi từ chatlog không liên quan bài học.",
                        "Chỉ cần trả lời theo kinh nghiệm, không cần đối chiếu slide.",
                        "Không thể trả lời bằng bất kỳ phần nào của bài học.",
                    ],
                    "correct_option": 0,
                    "answer": answer[:220],
                    "explanation": f"Đáp án đúng vì câu hỏi này đã được giải thích trong phần học viên hay hỏi: {answer[:300]}",
                    "source_pages": pages,
                    "source_excerpt": item.get("source_excerpt") or ReviewPackService._excerpt(pages, slide_pages),
                    "confidence": 0.74,
                }
            )
            if len(quiz_items) >= limit:
                break
        return quiz_items[:limit]

    @staticmethod
    def _fallback_insights_from_chat(
        slide_pages: list[dict[str, Any]],
        chat_questions: list[dict[str, Any]],
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        insights: list[dict[str, Any]] = []
        selected = ReviewPackService._select_chat_context_questions(chat_questions, limit=limit)
        for index, question in enumerate(selected, start=1):
            content = re.sub(r"\s+", " ", str(question.get("content") or "")).strip()
            if not content:
                continue
            source_page = question.get("source_page")
            page = ReviewPackService._page_for_question(slide_pages, source_page)
            page_number = int(page.get("page") or source_page or 1)
            excerpt = re.sub(r"\s+", " ", str(page.get("text") or "")).strip()[:500]
            answer = ReviewPackService._fallback_answer_from_excerpt(content, excerpt)
            insights.append(
                {
                    "topic": content[:160],
                    "common_confusion": content[:700],
                    "correct_understanding": answer,
                    "source_pages": [page_number],
                    "source_excerpt": excerpt,
                    "confidence": 0.68,
                    "unique_user_count": 1,
                    "question_count": 1,
                    "representative_questions": [content],
                }
            )
        return insights

    @staticmethod
    def _page_for_question(slide_pages: list[dict[str, Any]], source_page: Any) -> dict[str, Any]:
        if str(source_page or "").isdigit():
            page_number = int(source_page)
            matched = next((page for page in slide_pages if int(page.get("page") or 0) == page_number), None)
            if matched:
                return matched
        return next((page for page in slide_pages if page.get("text")), {"page": 1, "text": ""})

    @staticmethod
    def _fallback_answer_from_excerpt(question: str, excerpt: str) -> str:
        if not excerpt:
            return (
                "Trả lời gợi ý: Câu hỏi này cần Lab Coach đối chiếu lại với slide trước khi phát hành.\n"
                "Giải thích: VLười chưa tìm thấy đoạn slide đủ rõ để tự xác nhận câu trả lời."
            )
        compact_excerpt = excerpt[:360].rstrip()
        return (
            f"Trả lời gợi ý: Nội dung liên quan nằm ở đoạn slide: {compact_excerpt}.\n"
            "Giải thích: Đây là câu hỏi thật từ học viên, nên Lab Coach cần kiểm tra xem câu trả lời gợi ý đã bám đúng slide và đủ dễ hiểu chưa."
        )

    @staticmethod
    def _fallback_summary_from_all_slides(slide_pages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        pages = [
            {
                "page": int(page.get("page") or 0),
                "text": re.sub(r"\s+", " ", str(page.get("text") or "")).strip(),
            }
            for page in slide_pages
            if page.get("text")
        ]
        if not pages:
            return []

        theme_specs = [
            (
                "Bức tranh AI, GenAI và LLM",
                ("AI", "Machine Learning", "Deep Learning", "Generative AI", "LLM", "Discriminative", "Agentic"),
            ),
            (
                "LLM vận hành bằng token, context và attention",
                ("LLM", "Transformer", "token", "context", "attention", "đoán", "xác suất"),
            ),
            (
                "Huấn luyện và căn chỉnh model",
                ("pre-training", "SFT", "RLHF", "DPO", "tham số", "scaling", "MoE", "luyện suy luận"),
            ),
            (
                "Giới hạn của model và cách kiểm chứng",
                ("hallucination", "bong bóng", "giới hạn", "sai", "đường tắt", "benchmark", "Chain-of-Thought"),
            ),
            (
                "Từ LLM đến agent và lựa chọn model",
                ("agent", "tools", "memory", "action", "model", "chi phí", "API", "temperature", "top_p", "prompt"),
            ),
        ]

        selected: list[dict[str, Any]] = []
        used_pages: set[int] = set()
        for title, keywords in theme_specs:
            matched = ReviewPackService._pages_matching_theme(pages, keywords, used_pages)
            if not matched:
                continue
            used_pages.update(page["page"] for page in matched)
            selected.append(
                {
                    "title": title,
                    "content": ReviewPackService._compose_theme_summary(matched),
                    "source_pages": [page["page"] for page in matched[:4]],
                    "source_excerpt": matched[0]["text"][:360],
                    "confidence": 0.78,
                }
            )
            if len(selected) >= 5:
                break

        if len(selected) < 5:
            remaining = [page for page in pages if page["page"] not in used_pages]
            for page in sorted(remaining, key=lambda item: ReviewPackService._fallback_page_score(item), reverse=True):
                selected.append(
                    {
                        "title": ReviewPackService._page_heading(page),
                        "content": page["text"][:520],
                        "source_pages": [page["page"]],
                        "source_excerpt": page["text"][:360],
                        "confidence": 0.74,
                    }
                )
                if len(selected) >= 5:
                    break

        return selected

    @staticmethod
    def _pages_matching_theme(pages: list[dict[str, Any]], keywords: tuple[str, ...], used_pages: set[int]) -> list[dict[str, Any]]:
        keyword_lowers = tuple(keyword.lower() for keyword in keywords)
        matches = []
        for page in pages:
            text = page["text"].lower()
            score = sum(1 for keyword in keyword_lowers if keyword in text)
            if score:
                matches.append((score, page))
        matches.sort(key=lambda item: (-item[0], item[1]["page"] in used_pages, item[1]["page"]))
        return [page for _, page in matches[:3]]

    @staticmethod
    def _fallback_page_score(page: dict[str, Any]) -> int:
        text = page["text"].lower()
        keywords = ("llm", "token", "context", "attention", "agent", "model", "prompt", "cost", "chi phí", "api")
        return sum(2 for keyword in keywords if keyword in text) + min(len(text) // 180, 6)

    @staticmethod
    def _page_heading(page: dict[str, Any]) -> str:
        text = re.sub(r"^\[Slide\s+\d+\]\s*", "", page["text"]).strip()
        heading = re.split(r"(?<=[?.!])\s+| {2,}", text, maxsplit=1)[0].strip()
        return heading[:120] or f"Ý chính từ slide {page['page']}"

    @staticmethod
    def _compose_theme_summary(pages: list[dict[str, Any]]) -> str:
        excerpts = []
        for page in pages:
            text = re.sub(r"^\[Slide\s+\d+\]\s*", "", page["text"]).strip()
            excerpts.append(text[:220])
        return " ".join(excerpts)[:760]
