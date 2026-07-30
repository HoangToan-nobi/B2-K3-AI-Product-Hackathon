import unicodedata
from typing import Any


def _sanitize_pdf_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_text = "".join(ch for ch in normalized if 32 <= ord(ch) <= 126 or ch == "\n")
    return ascii_text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _wrap_line(text: str, max_length: int = 86) -> list[str]:
    words = _sanitize_pdf_text(text).split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if len(candidate) > max_length:
            if current:
                lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def _build_lines(pack: dict[str, Any]) -> list[str]:
    lines = [
        "VLuoi - Goi On Tap",
        pack["lesson"]["title"],
        (
            f"{pack['lesson']['slide_count']} slides | "
            f"{pack['analysis']['unique_user_count']} hoc vien hoi | "
            f"{pack['analysis']['cluster_count']} chu de"
        ),
        "",
        "Ly thuyet trong tam",
    ]
    for item in pack["summary"]:
        lines.extend(
            _wrap_line(
                f"- {item['title']}. {item['content']} [trang {', '.join(map(str, item['source_pages']))}]"
            )
        )

    lines.extend(["", "Ca lop thuong hoi"])
    for item in [it for it in pack["class_insights"] if it["status"] == "ready"]:
        lines.extend(
            _wrap_line(
                f"- {item['topic']}. {item['correct_understanding']} "
                f"({item['unique_user_count']} hoc vien, trang {', '.join(map(str, item['source_pages']))})"
            )
        )

    flagged = any(it["status"] == "needs_review" for it in pack["class_insights"]) or any(
        it["status"] == "needs_review" for it in pack["review_questions"]
    )
    if flagged:
        lines.extend(
            [
                "",
                "Luu y: mot so noi dung dang cho Lab Coach duyet va khong duoc dua vao ban phat hanh.",
            ]
        )

    lines.extend(["", "Cau tu kiem tra"])
    for index, item in enumerate(pack["review_questions"], start=1):
        if item["status"] == "ready":
            lines.extend(_wrap_line(f"{index}. {item['question']}"))
            lines.extend(
                _wrap_line(
                    f"   Dap an: {item['answer']}. [trang {', '.join(map(str, item['source_pages']))}]"
                )
            )
    return lines


def _pdf_object(object_id: int, body: str) -> str:
    return f"{object_id} 0 obj\n{body}\nendobj\n"


def generate_review_pack_pdf(pack: dict[str, Any]) -> bytes:
    chunks = ["BT", "/F1 11 Tf", "50 760 Td"]
    y = 760
    for line in _build_lines(pack):
        if y < 52:
            chunks.append("ET")
            break
        chunks.extend([f"({_sanitize_pdf_text(line)}) Tj", "0 -15 Td"])
        y -= 15
    chunks.append("ET")

    stream = "\n".join(chunks)
    objects = [
        _pdf_object(1, "<< /Type /Catalog /Pages 2 0 R >>"),
        _pdf_object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
        _pdf_object(
            3,
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            "/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        ),
        _pdf_object(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
        _pdf_object(5, f"<< /Length {len(stream.encode('ascii'))} >>\nstream\n{stream}\nendstream"),
    ]

    offset = len("%PDF-1.4\n")
    xref = ["0000000000 65535 f "]
    for obj in objects:
        xref.append(f"{offset:010d} 00000 n ")
        offset += len(obj.encode("ascii"))

    body = "".join(objects)
    xref_offset = len(("%PDF-1.4\n" + body).encode("ascii"))
    pdf = "\n".join(
        [
            "%PDF-1.4",
            body,
            f"xref\n0 {len(objects) + 1}",
            "\n".join(xref),
            f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>",
            "startxref",
            str(xref_offset),
            "%%EOF",
            "",
        ]
    )
    return pdf.encode("ascii")

