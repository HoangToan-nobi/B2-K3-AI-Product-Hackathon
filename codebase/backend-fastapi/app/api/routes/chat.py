from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.schemas.chat import ChatRequest
from app.services.chat import ChatService


router = APIRouter(prefix="/api/chat")


@router.post("")
async def chat(
    body: ChatRequest,
    session: AsyncSession | None = Depends(get_db_session),
) -> JSONResponse:
    try:
        service = ChatService(session)
        return JSONResponse(
            await service.reply(
                lesson_id=body.lesson_id,
                message=body.message,
                current_slide_page=body.current_slide_page,
                selected_text=body.selected_text,
            )
        )
    except Exception:
        return JSONResponse({"error": "Failed to process chat"}, status_code=500)

