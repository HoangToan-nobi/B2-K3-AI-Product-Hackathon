import asyncio
import json
import queue
import threading
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4


class ProgressJob:
    def __init__(self, *, title: str):
        self.id = f"job_{uuid4().hex}"
        self.title = title
        self._queue: queue.Queue[dict[str, Any]] = queue.Queue()
        self._history: list[dict[str, Any]] = []
        self._done = False
        self._connected = threading.Event()

    async def emit(
        self,
        *,
        percent: int,
        step: str,
        message: str,
        detail: str | None = None,
        payload: dict[str, Any] | None = None,
        event_type: str = "progress",
    ) -> None:
        safe_percent = max(0, min(100, int(percent)))
        event = {
            "job_id": self.id,
            "type": event_type,
            "title": self.title,
            "percent": safe_percent,
            "step": step,
            "message": message,
            "detail": detail,
            "payload": payload,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        self._history.append(event)
        self._queue.put(event)

    async def complete(self, payload: dict[str, Any]) -> None:
        await self.emit(
            percent=100,
            step="Hoàn tất",
            message="Đã hoàn tất. giao diện đang cập nhật lại dữ liệu mới nhất.",
            payload=payload,
            event_type="complete",
        )
        self._done = True

    async def fail(self, message: str) -> None:
        await self.emit(
            percent=100,
            step="Không hoàn tất",
            message=message,
            event_type="error",
        )
        self._done = True

    async def stream(self):
        self._connected.set()
        snapshot = list(self._history)
        for event in snapshot:
            yield _format_sse(event)
            if event["type"] in {"complete", "error"}:
                return

        for _ in snapshot:
            try:
                self._queue.get_nowait()
            except queue.Empty:
                break
        if self._done:
            return

        while True:
            event = await asyncio.to_thread(self._queue.get)
            yield _format_sse(event)
            if event["type"] in {"complete", "error"}:
                return

    async def wait_for_connection(self, timeout: float = 5.0) -> bool:
        return await asyncio.to_thread(self._connected.wait, timeout)


JOBS: dict[str, ProgressJob] = {}


def create_progress_job(title: str) -> ProgressJob:
    job = ProgressJob(title=title)
    JOBS[job.id] = job
    return job


def get_progress_job(job_id: str) -> ProgressJob | None:
    return JOBS.get(job_id)


def _format_sse(event: dict[str, Any]) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
