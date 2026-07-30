import asyncio

import pytest

from app.services.progress import create_progress_job


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_progress_job_waits_until_stream_connects():
    job = create_progress_job("Test job")

    assert await job.wait_for_connection(timeout=0.01) is False

    first_event = asyncio.create_task(job.stream().__anext__())
    assert await job.wait_for_connection(timeout=0.2) is True

    await job.complete({"ok": True})
    assert "Hoàn tất" in await first_event
