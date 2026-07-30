import asyncio
import threading
from dataclasses import dataclass

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import JSONResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_request_role
from app.core.database import AsyncSessionLocal, get_db_session
from app.services.lessons import LessonService
from app.services.progress import create_progress_job


router = APIRouter(prefix="/api/lessons")


@dataclass
class BufferedUpload:
    filename: str
    content_type: str
    data: bytes

    async def read(self) -> bytes:
        return self.data


@router.get("")
async def list_lessons(session: AsyncSession | None = Depends(get_db_session)) -> JSONResponse:
    service = LessonService(session)
    lessons = await service.list_lessons()
    return JSONResponse({"lessons": lessons})


@router.post("")
async def upload_lesson(
    title: str = Form(),
    courseId: str | None = Form(default=None),
    file: UploadFile | None = File(default=None),
    files: list[UploadFile] = File(default=[]),
    role: str = Depends(get_request_role),
    session: AsyncSession | None = Depends(get_db_session),
) -> JSONResponse:
    if role != "labcoach":
        return JSONResponse({"error": "Forbidden"}, status_code=403)
    service = LessonService(session)
    try:
        upload_files = files if files else ([file] if file else [])
        if not upload_files:
            return JSONResponse({"error": "No file uploaded"}, status_code=400)
        lesson, slide_deck = await service.upload_lesson(title=title, course_id=courseId, files=upload_files)
        return JSONResponse({"lesson": lesson, "slideDeck": slide_deck})
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    except Exception as exc:
        return JSONResponse({"error": str(exc) or "Failed to upload"}, status_code=500)


@router.post("/jobs")
async def upload_lesson_job(
    title: str = Form(),
    courseId: str | None = Form(default=None),
    file: UploadFile | None = File(default=None),
    files: list[UploadFile] = File(default=[]),
    role: str = Depends(get_request_role),
) -> JSONResponse:
    if role != "labcoach":
        return JSONResponse({"error": "Forbidden"}, status_code=403)
    upload_files = files if files else ([file] if file else [])
    if not upload_files:
        return JSONResponse({"error": "No file uploaded"}, status_code=400)

    buffered_files = [
        BufferedUpload(
            filename=item.filename or "slides.pdf",
            content_type=item.content_type or "application/pdf",
            data=await item.read(),
        )
        for item in upload_files
        if item is not None
    ]
    job = create_progress_job("Tạo ngày học mới")

    async def run_job() -> None:
        try:
            if AsyncSessionLocal is None:
                service = LessonService(None)
                lesson, slide_deck = await service.upload_lesson(
                    title=title,
                    course_id=courseId,
                    files=buffered_files,  # type: ignore[arg-type]
                    progress=job,
                )
            else:
                async with AsyncSessionLocal() as session:
                    service = LessonService(session)
                    lesson, slide_deck = await service.upload_lesson(
                        title=title,
                        course_id=courseId,
                        files=buffered_files,  # type: ignore[arg-type]
                        progress=job,
                    )
            await job.complete({"lesson": lesson, "slideDeck": slide_deck})
        except ValueError as exc:
            await job.fail(str(exc))
        except Exception as exc:
            await job.fail(str(exc) or "Upload thất bại. Hãy dùng PDF/PPTX có text selectable.")

    threading.Thread(target=lambda: asyncio.run(run_job()), daemon=True).start()
    return JSONResponse({"job_id": job.id, "events_url": f"/api/progress/{job.id}/events"})


@router.patch("/{lesson_id}")
async def update_lesson(
    lesson_id: str,
    title: str = Form(default=None),
    role: str = Depends(get_request_role),
    session: AsyncSession | None = Depends(get_db_session),
) -> JSONResponse:
    if role != "labcoach":
        return JSONResponse({"error": "Forbidden"}, status_code=403)
    service = LessonService(session)
    try:
        lesson = await service.update_lesson(lesson_id=lesson_id, title=title)
        return JSONResponse({"lesson": lesson})
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=404)
    except Exception as exc:
        return JSONResponse({"error": str(exc) or "Failed to update"}, status_code=500)


@router.delete("/{lesson_id}")
async def delete_lesson(
    lesson_id: str,
    role: str = Depends(get_request_role),
    session: AsyncSession | None = Depends(get_db_session),
) -> JSONResponse:
    if role != "labcoach":
        return JSONResponse({"error": "Forbidden"}, status_code=403)
    service = LessonService(session)
    try:
        await service.delete_lesson(lesson_id=lesson_id)
        return JSONResponse({"ok": True})
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=404)
    except Exception as exc:
        return JSONResponse({"error": str(exc) or "Failed to delete"}, status_code=500)


@router.post("/{lesson_id}/slides")
async def add_slide_to_lesson(
    lesson_id: str,
    file: UploadFile = File(),
    role: str = Depends(get_request_role),
    session: AsyncSession | None = Depends(get_db_session),
) -> JSONResponse:
    if role != "labcoach":
        return JSONResponse({"error": "Forbidden"}, status_code=403)
    service = LessonService(session)
    try:
        slide_deck = await service.add_slide_to_lesson(lesson_id=lesson_id, file=file)
        return JSONResponse({"slideDeck": slide_deck})
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    except Exception as exc:
        return JSONResponse({"error": str(exc) or "Failed to add slide"}, status_code=500)


@router.post("/{lesson_id}/slides/jobs")
async def add_slide_to_lesson_job(
    lesson_id: str,
    file: UploadFile = File(),
    role: str = Depends(get_request_role),
) -> JSONResponse:
    if role != "labcoach":
        return JSONResponse({"error": "Forbidden"}, status_code=403)
    buffered_file = BufferedUpload(
        filename=file.filename or "slides.pdf",
        content_type=file.content_type or "application/pdf",
        data=await file.read(),
    )
    job = create_progress_job("Thêm slide vào ngày học")

    async def run_job() -> None:
        try:
            if AsyncSessionLocal is None:
                service = LessonService(None)
                slide_deck = await service.add_slide_to_lesson(
                    lesson_id=lesson_id,
                    file=buffered_file,  # type: ignore[arg-type]
                    progress=job,
                )
            else:
                async with AsyncSessionLocal() as session:
                    service = LessonService(session)
                    slide_deck = await service.add_slide_to_lesson(
                        lesson_id=lesson_id,
                        file=buffered_file,  # type: ignore[arg-type]
                        progress=job,
                    )
            await job.complete({"slideDeck": slide_deck})
        except ValueError as exc:
            await job.fail(str(exc))
        except Exception as exc:
            await job.fail(str(exc) or "Không thêm được slide.")

    threading.Thread(target=lambda: asyncio.run(run_job()), daemon=True).start()
    return JSONResponse({"job_id": job.id, "events_url": f"/api/progress/{job.id}/events"})


@router.delete("/{lesson_id}/slides/{deck_id}")
async def delete_slide(
    lesson_id: str,
    deck_id: str,
    role: str = Depends(get_request_role),
    session: AsyncSession | None = Depends(get_db_session),
) -> JSONResponse:
    if role != "labcoach":
        return JSONResponse({"error": "Forbidden"}, status_code=403)
    service = LessonService(session)
    try:
        await service.delete_slide(lesson_id=lesson_id, deck_id=deck_id)
        return JSONResponse({"ok": True})
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=404)
    except Exception as exc:
        return JSONResponse({"error": str(exc) or "Failed to delete slide"}, status_code=500)


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
        bytes_, media_type, filename = await service.get_slide_file(lesson_id)
        return Response(
            bytes_,
            media_type=media_type,
            headers={"Content-Disposition": f'inline; filename="{filename}"'},
        )
    except Exception as exc:
        return JSONResponse({"error": str(exc) or "Slide not found"}, status_code=404)
