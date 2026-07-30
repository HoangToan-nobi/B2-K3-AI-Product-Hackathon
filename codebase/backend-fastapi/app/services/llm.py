import json
import re
from typing import Any

import httpx

from app.core.config import get_settings


SYSTEM_PROMPT = """Bạn là AI Tutor cho lớp AI & LLM Foundation.
Chỉ dùng tài liệu tham khảo từ slide được cung cấp để trả lời. Nếu tài liệu chưa đủ, nói rõ là slide hiện tại chưa đủ dữ liệu.
Trả lời bằng tiếng Việt, ngắn gọn, có cấu trúc dễ đọc.
Không nhắc đến các nhãn nội bộ như context, prompt, tài liệu được cung cấp, hệ thống, implementation nội bộ."""


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
                    "content": f"TÀI LIỆU THAM KHẢO TỪ SLIDE:\n{context}\n\nCÂU HỎI:\n{question}\n\nTRẢ LỜI CHO HỌC VIÊN:",
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
        return self._clean_tutor_answer(body["choices"][0]["message"]["content"])

    async def answer_general(self, *, question: str, web_context: str = "") -> str | None:
        if not self.enabled:
            return None

        system_prompt = """Bạn là AI Tutor tiếng Việt.
Nếu câu hỏi không nằm trong slide, hãy trả lời bằng kiến thức phổ thông hoặc nguồn web tham khảo nếu có.
Mở đầu ngắn gọn rằng nội dung này nằm ngoài slide nếu phù hợp. Không bịa nguồn; nếu dùng nguồn web tham khảo thì nêu nguồn ngắn ở cuối.
Không nhắc đến các nhãn nội bộ như context, prompt, dữ liệu được cung cấp, hệ thống."""
        user_content = (
            f"NGUỒN WEB THAM KHẢO:\n{web_context}\n\nCÂU HỎI:\n{question}\n\nTRẢ LỜI CHO HỌC VIÊN:"
            if web_context
            else f"CÂU HỎI:\n{question}\n\nTRẢ LỜI CHO HỌC VIÊN:"
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
        return self._clean_tutor_answer(body["choices"][0]["message"]["content"])

    @staticmethod
    def _clean_tutor_answer(answer: str) -> str:
        cleaned = answer.strip()
        cleaned = re.sub(
            r"^\s*(dựa|dua)\s+trên\s+(context|ngữ\s*cảnh|du\s*lieu\s*duoc\s*cung\s*cap|dữ\s*liệu\s*được\s*cung\s*cấp)\s*,?\s*",
            "",
            cleaned,
            flags=re.IGNORECASE,
        )
        cleaned = re.sub(
            r"^\s*(theo|từ)\s+(context|ngữ\s*cảnh|dữ\s*liệu\s*được\s*cung\s*cấp)\s*,?\s*",
            "",
            cleaned,
            flags=re.IGNORECASE,
        )
        return cleaned.lstrip(":- \n")

    async def generate_review_pack(self, *, lesson_title: str, slide_context: str, transcript_context: str, chat_context: str) -> dict[str, Any] | None:
        if not self.enabled:
            return None

        system_prompt = """Bạn tạo gói ôn tập VLười cho VLearn bằng tiếng Việt có dấu, đúng chính tả, tự nhiên như tài liệu ôn thi cho học viên.
Nguyên tắc bắt buộc:
- Slide là nguồn sự thật duy nhất cho kiến thức.
- Transcript chỉ bổ sung diễn giải nếu khớp slide.
- Chatlog chỉ dùng làm tín hiệu học viên vướng, không dùng làm nguồn khẳng định.
- Phần summary phải tổng hợp các ý quan trọng nhất trên TOÀN BỘ slide text được cung cấp, không được lấy tuần tự các slide đầu.
- Phần class_insights chỉ sinh từ CHATLOG ẨN DANH trong database/chatlog: mỗi mục phải đại diện cho một câu hỏi học viên thường hỏi. topic là câu hỏi hoặc nhóm câu hỏi ngắn; common_confusion là câu hỏi học viên thường hỏi, không phải mô tả lỗi hệ thống; correct_understanding phải gồm câu trả lời và giải thích nội dung dựa trên slide.
- Ưu tiên kiến thức trọng tâm theo learning objective và cấu trúc slide; không chạy theo câu hỏi logistics hoặc câu hỏi chung chung như "tóm tắt slide này".
- Nội dung phải theo bố cục tài liệu ôn tập dễ đọc:
  1) Lý thuyết trọng tâm: mỗi mục có title là câu/nhóm khái niệm nổi bật, content là 2-3 câu giải thích liền mạch, không gạch đầu dòng con.
  2) Cả lớp thường hỏi: mỗi mục có topic ở dạng câu hỏi học viên hay hỏi, common_confusion ghi câu hỏi tiêu biểu, correct_understanding ghi câu trả lời và giải thích bằng 2-4 câu chắc ý.
  3) Quiz nhanh: tạo 3-5 câu trắc nghiệm từ phần Lý thuyết trọng tâm và Cả lớp thường hỏi. Mỗi câu có 4 lựa chọn cụ thể, answer là đầy đủ nội dung đáp án đúng kèm tiền tố A/B/C/D nếu tự nhiên, explanation giải thích vì sao đúng và nhắc lại ý liên quan trong slide/câu hỏi hay gặp.
- Title của summary nên giống heading trong tài liệu: rõ chủ đề, có thể dùng dấu phẩy/chấm giữa các khái niệm, ví dụ "Token, Context, Attention — ba khái niệm nền".
- Không nhồi quá nhiều khái niệm vào một mục; mỗi mục nên xử lý một cụm kiến thức có quan hệ trực tiếp.
- Không viết tiếng Việt không dấu. Không dùng LaTeX escape như \\( hoặc \\).
- Nếu không tìm được căn cứ trong slide, giảm confidence dưới 0.72.
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
                        "Hãy tạo đúng cấu trúc nội dung cho PDF gồm: "
                        "5-6 mục lý thuyết trọng tâm, 4-5 mục cả lớp thường hỏi, 3-5 câu quiz nhanh. "
                        "Văn phong như tài liệu ôn tập chính thức: câu ngắn vừa phải, thuật ngữ rõ, "
                        "không markdown, không bullet trong content/common_confusion/correct_understanding."
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
