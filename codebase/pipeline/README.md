# Pipeline VLười

Pipeline tạo review pack cho lesson `day1-foundation`.

## Yêu Cầu

- Python 3
- `pdftotext` từ Poppler
- `DEEPSEEK_API_KEY` trong `codebase/pipeline/.env` nếu muốn chạy lại AI

## Chạy Full Pipeline

```bash
cd codebase/pipeline
bash run_all.sh
```

Pipeline sẽ:

1. Trích text từ slide Day 1.
2. Lọc và chuẩn hoá chatlog theo `Day 1`, `Day1-C302`.
3. Gọi AI thật để cluster câu hỏi.
4. Gọi AI thật để sinh nội dung ôn tập.
5. Build `codebase/shared/review-pack-day1-foundation.json`.
6. Chạy golden set vào `eval/runs/run-002.json`.

Frontend Next.js đọc trực tiếp artifact trong `codebase/shared`, nên không cần export sang frontend cũ.

## Mapping Demo

- Slide: `data/vlearn-pack/slides/d1-slide-hackathon.pdf`
- Chatlog: `data/vlearn-pack/chatlog/chat_history_anonymized_for_hackathon.csv`
- Lesson id: `day1-foundation`
- Day codes: `Day 1`, `Day1-C302`
- Max page: `29`
