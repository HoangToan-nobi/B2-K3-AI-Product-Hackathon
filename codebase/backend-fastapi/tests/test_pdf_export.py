import shutil
import subprocess

import pytest

from app.services import review_packs as review_pack_service_module
from app.services.pdf_export import generate_review_pack_pdf
from app.services.review_packs import ReviewPackService, _PDF_EXPORT_CACHE


def _sample_pack() -> dict:
    return {
        "lesson": {"title": "Prompting & Context (Day 2)", "slide_count": 29},
        "analysis": {"unique_user_count": 369, "cluster_count": 2},
        "summary": [
            {
                "title": "Định hình bài toán",
                "content": "Học viên cần xác định vấn đề, tác nhân bị ảnh hưởng và chỉ số thành công trước khi chọn AI.",
                "source_pages": [7, 9],
            }
        ],
        "class_insights": [
            {
                "topic": "Phân biệt Automate và Augment",
                "common_confusion": "Dễ nhầm rằng cứ dùng AI là phải tự động hóa toàn bộ.",
                "correct_understanding": "**Automation** phù hợp tác vụ lặp và rủi ro thấp; **augmentation** phù hợp khi cần con người kiểm soát quyết định.",
                "source_pages": [7],
                "unique_user_count": 5,
                "status": "ready",
            }
        ],
        "review_questions": [
            {
                "question": "Trường Success Metric trong Quick Problem Card dùng để làm gì?",
                "options": [
                    "Đo kết quả mong muốn bằng chỉ số kiểm chứng được",
                    "Liệt kê tên công cụ AI",
                    "Mô tả giao diện demo",
                    "Chọn màu cho slide",
                ],
                "correct_option": 0,
                "answer": "Đo kết quả mong muốn bằng chỉ số kiểm chứng được",
                "explanation": "Chỉ số thành công giúp so sánh baseline với kết quả sau cải tiến.",
                "source_pages": [9, 11],
                "status": "ready",
            }
        ],
    }


def test_generate_review_pack_pdf_preserves_vietnamese_text(tmp_path):
    if shutil.which("pdftotext") is None:
        pytest.skip("pdftotext is required to verify extracted PDF text")

    output = tmp_path / "review-pack.pdf"
    output.write_bytes(generate_review_pack_pdf(_sample_pack()))

    result = subprocess.run(
        ["pdftotext", str(output), "-"],
        check=True,
        capture_output=True,
        text=True,
    )

    assert "VLười — Gói ôn tập" in result.stdout
    assert "1. LÝ THUYẾT TRỌNG TÂM" in result.stdout
    assert "Định hình bài toán" in result.stdout
    assert "Đáp án: A." in result.stdout
    assert "học viên cần xác định vấn đề" in result.stdout.lower()
    assert "**Automation**" not in result.stdout
    assert "Automation phù hợp tác vụ lặp" in result.stdout


@pytest.mark.anyio
async def test_export_review_pack_pdf_reuses_rendered_pdf_cache(monkeypatch):
    class _FakeStorage:
        cloudinary_enabled = False

        def __init__(self) -> None:
            self.upload_count = 0

        def upload_bytes(self, **_kwargs):
            self.upload_count += 1

            class _Asset:
                url = "memory://exports/pack-test.pdf"

            return _Asset()

    render_count = 0

    def fake_generate_pdf(_pack):
        nonlocal render_count
        render_count += 1
        return b"%PDF cached\n"

    async def fake_read_review_pack(_lesson_id: str):
        return _sample_pack()

    _PDF_EXPORT_CACHE.clear()
    monkeypatch.setattr(review_pack_service_module, "generate_review_pack_pdf", fake_generate_pdf)
    service = ReviewPackService(None)
    service.storage = _FakeStorage()
    monkeypatch.setattr(service, "read_review_pack", fake_read_review_pack)

    first_bytes, first_filename, first_url = await service.export_review_pack_pdf("pack-test-001", "labcoach")
    second_bytes, second_filename, second_url = await service.export_review_pack_pdf("pack-test-001", "labcoach")

    assert first_bytes == b"%PDF cached\n"
    assert second_bytes == first_bytes
    assert first_filename == second_filename == "pack-test-001.pdf"
    assert first_url == second_url == "memory://exports/pack-test.pdf"
    assert render_count == 1
    assert service.storage.upload_count == 1

    _PDF_EXPORT_CACHE.clear()
