from pathlib import Path

from fastapi.testclient import TestClient

from app.core.database import get_db_session
from app.main import app


async def _test_db_session_override():
    yield None


app.dependency_overrides[get_db_session] = _test_db_session_override
client = TestClient(app)


def test_review_pack_catalog_student_filters_ready_items():
    response = client.get("/api/review-packs?role=student")

    assert response.status_code == 200
    body = response.json()
    assert body["role"] == "student"
    assert body["lessons"][0]["pack_id"] == "pack-day1-foundation-001"


def test_review_pack_detail_labcoach_and_student_parity():
    labcoach = client.get(
        "/api/review-packs/pack-day1-foundation-001",
        headers={"x-vluoi-role": "labcoach"},
    )
    student = client.get("/api/review-packs/pack-day1-foundation-001?role=student")

    assert labcoach.status_code == 200
    assert student.status_code == 200
    assert labcoach.json()["role"] == "labcoach"
    assert student.json()["role"] == "student"
    assert len(student.json()["pack"]["warnings"]) == 0


def test_create_review_pack_returns_existing_artifact_shape():
    response = client.post(
        "/api/review-packs",
        headers={"x-vluoi-role": "labcoach"},
        json={"lesson_id": "day1-foundation", "run_pipeline": False},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["job"] == {"mode": "existing_artifact"}
    assert body["lesson_mapping"]["lesson_id"] == "day1-foundation"
    assert "artifacts" in body


def test_review_pack_mutation_requires_labcoach_and_valid_action():
    forbidden = client.patch(
        "/api/review-packs/pack-day1-foundation-001/items/example",
        json={"action": "approve"},
    )
    invalid = client.patch(
        "/api/review-packs/pack-day1-foundation-001/items/example",
        headers={"x-vluoi-role": "labcoach"},
        json={"action": "archive"},
    )

    assert forbidden.status_code == 403
    assert forbidden.json() == {"error": "Lab Coach role required"}
    assert invalid.status_code == 400
    assert invalid.json() == {"error": "Invalid action"}


def test_export_pdf_returns_binary_headers():
    response = client.post(
        "/api/review-packs/pack-day1-foundation-001/export-pdf",
        headers={"x-vluoi-role": "labcoach"},
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/pdf")
    assert response.headers["content-disposition"] == 'attachment; filename="pack-day1-foundation-001.pdf"'
    assert response.content.startswith(b"%PDF")


def test_upload_lesson_slide_and_chat_flow(tmp_path: Path):
    response = client.post(
        "/api/lessons",
        headers={"x-vluoi-role": "labcoach"},
        data={"title": "Uploaded E2E Lesson"},
        files={"file": ("slides.pdf", b"%PDF-1.4\n%%EOF\n", "application/pdf")},
    )
    assert response.status_code == 200
    body = response.json()
    lesson_id = body["lesson"]["id"]
    assert body["slideDeck"]["status"] == "ready"

    lessons = client.get("/api/lessons")
    assert lessons.status_code == 200
    assert any(lesson["id"] == lesson_id for lesson in lessons.json()["lessons"])

    slide = client.get(f"/api/lessons/{lesson_id}/slide")
    assert slide.status_code == 200
    assert slide.headers["content-type"].startswith("application/pdf")
    assert slide.content.startswith(b"%PDF")

    chat = client.post(
        "/api/chat",
        json={
            "lesson_id": lesson_id,
            "message": "tom tat slide nay",
            "current_slide_page": 1,
            "selected_text": "",
        },
    )
    assert chat.status_code == 200
    assert "reply" in chat.json()
    assert chat.json()["citations"].startswith("Slide")
