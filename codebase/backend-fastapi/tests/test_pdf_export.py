import shutil
import subprocess

import pytest

from app.services.pdf_export import generate_review_pack_pdf


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
                "correct_understanding": "Automation phù hợp tác vụ lặp và rủi ro thấp; augmentation phù hợp khi cần con người kiểm soát quyết định.",
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
