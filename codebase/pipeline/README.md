# Pipeline VLười — day1-foundation

Khong dung SDK ngoai, chi Python 3 stdlib + `pdftotext` (poppler-utils, co san tren Linux/Mac).
Goi AI that qua DeepSeek API (OpenAI-compatible) bang `urllib` thuan.

## Cai dat

Tao `codebase/pipeline/.env` (da nam trong `.gitignore`, khong commit):

```
DEEPSEEK_API_KEY=sk-...
```

## Chay tuan tu tu thu muc nay

```bash
python3 01_extract_slides.py ../../data/vlearn-pack/slides/d1-slide-hackathon.pdf \
  day1-foundation ../shared/slide-day1-foundation.json

python3 02_preprocess_chatlog.py \
  ../../data/vlearn-pack/chatlog/chat_history_anonymized_for_hackathon.csv \
  day1-foundation "Day 1,Day1-C302" 29 \
  ../shared/questions-day1-foundation.json

python3 03_cluster.py ../shared/questions-day1-foundation.json \
  ../shared/slide-day1-foundation.json ../shared/clusters-day1-foundation.json

python3 04_generate.py ../shared/slide-day1-foundation.json \
  ../shared/clusters-day1-foundation.json ../shared/questions-day1-foundation.json \
  "AI & LLM Foundation (Day 1)" ../shared/generated-day1-foundation.json

python3 05_build_pack.py day1-foundation "AI & LLM Foundation (Day 1)" 29 \
  ../shared/questions-day1-foundation.json ../shared/clusters-day1-foundation.json \
  ../shared/generated-day1-foundation.json ../shared/review-pack-day1-foundation.json

python3 06_run_eval.py ../../eval/golden-set.json ../shared/questions-day1-foundation.json \
  ../shared/clusters-day1-foundation.json ../shared/generated-day1-foundation.json \
  ../../eval/runs/run-001.json

python3 07_export_frontend_data.py ../shared/review-pack-day1-foundation.json \
  ../frontend/real-data.js
```

## Vi sao chon day1-foundation / day_code = "Day 1" + "Day1-C302"

`data/vlearn-pack/slides/` chi co 2 file PDF (`d1-slide-hackathon.pdf`, `d2-slide-hackathon.pdf`),
trong khi CSV co >15 `day_code` khac nhau — phan lon khong co slide nguon di kem nen khong the
grounding. Doi chieu noi dung thuc te (tieu de trang, tu khoa "token/attention/transformer",
so trang tham chieu nam trong 1-29), chi `day_code = "Day 1"` va `"Day1-C302"` khop voi
`d1-slide-hackathon.pdf`. Cac `day_code` co keyword-hit cao khac (vd `Lecture_material_ms2044ey_k6uor3`,
noi ve ReAct/LangGraph) da kiem tra tay va xac dinh la bai khac, khong dung.
`"New learning material"` (794/2522 dong, gan 1/3 file) bi loai vi khong xac minh duoc mapping —
xem `eval/golden-set.json` case GS-23.

## Log lan goi AI

Moi lan goi that (`call_ai_json` trong `common.py`) ghi 1 file JSON vao
`eval/runs/ai-calls/<stage>-<timestamp>.json` gom prompt gui di + response tho nhan ve — bang
chung khong hardcode cho R5.

## Cac buoc con thieu (chua lam trong phien nay)

- Chua co bao cao PDF that (render tu `review-pack-day1-foundation.json`) — hien PDF preview
  trong `codebase/frontend` van la HTML render, chua xuat file `.pdf` vat ly.
- Chua mo rong dataset ngoai 2 `day_code` hien tai — golden set GS ghi nhan han che nay
  (`eval/evaluation-rubric.md` phan "Gioi han du lieu").
