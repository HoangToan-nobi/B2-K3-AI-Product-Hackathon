from fastapi import APIRouter
from fastapi.responses import JSONResponse, StreamingResponse

from app.services.progress import get_progress_job


router = APIRouter(prefix="/api/progress")


@router.get("/{job_id}/events")
async def stream_progress(job_id: str):
    job = get_progress_job(job_id)
    if job is None:
        return JSONResponse({"error": "Progress job not found"}, status_code=404)
    return StreamingResponse(
        job.stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
