import json
import re
import shutil
import subprocess
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from app.core.config import get_settings
from app.core.paths import REPO_ROOT, SHARED_DIR


SLIDES_DIR = REPO_ROOT / "data" / "vlearn-pack" / "slides"
TRANSCRIPT_DIR = REPO_ROOT / "data" / "vlearn-pack" / "transcript"
CHATLOG_PATH = REPO_ROOT / "data" / "vlearn-pack" / "chatlog" / "chat_history_anonymized_for_hackathon.csv"

WATERMARK_LINE = re.compile(r"^[A-Z\s\-]{1,8}$")

STATIC_LESSONS: list[dict[str, Any]] = [
    {
        "lesson_id": "day1-foundation",
        "day": 1,
        "title": "AI & LLM Foundation (Day 1)",
        "slide_pdf": SLIDES_DIR / "d1-slide-hackathon.pdf",
        "transcript": TRANSCRIPT_DIR / "transcript-04-clean.md",
        "day_codes": ["Day 1", "Day1-C302", "Day1-C401", "New learning material"],
    },
    {
        "lesson_id": "day2-prompting",
        "day": 2,
        "title": "Prompting & Context (Day 2)",
        "slide_pdf": SLIDES_DIR / "d2-slide-hackathon.pdf",
        "transcript": TRANSCRIPT_DIR / "transcript-02-clean.md",
        "day_codes": ["Day 2", "Day2", "Lecture_material_ms203vsq_ob7vqp"],
    },
    {
        "lesson_id": "day3-rag",
        "day": 3,
        "title": "RAG & Knowledge Grounding (Day 3)",
        "slide_pdf": SLIDES_DIR / "d3-slide-hackathon.pdf",
        "transcript": TRANSCRIPT_DIR / "transcript-03-clean.md",
        "day_codes": ["Day 3", "Day3"],
    },
    {
        "lesson_id": "day4-agents",
        "day": 4,
        "title": "AI Agents & Tools (Day 4)",
        "slide_pdf": SLIDES_DIR / "d4-slide-hackathon.pdf",
        "transcript": TRANSCRIPT_DIR / "transcript-04-clean.md",
        "day_codes": ["Day 4", "Day4"],
    },
    {
        "lesson_id": "day5-product",
        "day": 5,
        "title": "AI Product Hackathon (Day 5)",
        "slide_pdf": SLIDES_DIR / "d5-slide-hackathon.pdf",
        "transcript": TRANSCRIPT_DIR / "transcript-05-clean.md",
        "day_codes": ["Day 5", "Day5"],
    },
]


def lesson_config(lesson_id: str) -> dict[str, Any]:
    for lesson in STATIC_LESSONS:
        if lesson["lesson_id"] == lesson_id:
            return lesson
    raise ValueError(f"Unknown lesson_id: {lesson_id}")


def clean_pdf_page(raw_page: str) -> str:
    kept: list[str] = []
    for line in raw_page.split("\n"):
        stripped = line.strip()
        if not stripped:
            continue
        letters_only = re.sub(r"[\s\-]", "", stripped)
        if WATERMARK_LINE.match(stripped) and len(letters_only) <= 3:
            continue
        kept.append(stripped)
    return "\n".join(kept)


def extract_pdf_pages(pdf_path: Path, *, allow_ocr: bool = True) -> list[dict[str, Any]]:
    if shutil.which("pdftotext") is None:
        raise RuntimeError("Missing pdftotext/Poppler in PATH")
    raw = subprocess.run(
        ["pdftotext", "-layout", str(pdf_path), "-"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    raw_pages = raw.split("\f")
    if raw_pages and raw_pages[-1].strip() == "":
        raw_pages = raw_pages[:-1]
    pages = [
        {"page": index, "text": format_slide_text(index, clean_pdf_page(raw_page))}
        for index, raw_page in enumerate(raw_pages, start=1)
    ]
    if allow_ocr:
        pages = fill_empty_pdf_pages_with_ocr(pdf_path, pages)
    return pages


def fill_empty_pdf_pages_with_ocr(pdf_path: Path, pages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not pages or all(page.get("text") for page in pages):
        return pages
    if shutil.which("pdftoppm") is None or shutil.which("tesseract") is None:
        return pages

    completed = [dict(page) for page in pages]
    ocr_pages: list[dict[str, Any]] = []
    for page in completed:
        if page.get("text"):
            continue
        page_number = int(page["page"])
        ocr_text = ocr_pdf_page(pdf_path, page_number)
        if ocr_text:
            page["text"] = format_slide_text(page_number, ocr_text)
            page["extraction_method"] = "ocr"
            ocr_pages.append({"page": page_number, "text": ocr_text})

    normalized_pages = normalize_ocr_pages_with_deepseek(ocr_pages)
    for page in completed:
        page_number = int(page["page"])
        normalized_text = normalized_pages.get(page_number)
        if normalized_text:
            original_text = next(
                (ocr_page["text"] for ocr_page in ocr_pages if ocr_page["page"] == page_number),
                "",
            )
            page["text"] = format_slide_text(page_number, normalized_text)
            if normalized_text != original_text:
                page["ocr_normalized"] = True
    return completed


def ocr_pdf_page(pdf_path: Path, page_number: int) -> str:
    with tempfile.TemporaryDirectory(prefix="vluoi-ocr-") as tmp_dir:
        output_prefix = Path(tmp_dir) / "page"
        subprocess.run(
            [
                "pdftoppm",
                "-f",
                str(page_number),
                "-l",
                str(page_number),
                "-r",
                "180",
                "-png",
                str(pdf_path),
                str(output_prefix),
            ],
            check=True,
            capture_output=True,
        )
        images = sorted(Path(tmp_dir).glob("page-*.png"))
        if not images:
            return ""
        result = subprocess.run(
            ["tesseract", str(images[0]), "stdout", "-l", tesseract_languages(), "--psm", "6"],
            check=True,
            capture_output=True,
            text=True,
        )
        return clean_pdf_page(result.stdout)


def normalize_ocr_text_with_deepseek(text: str, *, page_number: int) -> str:
    normalized_pages = normalize_ocr_pages_with_deepseek([{"page": page_number, "text": text}])
    return normalized_pages.get(page_number, text)


def normalize_ocr_pages_with_deepseek(ocr_pages: list[dict[str, Any]]) -> dict[int, str]:
    """Best-effort OCR cleanup. Keep ingestion usable when DeepSeek is not configured."""
    compact_pages = [
        {"page": int(page["page"]), "text": str(page.get("text") or "").strip()}
        for page in ocr_pages
        if str(page.get("text") or "").strip()
    ]
    if not compact_pages:
        return {}

    try:
        settings = get_settings()
    except Exception:
        return {}

    if not settings.deepseek_api_key:
        return {}

    normalized_by_page: dict[int, str] = {}
    for chunk in _chunk_ocr_pages(compact_pages, max_chars=6000):
        chunk_result = _normalize_ocr_page_batch(chunk, settings)
        if chunk_result:
            normalized_by_page.update(chunk_result)
            continue
        for page in chunk:
            normalized_by_page.update(_normalize_ocr_page_batch([page], settings))
    return normalized_by_page


def _chunk_ocr_pages(pages: list[dict[str, Any]], *, max_chars: int) -> list[list[dict[str, Any]]]:
    chunks: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []
    current_chars = 0
    for page in pages:
        page_chars = len(page["text"])
        if current and current_chars + page_chars > max_chars:
            chunks.append(current)
            current = []
            current_chars = 0
        current.append(page)
        current_chars += page_chars
    if current:
        chunks.append(current)
    return chunks


def _normalize_ocr_page_batch(pages: list[dict[str, Any]], settings: Any) -> dict[int, str]:
    system_prompt = """Bạn chuẩn hóa text OCR từ slide tiếng Việt.
Nhiệm vụ:
- Sửa lỗi chính tả, dấu tiếng Việt, khoảng trắng, xuống dòng và viết hoa/viết thường.
- Khôi phục các cụm từ bị OCR tách chữ sai, ví dụ "T Ầ N G" thành "TẦNG".
- Giữ nguyên thuật ngữ, tên model, số liệu, citation, URL, bullet và thứ tự ý.
- Không tóm tắt, không diễn giải, không thêm nội dung không có trong OCR.
Chỉ trả về JSON hợp lệ theo schema: {"pages":[{"page":1,"text":"..."}]}."""
    user_prompt = "OCR RAW PAGES:\n" + json.dumps(pages, ensure_ascii=False) + "\n\nJSON:"
    payload: dict[str, Any] = {
        "model": settings.deepseek_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0,
        "max_tokens": 4096,
        "response_format": {"type": "json_object"},
    }
    request = urllib.request.Request(
        settings.deepseek_api_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {settings.deepseek_api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            body = json.loads(response.read().decode("utf-8"))
        content = body["choices"][0]["message"]["content"]
        normalized_payload = json.loads(_extract_json_object(content))
    except (KeyError, json.JSONDecodeError, urllib.error.URLError, TimeoutError, ValueError):
        return {}

    normalized_by_page: dict[int, str] = {}
    for page in normalized_payload.get("pages", []):
        try:
            page_number = int(page["page"])
        except (KeyError, TypeError, ValueError):
            continue
        normalized = clean_pdf_page(str(page.get("text") or ""))
        if normalized:
            normalized_by_page[page_number] = normalized
    return normalized_by_page


def _extract_json_object(content: str) -> str:
    stripped = content.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?\s*", "", stripped)
        stripped = re.sub(r"\s*```$", "", stripped)
    try:
        json.loads(stripped)
        return stripped
    except json.JSONDecodeError:
        pass
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start >= 0 and end > start:
        return stripped[start : end + 1]
    return stripped


def tesseract_languages() -> str:
    try:
        result = subprocess.run(["tesseract", "--list-langs"], check=True, capture_output=True, text=True)
    except Exception:
        return "eng"
    langs = set(result.stdout.split())
    return "eng+vie" if "vie" in langs else "eng"


def extract_pptx_pages(pptx_path: Path) -> list[dict[str, Any]]:
    try:
        from pptx import Presentation
    except ImportError as exc:
        raise RuntimeError("Missing python-pptx. Install backend dependencies first.") from exc

    presentation = Presentation(str(pptx_path))
    pages: list[dict[str, Any]] = []
    for index, slide in enumerate(presentation.slides, start=1):
        text_runs: list[str] = []
        for shape in slide.shapes:
            if not getattr(shape, "has_text_frame", False):
                continue
            for paragraph in shape.text_frame.paragraphs:
                paragraph_text = "".join(run.text for run in paragraph.runs).strip()
                if paragraph_text:
                    text_runs.append(paragraph_text)
        pages.append({"page": index, "text": format_slide_text(index, "\n".join(text_runs))})
    return pages


def extract_slide_pages(file_path: Path, mime_type: str | None = None) -> list[dict[str, Any]]:
    suffix = file_path.suffix.lower()
    if suffix == ".pptx" or mime_type == "application/vnd.openxmlformats-officedocument.presentationml.presentation":
        return extract_pptx_pages(file_path)
    if suffix == ".pdf" or mime_type == "application/pdf":
        return extract_pdf_pages(file_path)
    raise RuntimeError("Only PDF and PPTX slide files are supported")


def extract_slide_deck(file_path: Path, mime_type: str | None = None) -> dict[str, Any]:
    pages = extract_slide_pages(file_path, mime_type)
    suffix = file_path.suffix.lower()
    if suffix == ".pptx" or mime_type == "application/vnd.openxmlformats-officedocument.presentationml.presentation":
        source_type = "pptx_text"
    elif any(page.get("extraction_method") == "ocr" for page in pages):
        source_type = "pdf_text_ocr"
    else:
        source_type = "pdf_text"
    empty_pages = [int(page["page"]) for page in pages if not page.get("text")]
    return {
        "pages": pages,
        "source_type": source_type,
        "page_count": len(pages),
        "empty_pages": empty_pages,
        "ocr_available": shutil.which("tesseract") is not None,
    }


def format_slide_text(page_number: int, text: str) -> str:
    normalized = re.sub(r"\s+\n", "\n", text).strip()
    return f"[Slide {page_number}]\n{normalized}" if normalized else ""


def slide_artifact_path(lesson_id: str) -> Path:
    return SHARED_DIR / f"slide-{lesson_id}.json"


def ensure_slide_artifact(lesson_id: str) -> dict[str, Any]:
    config = lesson_config(lesson_id)
    output_path = slide_artifact_path(lesson_id)
    if output_path.exists():
        payload = json.loads(output_path.read_text(encoding="utf-8"))
        if any(page.get("text") for page in payload.get("pages", [])):
            changed = False
            for page in payload.get("pages", []):
                text = page.get("text") or ""
                if text and not text.lstrip().startswith("[Slide "):
                    page["text"] = format_slide_text(int(page["page"]), text)
                    changed = True
            if changed:
                output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            return payload
        payload["pages"] = transcript_fallback_pages(lesson_id)
        if payload["pages"]:
            payload["page_count"] = len(payload["pages"])
            output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return payload

    pages = extract_slide_pages(Path(config["slide_pdf"]), "application/pdf")
    if not any(page.get("text") for page in pages):
        pages = transcript_fallback_pages(lesson_id)
    payload = {
        "lesson_id": lesson_id,
        "source_pdf": str(config["slide_pdf"]),
        "page_count": len(pages),
        "pages": pages,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return payload


def refresh_slide_artifact(lesson_id: str) -> dict[str, Any]:
    config = lesson_config(lesson_id)
    deck = extract_slide_deck(Path(config["slide_pdf"]), "application/pdf")
    pages = deck["pages"]
    source_type = deck["source_type"]
    if not any(page.get("text") for page in pages):
        pages = transcript_fallback_pages(lesson_id)
        source_type = "transcript_fallback" if pages else deck["source_type"]
    payload = {
        "lesson_id": lesson_id,
        "source_pdf": str(config["slide_pdf"]),
        "page_count": len(pages),
        "pages": pages,
        "extraction": {
            "source_type": source_type,
            "empty_pages": [int(page["page"]) for page in pages if not page.get("text")],
            "ocr_available": deck["ocr_available"],
        },
    }
    output_path = slide_artifact_path(lesson_id)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return payload


def refresh_all_static_slide_artifacts() -> dict[str, Any]:
    results = []
    for lesson in STATIC_LESSONS:
        payload = refresh_slide_artifact(lesson["lesson_id"])
        results.append(
            {
                "lesson_id": lesson["lesson_id"],
                "page_count": payload["page_count"],
                "text_pages": sum(1 for page in payload["pages"] if page.get("text")),
                "extraction": payload.get("extraction", {}),
            }
        )
    return {"lessons": results}


def transcript_fallback_pages(lesson_id: str, chunk_size: int = 1200) -> list[dict[str, Any]]:
    text = read_transcript_excerpt(lesson_id, limit=20000)
    if not text.strip():
        return []
    paragraphs = [part.strip() for part in re.split(r"\n{2,}", text) if part.strip()]
    chunks: list[str] = []
    current = ""
    for paragraph in paragraphs:
        if len(current) + len(paragraph) > chunk_size and current:
            chunks.append(current.strip())
            current = paragraph
        else:
            current = f"{current}\n\n{paragraph}".strip()
    if current:
        chunks.append(current.strip())
    return [{"page": index, "text": format_slide_text(index, chunk)} for index, chunk in enumerate(chunks, start=1)]


def list_static_lesson_options() -> list[dict[str, Any]]:
    options: list[dict[str, Any]] = []
    for lesson in STATIC_LESSONS:
        slide = ensure_slide_artifact(lesson["lesson_id"])
        options.append(
            {
                "id": lesson["lesson_id"],
                "courseId": "vlearn-hackathon",
                "title": lesson["title"],
                "description": "VLearn hackathon data pack",
                "status": "ready",
                "createdBy": "system",
                "createdAt": "2026-07-30T00:00:00+00:00",
                "updatedAt": "2026-07-30T00:00:00+00:00",
                "slideDecks": [
                    {
                        "id": f"deck-{lesson['lesson_id']}",
                        "lessonId": lesson["lesson_id"],
                        "originalFilename": Path(lesson["slide_pdf"]).name,
                        "storageKey": str(lesson["slide_pdf"]),
                        "mimeType": "application/pdf",
                        "pageCount": slide["page_count"],
                        "status": "ready",
                        "uploadedBy": "system",
                        "createdAt": "2026-07-30T00:00:00+00:00",
                    }
                ],
            }
        )
    return options


def read_transcript_excerpt(lesson_id: str, limit: int = 6000) -> str:
    config = lesson_config(lesson_id)
    path = Path(config["transcript"])
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")[:limit]
