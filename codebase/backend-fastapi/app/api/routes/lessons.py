from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_request_role
from app.core.database import get_db_session
from app.services.lessons import LessonService


router = APIRouter(prefix="/api/lessons")


@router.get("")
async def list_lessons(session: AsyncSession | None = Depends(get_db_session)) -> JSONResponse:
    service = LessonService(session)
    lessons = await service.list_lessons()
    return JSONResponse({"lessons": lessons})


@router.post("")
async def upload_lesson(
    title: str = Form(),
    courseId: str | None = Form(default=None),
    file: UploadFile = File(),
    role: str = Depends(get_request_role),
    session: AsyncSession | None = Depends(get_db_session),
) -> JSONResponse:
    if role != "labcoach":
        return JSONResponse({"error": "Forbidden"}, status_code=403)
    service = LessonService(session)
    try:
        lesson, slide_deck = await service.upload_lesson(title=title, course_id=courseId, file=file)
        return JSONResponse({"lesson": lesson, "slideDeck": slide_deck})
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    except Exception as exc:
        return JSONResponse({"error": str(exc) or "Failed to upload"}, status_code=500)


@router.post("/reingest-static")
async def reingest_static_lessons(
    role: str = Depends(get_request_role),
    session: AsyncSession | None = Depends(get_db_session),
) -> JSONResponse:
    if role != "labcoach":
        return JSONResponse({"error": "Forbidden"}, status_code=403)
    service = LessonService(session)
    try:
        return JSONResponse(await service.reingest_static_lessons())
    except Exception as exc:
        return JSONResponse({"error": str(exc) or "Failed to reingest"}, status_code=500)


@router.get("/{lesson_id}/slide")
async def get_lesson_slide(
    lesson_id: str,
    session: AsyncSession | None = Depends(get_db_session),
) -> Response:
    service = LessonService(session)
    try:
        path, media_type, filename = await service.get_slide_file(lesson_id)
        return FileResponse(
            path,
            media_type=media_type,
            headers={"Content-Disposition": f'inline; filename="{filename}"'},
        )
    except Exception as exc:
        return JSONResponse({"error": str(exc) or "Slide not found"}, status_code=404)
