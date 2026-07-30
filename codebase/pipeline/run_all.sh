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

echo "== 1/7 Trich slide =="
python3 01_extract_slides.py "$SLIDE_PDF" "$LESSON_ID" ../shared/slide-$LESSON_ID.json

echo "== 2/7 Tien xu ly chatlog =="
python3 02_preprocess_chatlog.py "$CHATLOG_CSV" "$LESSON_ID" "$DAY_CODES" "$MAX_PAGE" \
  ../shared/questions-$LESSON_ID.json

echo "== 3/7 AI that: clustering =="
python3 03_cluster.py ../shared/questions-$LESSON_ID.json ../shared/slide-$LESSON_ID.json \
  ../shared/clusters-$LESSON_ID.json

echo "== 4/7 AI that: sinh noi dung =="
python3 04_generate.py ../shared/slide-$LESSON_ID.json ../shared/clusters-$LESSON_ID.json \
  ../shared/questions-$LESSON_ID.json "$LESSON_TITLE" ../shared/generated-$LESSON_ID.json

echo "== 5/7 Ghep review-pack =="
python3 05_build_pack.py "$LESSON_ID" "$LESSON_TITLE" "$MAX_PAGE" \
  ../shared/questions-$LESSON_ID.json ../shared/clusters-$LESSON_ID.json \
  ../shared/generated-$LESSON_ID.json ../shared/review-pack-$LESSON_ID.json

echo "== 6/7 Chay golden set =="
python3 06_run_eval.py ../../eval/golden-set.json ../shared/questions-$LESSON_ID.json \
  ../shared/clusters-$LESSON_ID.json ../shared/generated-$LESSON_ID.json \
  ../../eval/runs/run-001.json

echo "== 7/7 Xuat sang frontend =="
python3 07_export_frontend_data.py ../shared/review-pack-$LESSON_ID.json ../frontend/real-data.js

echo
echo "XONG. Mo codebase/frontend/index.html bang trinh duyet de xem ket qua."
