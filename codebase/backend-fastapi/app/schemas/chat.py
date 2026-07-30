from pydantic import BaseModel


class ChatRequest(BaseModel):
    lesson_id: str = "day1-foundation"
    message: str = ""
    current_slide_page: int | None = 1
    selected_text: str | None = ""

