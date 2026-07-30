#!/usr/bin/env python3
"""Tien xu ly chatlog CSV -> danh sach cau hoi hoc vien da lam sach (rule-based, khong goi AI).

Dung: python3 02_preprocess_chatlog.py <chat_history.csv> <lesson_id> <day_codes_csv> <max_page> <output.json>
Vi du:
  python3 02_preprocess_chatlog.py \
      ../../data/vlearn-pack/chatlog/chat_history_anonymized_for_hackathon.csv \
      day1-foundation "Day 1,Day1-C302" 29 \
      ../shared/questions-day1-foundation.json

Quy tac loc — khong xoa am tham, luon giu record va gan filter_reason:
  - unmapped_page   : trang tham chieu ngoai pham vi slide da co (vd >29 cho day1-foundation)
  - too_short       : cau hoi sau khi lam sach < 3 ky tu
  - greeting        : chi la loi chao / cam on, khong phai cau hoi hoc thuat
  - duplicate       : cung user gui lai gan nhu nguyen van cau truoc do
  - prompt_injection: co dau hieu do he thong / yeu cau vuot pham vi tutor
"""
import csv
import json
import re
import sys

PREFIX_RE = re.compile(r'^\(Trang\s+(\d+),\s*đoạn được chọn:\s*"(.*?)"\)\s*', re.S)

GREETING_RE = re.compile(
    r"^(xin\s*)?(chào|hi|hello|hey|cảm ơn|cám ơn|thanks|thank you|ok|oke|okie)\b[\s!.,]*$",
    re.I,
)
INJECTION_RE = re.compile(
    r"system prompt|bạn là ai|bạn là model gì|ignore (all )?previous|bỏ qua (mọi )?(hướng dẫn|chỉ thị)"
    r"|prompt của bạn|hãy đóng vai|forget (all )?(your )?instructions",
    re.I,
)


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def split_prefix(content: str):
    """Tach '(Trang N, đoạn được chọn: "...")' khoi phan cau hoi that."""
    m = PREFIX_RE.match(content)
    if not m:
        return None, None, normalize(content)
    page = int(m.group(1))
    selected_text = normalize(m.group(2))
    remainder = normalize(content[m.end():])
    return page, selected_text, remainder


def classify_noise(clean_question: str, page: int, max_page: int):
    if page is not None and page > max_page:
        return True, "unmapped_page"
    if len(clean_question) < 3:
        return True, "too_short"
    if GREETING_RE.match(clean_question):
        return True, "greeting"
    if INJECTION_RE.search(clean_question):
        return True, "prompt_injection"
    return False, None


def preprocess(csv_path: str, lesson_id: str, day_codes: set, max_page: int):
    records = []
    last_by_user = {}

    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row["role"] != "student" or row["day_code"] not in day_codes:
                continue

            page, selected_text, clean_question = split_prefix(row["content"])
            raw_question = normalize(row["content"])

            is_noise, reason = classify_noise(clean_question, page, max_page)

            if not is_noise:
                prev = last_by_user.get(row["user_id"])
                if prev == clean_question:
                    is_noise, reason = True, "duplicate"
            last_by_user[row["user_id"]] = clean_question

            records.append(
                {
                    "lesson_id": lesson_id,
                    "conversation_id": row["conversation_id"],
                    "user_id": row["user_id"],
                    "turn_id": row["turn_id"],
                    "day_code": row["day_code"],
                    "page": page,
                    "selected_text": selected_text,
                    "raw_question": raw_question,
                    "clean_question": clean_question,
                    "is_noise": is_noise,
                    "filter_reason": reason,
                    "message_created_at": row["message_created_at"],
                }
            )
    return records


def main():
    if len(sys.argv) != 6:
        print(__doc__)
        sys.exit(1)
    csv_path, lesson_id, day_codes_csv, max_page_s, out_path = sys.argv[1:6]
    day_codes = {d.strip() for d in day_codes_csv.split(",")}
    max_page = int(max_page_s)

    records = preprocess(csv_path, lesson_id, day_codes, max_page)
    kept = [r for r in records if not r["is_noise"]]
    noise = [r for r in records if r["is_noise"]]

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

    print(f"Tong {len(records)} tin nhan hoc vien tu day_code {sorted(day_codes)}")
    print(f"  Giu lai: {len(kept)}  |  Loai (co ghi ly do): {len(noise)}")
    reasons = {}
    for r in noise:
        reasons[r["filter_reason"]] = reasons.get(r["filter_reason"], 0) + 1
    for reason, count in sorted(reasons.items(), key=lambda x: -x[1]):
        print(f"    - {reason}: {count}")
    print(f"Da ghi -> {out_path}")


if __name__ == "__main__":
    main()
