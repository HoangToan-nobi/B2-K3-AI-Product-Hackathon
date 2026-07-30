import json
import re
from typing import Any

import httpx

from app.core.config import get_settings


SYSTEM_PROMPT = """Bạn là AI Tutor cho lớp AI & LLM Foundation.
Chỉ trả lời dựa trên CONTEXT được cung cấp. Nếu context không đủ, nói rõ là chưa đủ dữ liệu.
Trả lời bằng tiếng Việt, ngắn gọn, có cấu trúc dễ đọc. Không nhắc đến implementation nội bộ."""


class LlmService:
    def __init__(self) -> None:
        self.settings = get_settings()

    @property
    def enabled(self) -> bool:
        return bool(self.settings.deepseek_api_key)

    async def answer(self, *, question: str, context: str) -> str | None:
        if not self.enabled:
            return None

        payload: dict[str, Any] = {
            "model": self.settings.deepseek_model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": f"CONTEXT:\n{context}\n\nCÂU HỎI:\n{question}\n\nTRẢ LỜI:",
                },
            ],
            "temperature": 0.2,
            "max_tokens": 700,
        }
        headers = {
            "Authorization": f"Bearer {self.settings.deepseek_api_key}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.post(self.settings.deepseek_api_url, json=payload, headers=headers)
            response.raise_for_status()
            body = response.json()
        return body["choices"][0]["message"]["content"].strip()

    async def answer_general(self, *, question: str, web_context: str = "") -> str | None:
        if not self.enabled:
            return None

        system_prompt = """Bạn là AI Tutor tiếng Việt.
Nếu câu hỏi không nằm trong slide, hãy trả lời bằng kiến thức phổ thông hoặc web context được cung cấp.
Mở đầu ngắn gọn rằng nội dung này nằm ngoài slide nếu phù hợp. Không bịa nguồn; nếu dùng web context thì nêu nguồn ngắn ở cuối."""
        user_content = (
            f"WEB CONTEXT:\n{web_context}\n\nCÂU HỎI:\n{question}\n\nTRẢ LỜI:"
            if web_context
            else f"CÂU HỎI:\n{question}\n\nTRẢ LỜI:"
        )
        payload: dict[str, Any] = {
            "model": self.settings.deepseek_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            "temperature": 0.25,
            "max_tokens": 800,
        }
        headers = {
            "Authorization": f"Bearer {self.settings.deepseek_api_key}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.post(self.settings.deepseek_api_url, json=payload, headers=headers)
            response.raise_for_status()
            body = response.json()
        return body["choices"][0]["message"]["content"].strip()

    async def generate_review_pack(self, *, lesson_title: str, slide_context: str, transcript_context: str, chat_context: str) -> dict[str, Any] | None:
        if not self.enabled:
            return None

        system_prompt = """Bạn tạo gói ôn tập VLười cho VLearn.
Nguyên tắc bắt buộc:
- Slide là nguồn sự thật duy nhất cho kiến thức.
- Transcript chỉ bổ sung diễn giải nếu khớp slide.
- Chatlog chỉ dùng làm tín hiệu học viên vướng, không dùng làm nguồn khẳng định.
- Trả về JSON hợp lệ, không markdown, không giải thích ngoài JSON.
Schema:
{
  "summary": [{"title": "...", "content": "...", "source_pages": [1], "source_excerpt": "...", "confidence": 0.0}],
  "class_insights": [{"topic": "...", "common_confusion": "...", "correct_understanding": "...", "source_pages": [1], "source_excerpt": "...", "confidence": 0.0, "unique_user_count": 1, "question_count": 1, "representative_questions": ["..."]}],
  "review_questions": [{"question": "...", "options": ["A", "B", "C", "D"], "correct_option": 0, "answer": "...", "explanation": "...", "source_pages": [1], "source_excerpt": "...", "confidence": 0.0}]
}"""
        payload: dict[str, Any] = {
            "model": self.settings.deepseek_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": (
                        f"BÀI HỌC: {lesson_title}\n\n"
                        f"SLIDE TEXT:\n{slide_context}\n\n"
                        f"TRANSCRIPT:\n{transcript_context}\n\n"
                        f"CHATLOG ẨN DANH:\n{chat_context}\n\n"
                        "Hãy tạo 4 ý chính, 3 blindspot, 3 câu tự kiểm tra. Nội dung mỗi trường ngắn gọn."
                    ),
                },
            ],
            "temperature": 0.15,
            "max_tokens": 4096,
            "response_format": {"type": "json_object"},
        }
        headers = {
            "Authorization": f"Bearer {self.settings.deepseek_api_key}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=90) as client:
            response = await client.post(self.settings.deepseek_api_url, json=payload, headers=headers)
            response.raise_for_status()
            body = response.json()
        content = body["choices"][0]["message"]["content"].strip()
        return json.loads(_extract_json_object(content))


def _extract_json_object(content: str) -> str:
    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?\s*", "", content)
        content = re.sub(r"\s*```$", "", content)
    try:
        json.loads(content)
        return content
    except json.JSONDecodeError:
        pass
    start = content.find("{")
    end = content.rfind("}")
    if start >= 0 and end > start:
        return content[start : end + 1]
    return content
