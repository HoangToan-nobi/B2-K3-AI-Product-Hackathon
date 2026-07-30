#!/usr/bin/env python3
"""Trich text tung trang tu slide PDF (poppler pdftotext) thanh JSON co cau truc.

Dung: python3 01_extract_slides.py <slide.pdf> <lesson_id> <output.json>

Ghi chu: cac file slide hackathon co watermark trang tri dang chu cheo
("HACKATHON"/"ACTION" tach tung ky tu) chen giua noi dung that. Ham
_clean_page loai cac dong ngan chi gom vai ky tu hoa co lien quan toi
watermark, khong dong nghia da lam sach 100% - AI doc phan con lai van
phai tu suy luan noi dung chinh.
"""
import json
import re
import shutil
import subprocess
import sys

_WATERMARK_LINE = re.compile(r"^[A-Z\s\-]{1,8}$")


def _clean_page(raw_page: str) -> str:
    kept = []
    for line in raw_page.split("\n"):
        stripped = line.strip()
        if not stripped:
            continue
        letters_only = re.sub(r"[\s\-]", "", stripped)
        if _WATERMARK_LINE.match(stripped) and len(letters_only) <= 3:
            continue
        kept.append(stripped)
    return "\n".join(kept)


def extract(pdf_path: str, lesson_id: str) -> dict:
    if shutil.which("pdftotext") is None:
        raise RuntimeError(
            "Thieu pdftotext/Poppler trong PATH. Cai tren macOS bang: brew install poppler"
        )

    raw = subprocess.run(
        ["pdftotext", "-layout", pdf_path, "-"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    raw_pages = raw.split("\f")
    # pdftotext emits a trailing empty page after the form-feed of the last slide
    if raw_pages and raw_pages[-1].strip() == "":
        raw_pages = raw_pages[:-1]

    pages = []
    for i, raw_page in enumerate(raw_pages, start=1):
        text = _clean_page(raw_page)
        pages.append({"page": i, "text": text})

    return {"lesson_id": lesson_id, "source_pdf": pdf_path, "page_count": len(pages), "pages": pages}


def main():
    if len(sys.argv) != 4:
        print("Dung: python3 01_extract_slides.py <slide.pdf> <lesson_id> <output.json>")
        sys.exit(1)
    pdf_path, lesson_id, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
    try:
        data = extract(pdf_path, lesson_id)
    except RuntimeError as error:
        print(f"Loi: {error}", file=sys.stderr)
        sys.exit(1)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"Da trich {data['page_count']} trang -> {out_path}")


if __name__ == "__main__":
    main()
