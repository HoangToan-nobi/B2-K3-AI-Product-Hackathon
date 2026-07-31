import json
import re
from typing import Any

import httpx

from app.core.config import get_settings, openai_reasoning_effort_for_request


SYSTEM_PROMPT = """Bạn là AI Tutor cho lớp AI & LLM Foundation.
Chỉ dùng tài liệu tham khảo từ slide được cung cấp để trả lời. Nếu tài liệu chưa đủ, nói rõ là slide hiện tại chưa đủ dữ liệu.
Trả lời bằng tiếng Việt, ngắn gọn, có cấu trúc dễ đọc.
Không nhắc đến các nhãn nội bộ như context, prompt, tài liệu được cung cấp, hệ thống, implementation nội bộ."""


class LlmService:
    def __init__(self) -> None:
        self.settings = get_settings()

    @property
    def enabled(self) -> bool:
        return bool(self.settings.openai_api_key)

    async def answer(self, *, question: str, context: str) -> str | None:
        if not self.enabled:
            return None
        body = await self._chat_completion(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": f"TÀI LIỆU THAM KHẢO TỪ SLIDE:\n{context}\n\nCÂU HỎI:\n{question}\n\nTRẢ LỜI CHO HỌC VIÊN:",
                },
            ],
            max_completion_tokens=700,
            timeout=45,
        )
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
        body = await self._chat_completion(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            max_completion_tokens=800,
            timeout=45,
        )
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
- Phần class_insights chỉ sinh từ CHATLOG ẨN DANH trong database/chatlog: gom các câu hỏi cùng chủ đề hoặc cùng khái niệm thành một cụm, ví dụ "rlhf là gì", "giải thích kỹ về rlhf", "rlhf khác gì bình thường" phải thành một mục về RLHF. Lấy top 5-10 cụm theo tần suất, nhưng nếu chỉ có 1 câu hỏi thật thì vẫn phải trả về đúng 1 mục. Không tự tạo câu hỏi chưa xuất hiện trong chatlog. topic viết ở dạng chủ đề tổng hợp như "Những câu hỏi liên quan đến RLHF", không copy nguyên văn một câu hỏi đơn lẻ; common_confusion ghi câu hỏi đại diện hoặc các biến thể tiêu biểu; correct_understanding phải gồm câu trả lời và giải thích nội dung dựa trên slide.
- Ưu tiên kiến thức trọng tâm theo learning objective và cấu trúc slide; không chạy theo câu hỏi logistics hoặc câu hỏi chung chung như "tóm tắt slide này".
- Nội dung phải theo bố cục tài liệu ôn tập dễ đọc:
  1) Lý thuyết trọng tâm: mỗi mục có title là câu/nhóm khái niệm nổi bật, content là 2-3 câu giải thích liền mạch, không gạch đầu dòng con.
  2) Cả lớp thường hỏi: mỗi mục có topic ở dạng câu hỏi học viên hay hỏi, common_confusion ghi câu hỏi tiêu biểu, correct_understanding ghi câu trả lời và giải thích bằng 2-4 câu chắc ý.
  3) Quiz nhanh: tạo 3-5 câu trắc nghiệm từ phần Lý thuyết trọng tâm và Cả lớp thường hỏi. Mỗi câu chỉ kiểm tra MỘT ý cụ thể. Mỗi lựa chọn phải là một câu/ngữ ngắn dưới 22 từ, không copy nguyên agenda, không copy đoạn slide dài, không dùng ký hiệu bullet. answer chỉ ghi đúng nội dung đáp án đúng, không lặp lại cả câu hỏi. explanation dài 1-2 câu, giải thích vì sao đúng bằng ý ngắn gọn từ slide.
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
        body = await self._chat_completion(
            messages=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": (
                        f"BÀI HỌC: {lesson_title}\n\n"
                        f"SLIDE TEXT:\n{slide_context}\n\n"
                        f"TRANSCRIPT:\n{transcript_context}\n\n"
                        f"CHATLOG ẨN DANH:\n{chat_context}\n\n"
                        "Hãy tạo đúng cấu trúc nội dung cho PDF gồm: "
                        "4-5 mục lý thuyết trọng tâm, top 3-5 mục cả lớp thường hỏi nếu chatlog có đủ dữ liệu, 3-4 câu quiz nhanh. "
                        "Văn phong như tài liệu ôn tập chính thức: câu ngắn vừa phải, thuật ngữ rõ. "
                        "Riêng quiz phải ngắn: mỗi option dưới 22 từ, answer là ý đúng cô đọng, explanation 1-2 câu; "
                        "không markdown, không bullet trong content/common_confusion/correct_understanding/options/answer/explanation."
                    ),
                },
            ],
            max_completion_tokens=2500,
            response_format={"type": "json_object"},
            timeout=180,
        )
        content = body["choices"][0]["message"]["content"].strip()
        return json.loads(_extract_json_object(content))

    async def _chat_completion(
        self,
        *,
        messages: list[dict[str, str]],
        max_completion_tokens: int,
        timeout: float,
        response_format: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": self.settings.openai_model,
            "messages": messages,
            "max_completion_tokens": max_completion_tokens,
        }
        if response_format is not None:
            payload["response_format"] = response_format
        reasoning_effort = openai_reasoning_effort_for_request(self.settings)
        if reasoning_effort:
            payload["reasoning_effort"] = reasoning_effort
        headers = {
            "Authorization": f"Bearer {self.settings.openai_api_key}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(self.settings.openai_api_url, json=payload, headers=headers)
            response.raise_for_status()
            return response.json()


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
