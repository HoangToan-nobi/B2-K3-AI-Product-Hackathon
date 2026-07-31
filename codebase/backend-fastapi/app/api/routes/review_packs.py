import asyncio
import logging
import threading

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_request_role
from app.core.database import AsyncSessionLocal, get_db_session
from app.schemas.review_packs import CreateReviewPackRequest
from app.services.progress import create_progress_job
from app.services.review_packs import ReviewPackService


router = APIRouter(prefix="/api/review-packs")
logger = logging.getLogger(__name__)


@router.get("")
async def list_review_packs(
    role: str = Depends(get_request_role),
    session: AsyncSession | None = Depends(get_db_session),
) -> JSONResponse:
    service = ReviewPackService(session)
    db = await service.read_local_db()
    return JSONResponse(
        {
            "role": role,
            "users": db["users"],
            "lessons": await service.list_lesson_cards(role),
        }
    )


@router.post("")
async def create_review_pack(
    request: Request,
    role: str = Depends(get_request_role),
    session: AsyncSession | None = Depends(get_db_session),
) -> JSONResponse:
    if role != "labcoach":
        return JSONResponse({"error": "Lab Coach role required"}, status_code=403)
    raw_body = await request.body()
    body = CreateReviewPackRequest.model_validate_json(raw_body) if raw_body else CreateReviewPackRequest()
    service = ReviewPackService(session)
    try:
        result = await service.create_review_pack(body.lesson_id, body.run_pipeline)
        artifacts = service.list_artifacts(result["pack"]["lesson"]["id"])
        return JSONResponse({**result, "artifacts": artifacts})
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=404)
    except FileNotFoundError:
        return JSONResponse(
            {
                "error": (
                    "Cannot create review pack: missing pipeline artifact. Run "
                    "codebase/pipeline/run_all.sh once or use the committed shared artifacts."
                )
            },
            status_code=500,
        )
    except Exception:
        return JSONResponse({"error": "Cannot create review pack"}, status_code=500)


@router.post("/jobs")
async def create_review_pack_job(
    request: Request,
    role: str = Depends(get_request_role),
) -> JSONResponse:
    if role != "labcoach":
        return JSONResponse({"error": "Lab Coach role required"}, status_code=403)
    raw_body = await request.body()
    body = CreateReviewPackRequest.model_validate_json(raw_body) if raw_body else CreateReviewPackRequest()
    job = create_progress_job("Tạo tài liệu ôn tập")

    async def run_job() -> None:
        try:
            await job.wait_for_connection(timeout=5)
            if AsyncSessionLocal is None:
                service = ReviewPackService(None)
                result = await service.create_review_pack(body.lesson_id, body.run_pipeline, progress=job)
                artifacts = service.list_artifacts(result["pack"]["lesson"]["id"])
            else:
                async with AsyncSessionLocal() as session:
                    service = ReviewPackService(session)
                    result = await service.create_review_pack(body.lesson_id, body.run_pipeline, progress=job)
                    artifacts = service.list_artifacts(result["pack"]["lesson"]["id"])
            await job.complete({**result, "artifacts": artifacts})
        except ValueError as exc:
            await job.fail(str(exc))
        except FileNotFoundError:
            await job.fail("Thiếu dữ liệu pipeline để tạo tài liệu. Hãy ingest lại slide rồi thử lại.")
        except Exception:
            logger.exception("Review pack job failed")
            await job.fail("Không tạo được tài liệu tổng hợp. Hãy kiểm tra VLười hoặc API key.")

    threading.Thread(target=lambda: asyncio.run(run_job()), daemon=True).start()
    return JSONResponse({"job_id": job.id, "events_url": f"/api/progress/{job.id}/events"})


@router.get("/{pack_id}")
async def get_review_pack(
    pack_id: str,
    role: str = Depends(get_request_role),
    session: AsyncSession | None = Depends(get_db_session),
) -> JSONResponse:
    service = ReviewPackService(session)
    lesson_id = pack_id.removeprefix("pack-").rsplit("-", 1)[0]
    try:
        pack = await service.read_review_pack(lesson_id)
        if pack["pack_id"] != pack_id:
            return JSONResponse({"error": "Review pack not found"}, status_code=404)
        return JSONResponse({"pack": service.filter_pack_for_role(pack, role), "role": role})
    except Exception:
        return JSONResponse({"error": "Review pack not found"}, status_code=404)


@router.patch("/{pack_id}/items/{item_id}")
async def update_review_pack_item(
    pack_id: str,
    item_id: str,
    request: Request,
    role: str = Depends(get_request_role),
    session: AsyncSession | None = Depends(get_db_session),
) -> JSONResponse:
    if role != "labcoach":
        return JSONResponse({"error": "Lab Coach role required"}, status_code=403)
    body = await request.json()
    action = body.get("action")
    if action not in {"approve", "drop"}:
        return JSONResponse({"error": "Invalid action"}, status_code=400)
    service = ReviewPackService(session)
    try:
        pack = await service.update_review_pack_item(pack_id, item_id, action)
        return JSONResponse({"pack": pack})
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=404)
    except Exception:
        return JSONResponse({"error": "Cannot update review item"}, status_code=500)


@router.post("/{pack_id}/export-pdf")
async def export_review_pack_pdf(
    pack_id: str,
    role: str = Depends(get_request_role),
    session: AsyncSession | None = Depends(get_db_session),
) -> Response:
    service = ReviewPackService(session)
    try:
        bytes_, filename, artifact_url = await service.export_review_pack_pdf(pack_id, role)
        return Response(
            bytes_,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "X-Artifact-Url": artifact_url,
            },
        )
    except Exception:
        return JSONResponse({"error": "Cannot export PDF"}, status_code=500)
