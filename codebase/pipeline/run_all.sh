#!/usr/bin/env bash
# Chay toan bo pipeline VLười cho buoi day1-foundation, tu dau den cuoi.
# Dung: bash run_all.sh
set -euo pipefail
cd "$(dirname "$0")"

SLIDE_PDF=../../data/vlearn-pack/slides/d1-slide-hackathon.pdf
CHATLOG_CSV=../../data/vlearn-pack/chatlog/chat_history_anonymized_for_hackathon.csv
LESSON_ID=day1-foundation
LESSON_TITLE="AI & LLM Foundation (Day 1)"
DAY_CODES="Day 1,Day1-C302"
MAX_PAGE=29

echo "== 1/6 Trich slide =="
python3 01_extract_slides.py "$SLIDE_PDF" "$LESSON_ID" ../shared/slide-$LESSON_ID.json

echo "== 2/6 Tien xu ly chatlog =="
python3 02_preprocess_chatlog.py "$CHATLOG_CSV" "$LESSON_ID" "$DAY_CODES" "$MAX_PAGE" \
  ../shared/questions-$LESSON_ID.json

echo "== 3/6 AI that: clustering =="
python3 03_cluster.py ../shared/questions-$LESSON_ID.json ../shared/slide-$LESSON_ID.json \
  ../shared/clusters-$LESSON_ID.json

echo "== 4/6 AI that: sinh noi dung =="
python3 04_generate.py ../shared/slide-$LESSON_ID.json ../shared/clusters-$LESSON_ID.json \
  ../shared/questions-$LESSON_ID.json "$LESSON_TITLE" ../shared/generated-$LESSON_ID.json

echo "== 5/6 Ghep review-pack =="
python3 05_build_pack.py "$LESSON_ID" "$LESSON_TITLE" "$MAX_PAGE" \
  ../shared/questions-$LESSON_ID.json ../shared/clusters-$LESSON_ID.json \
  ../shared/generated-$LESSON_ID.json ../shared/review-pack-$LESSON_ID.json

echo "== 6/6 Chay golden set =="
# Luu y: doi ten output (bien RUN_OUT) truoc khi chay lai neu muon giu ban truoc do lam bang
# chung lich su thay vi bi ghi de — xem eval/evaluation-rubric.md muc "Lich su luot chay".
RUN_OUT=${RUN_OUT:-../../eval/runs/run-002.json}
python3 06_run_eval.py ../../eval/golden-set.json ../shared/questions-$LESSON_ID.json \
  ../shared/clusters-$LESSON_ID.json ../shared/generated-$LESSON_ID.json \
  "$RUN_OUT"

echo
echo "XONG. Chay Next.js trong codebase/frontend de xem ket qua."
