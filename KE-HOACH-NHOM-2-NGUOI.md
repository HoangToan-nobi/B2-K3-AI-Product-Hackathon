# Kế hoạch làm VLười cho nhóm 2 người

> **Sản phẩm:** VLười — *Lười đọc dài. Không lười hiểu.*  
> **Mục tiêu prototype:** Sau một buổi học, hệ thống kết hợp slide với chatlog đã ẩn danh để xác định kiến thức trọng tâm và những điểm cả lớp thường vướng, sau đó tạo một Review Pack PDF có nguồn để học viên ôn tập.

---

## 1. Nguyên tắc chia việc

Nhóm 2 người không nên chia theo kiểu:

- Cả hai cùng sửa frontend.
- Cả hai cùng viết prompt.
- Một người làm xong toàn bộ rồi mới chuyển cho người còn lại.
- Chia theo tỷ lệ mơ hồ như “mỗi người làm 50%”.

Cách chia ít conflict nhất là chia theo **ranh giới dữ liệu**:

```text
Slide + chatlog
      │
      ▼
┌───────────────────────────┐
│ Người 1: Data & AI        │
│                           │
│ Lọc → Cluster → Generate  │
│ → Evaluate → Xuất JSON    │
└─────────────┬─────────────┘
              │
              │ review-pack.json
              ▼
┌───────────────────────────┐
│ Người 2: Product & UI     │
│                           │
│ Hiển thị → Duyệt → Render │
│ PDF → Validate → Demo     │
└───────────────────────────┘
```

Điểm giao nhau duy nhất giữa hai người là một file JSON có cấu trúc cố định. Người 1 chịu trách nhiệm tạo đúng JSON; Người 2 chịu trách nhiệm biến JSON thành trải nghiệm sản phẩm và PDF.

Điều này cho phép:

- Hai người code song song.
- Frontend không phải chờ AI pipeline hoàn thiện.
- AI pipeline không cần biết UI được xây bằng framework nào.
- Khi integration lỗi, có thể dùng JSON mock để demo.
- Git conflict chủ yếu chỉ xảy ra ở tài liệu chung, không xảy ra trong code chính.

---

## 2. Vai trò và trách nhiệm

Thay `[Tên 1]` và `[Tên 2]` bằng tên thành viên thật trước khi nộp.

## 2.1 Người 1 — Data & AI Engineer

**Owner:** `[Tên 1]`

### Mục tiêu

Biến dữ liệu slide và chatlog thành một `review-pack.json` có thể kiểm chứng.

### Công việc chi tiết

#### A. Hiểu dữ liệu

- Đọc `DATA_DICTIONARY.md`.
- Xác định các field cần dùng:
  - `conversation_id`
  - `user_id`
  - `day_code`
  - `turn_id`
  - `content`
  - `citations`
  - `rating`
  - `message_created_at`
- Xác định cách mapping chatlog với buổi học.
- Kiểm tra các trường hợp `day_code` không rõ như `New learning material`.
- Viết rõ giới hạn dữ liệu, không che giấu mapping chưa chắc chắn.

#### B. Tiền xử lý chatlog

- Chỉ giữ message có `role=student` để tìm thắc mắc.
- Bóc phần ngữ cảnh từ giao diện:
  - Trang số bao nhiêu.
  - Đoạn được chọn.
  - Câu hỏi thực tế của học viên.
- Loại hoặc gắn nhãn:
  - Lời chào.
  - Tin quá ngắn.
  - Tin gửi trùng.
  - Prompt injection.
  - Câu ngoài phạm vi bài học.
  - Câu không chứa ý nghĩa học thuật.
- Không xoá âm thầm; nên lưu `filter_reason` để kiểm tra lại.

Ví dụ record sau tiền xử lý:

```json
{
  "conversation_id": "C0128",
  "user_id": "U0042",
  "turn_id": "T0831",
  "day_code": "day02-c301",
  "page": 1,
  "selected_text": "ReAct là gì?",
  "raw_question": "(Trang 1, đoạn được chọn: \"ReAct là gì?\") ReAct là gì?",
  "clean_question": "ReAct là gì?",
  "is_noise": false,
  "filter_reason": null
}
```

#### C. Clustering câu hỏi

Mục tiêu là nhóm các cách hỏi khác nhau nhưng cùng một mục đích.

Ví dụ một cluster:

```text
Tên cluster: Context window

- Context window là gì?
- Cửa sổ ngữ cảnh có phải số token không?
- Context window ảnh hưởng chi phí thế nào?
```

Không được gộp chỉ vì câu có cùng template:

```text
“Giải thích đoạn bôi đen ở Trang 7: token”
“Giải thích đoạn bôi đen ở Trang 7: attention”
```

Hai câu trên giống cấu trúc nhưng khác kiến thức.

Mỗi cluster cần có:

- `cluster_id`
- `topic`
- `unique_user_count`
- `question_count`
- Danh sách `turn_id`
- 2–5 câu đại diện
- Trang slide liên quan
- Confidence
- Lý do được chọn hoặc bị loại khỏi PDF

#### D. Xếp hạng điểm lớp thường vướng

Không dùng riêng số lượng message. Một người spam nhiều lần không được tính như nhiều học viên.

Scoring ban đầu có thể tham khảo:

```text
priority_score =
  số user duy nhất
  + tín hiệu hỏi lại
  + rating down
  + câu trả lời thiếu citation
  + mức quan trọng của chủ đề trên slide
```

Không cần biến công thức này thành “chân lý”. Phải ghi đây là heuristic thử nghiệm và kiểm tra bằng golden set.

#### E. Gọi AI

AI thực hiện ba bước riêng:

1. Xác định learning objectives và ý chính từ slide.
2. Ghép confusion cluster với phần kiến thức tương ứng.
3. Sinh:
   - Tóm tắt lý thuyết.
   - Điểm cần lưu ý.
   - Câu hỏi tự kiểm tra.
   - Đáp án và giải thích.

Không nên dùng một prompt duy nhất kiểu:

```text
“Đọc tất cả dữ liệu rồi tạo PDF giúp tôi.”
```

Pipeline nên tách:

```text
Slide
→ Extract topics
→ Map question clusters
→ Generate review content
→ Verify grounding
→ Return structured JSON
```

#### F. Grounding và quality gate

Mỗi claim kiến thức phải có:

- Trang slide nguồn.
- Đoạn trích ngắn để verifier kiểm tra.
- Trạng thái:
  - `ready`
  - `needs_review`
  - `rejected`

Quy tắc:

- Chatlog dùng để phát hiện chỗ khó.
- Slide dùng làm nguồn sự thật.
- Không coi câu trả lời cũ của Tutor là kiến thức đúng.
- Không có nguồn trong slide thì không tự động phát hành.

#### G. Eval

Người 1 chịu trách nhiệm:

- Xây golden set ≥20 case.
- Ghi định nghĩa pass/fail.
- Chạy toàn bộ golden set.
- Không xoá case fail.
- Lưu kết quả từng lần chạy.
- Phân tích failure lớn nhất.

### Thư mục sở hữu

```text
codebase/backend/
codebase/pipeline/
codebase/shared/schema/
eval/
data-samples/
```

### Definition of Done của Người 1

- Pipeline chạy từ input mẫu đến JSON.
- Có ít nhất một lời gọi AI thật.
- Output đúng schema.
- Mọi knowledge claim có nguồn hoặc `needs_review`.
- Golden set ≥20 case.
- Có ít nhất một bảng kết quả đầy đủ pass/fail.
- Không commit API key.
- Không commit nguyên data pack.

---

## 2.2 Người 2 — Product, Frontend & PDF Engineer

**Owner:** `[Tên 2]`

### Mục tiêu

Biến `review-pack.json` thành một flow có thể bấm, duyệt và xuất PDF để demo.

### Công việc chi tiết

#### A. Thiết kế flow

Prototype nên có tối đa bốn màn hình chính:

1. **Chọn buổi học**
   - Tên buổi.
   - Bộ slide.
   - Số chatlog liên quan.
   - Nút `Tạo VLười Pack`.

2. **Kết quả phân tích**
   - Số cluster.
   - Top chủ đề lớp thường hỏi.
   - Số user duy nhất.
   - Confidence.
   - Cảnh báo dữ liệu.

3. **Review nội dung**
   - Preview lý thuyết.
   - Preview điểm cần lưu ý.
   - Preview câu hỏi và đáp án.
   - Nút `Duyệt`, `Sửa`, `Bỏ`.
   - Highlight mục `needs_review`.

4. **Preview PDF**
   - Xem trước.
   - Hiển thị citation.
   - Nút tải PDF.

#### B. Dùng JSON mock trước

Người 2 không chờ pipeline. Ngay từ đầu, tạo:

```text
codebase/shared/mock-review-pack.json
```

JSON mock phải tuân thủ đúng schema đã chốt với Người 1. Khi backend hoàn thành, frontend chỉ thay nguồn dữ liệu:

```text
Mock JSON
→ API JSON
```

không viết lại component.

#### C. Trạng thái sản phẩm

UI phải xử lý đủ:

- `idle`: chưa chạy.
- `processing`: đang phân tích.
- `ready`: có thể xuất PDF.
- `needs_review`: cần Lab Coach duyệt.
- `failed`: dữ liệu lỗi hoặc API lỗi.

Không chỉ làm happy path. Case `needs_review` là phần quan trọng khi demo.

#### D. PDF

PDF nên dài 3–5 trang:

1. Trang bìa và thông tin buổi học.
2. Lý thuyết trọng tâm.
3. Cả lớp thường hỏi gì.
4. Điểm dễ nhầm.
5. Câu tự kiểm tra và đáp án.

Yêu cầu:

- Tiếng Việt hiển thị đúng.
- Không vỡ bảng.
- Không cắt câu giữa trang một cách khó đọc.
- Citation nhìn thấy rõ.
- Có version và ngày tạo.
- Có disclaimer nếu nội dung chờ duyệt.
- Không có thông tin nhận diện học viên.

#### E. Validation

Người 2 tổ chức test với:

- ≥3 học viên ngoài nhóm.
- Ưu tiên thêm ≥2 Lab Coach/TA/người vận hành.

Mỗi phiên:

1. Giao task mà không giải thích cách dùng.
2. Quan sát người dùng.
3. Ghi họ kẹt ở đâu.
4. Hỏi ba câu bắt buộc.
5. Ghi quote nguyên văn.

#### F. Demo và slide

Người 2 chịu trách nhiệm:

- Demo script 5 phút.
- Slide 6 trang.
- Backup screenshot/video.
- Đảm bảo flow demo không phụ thuộc hoàn toàn vào mạng.
- Chuẩn bị một case chuẩn và một case `needs_review`.

### Thư mục sở hữu

```text
codebase/frontend/
codebase/pdf/
validation/
demo/
```

### Definition of Done của Người 2

- Flow chính bấm được end-to-end.
- Có thể chạy bằng mock JSON.
- Có thể thay bằng API JSON.
- Render được PDF.
- Có case `needs_review`.
- Có feedback log ≥5 người nếu kịp theo rubric.
- Có demo script được bấm giờ.
- Có backup demo.

---

## 3. Data contract giữa hai người

Đây là phần phải chốt trước khi viết code.

## 3.1 Input của pipeline

Ví dụ:

```json
{
  "lesson": {
    "id": "day-01-foundation",
    "title": "Foundation — LLM và Transformer"
  },
  "slides": [
    {
      "page": 1,
      "title": "Large Language Model",
      "content": "..."
    }
  ],
  "chatlog_path": "local-only/chat_history.csv",
  "settings": {
    "max_summary_items": 7,
    "max_insights": 5,
    "question_count": 8
  }
}
```

## 3.2 Output chuẩn

```json
{
  "schema_version": "1.0",
  "pack_id": "pack-day-01-001",
  "status": "needs_review",
  "lesson": {
    "id": "day-01-foundation",
    "title": "Foundation — LLM và Transformer",
    "slide_count": 40
  },
  "analysis": {
    "student_question_count": 126,
    "unique_user_count": 54,
    "cluster_count": 8,
    "included_cluster_count": 4,
    "excluded_noise_count": 17
  },
  "summary": [
    {
      "id": "summary-01",
      "title": "Next-token prediction",
      "content": "LLM tạo nội dung bằng cách dự đoán token tiếp theo.",
      "source_pages": [24, 25],
      "source_excerpt": "Next-token prediction...",
      "confidence": 0.96,
      "status": "ready"
    }
  ],
  "class_insights": [
    {
      "id": "insight-01",
      "topic": "Hallucination",
      "unique_user_count": 12,
      "question_count": 18,
      "representative_questions": [
        "Vì sao LLM trả lời tự nhiên nhưng vẫn sai?",
        "Câu trả lời trôi chảy có đáng tin không?"
      ],
      "common_confusion": "Trôi chảy được hiểu nhầm là chính xác.",
      "correct_understanding": "LLM dự đoán token phù hợp nhưng không mặc định kiểm chứng sự thật.",
      "source_pages": [35, 36],
      "confidence": 0.89,
      "status": "ready"
    }
  ],
  "review_questions": [
    {
      "id": "question-01",
      "type": "multiple_choice",
      "difficulty": "understanding",
      "question": "Vì sao LLM có thể trả lời trôi chảy nhưng vẫn sai?",
      "options": [
        "Vì context window luôn quá nhỏ",
        "Vì dự đoán token không đồng nghĩa với kiểm chứng sự thật",
        "Vì LLM không sử dụng dữ liệu",
        "Vì mọi mô hình đều dùng rule-based system"
      ],
      "correct_option": 1,
      "answer": "Dự đoán token không đồng nghĩa với kiểm chứng sự thật.",
      "explanation": "Mục tiêu sinh token phù hợp không bảo đảm tính đúng của claim.",
      "source_pages": [35, 36],
      "confidence": 0.92,
      "status": "ready"
    }
  ],
  "warnings": [
    {
      "code": "LOW_CONFIDENCE_MAPPING",
      "message": "Hai cluster chưa map chắc chắn với slide.",
      "item_ids": ["insight-05", "insight-06"]
    }
  ],
  "generated_at": "2026-07-30T10:00:00+07:00"
}
```

## 3.3 Quy tắc thay đổi schema

Không ai được tự đổi field.

Quy trình:

1. Tạo GitHub issue: `Schema change: ...`
2. Nêu lý do.
3. Nêu field cũ và field mới.
4. Cả hai đồng ý.
5. Sửa schema trước.
6. Sửa mock JSON.
7. Sửa backend và frontend.
8. Merge thành một PR riêng.

Nếu đổi schema cùng lúc với một feature lớn, conflict gần như chắc chắn xảy ra.

---

## 4. Cấu trúc repository

```text
repo/
├── README.md
├── spec.md
├── demo-slides.pdf
├── KE-HOACH-NHOM-2-NGUOI.md
│
├── codebase/
│   ├── frontend/
│   ├── backend/
│   ├── pipeline/
│   ├── pdf/
│   └── shared/
│       ├── schema/
│       │   └── review-pack.schema.json
│       └── mock-review-pack.json
│
├── eval/
│   ├── golden-set.json
│   ├── evaluation-rubric.md
│   └── runs/
│       ├── run-001.json
│       └── run-002.json
│
├── validation/
│   ├── feedback-log.md
│   └── findings.md
│
├── data-samples/
│   └── README.md
│
├── demo/
│   ├── script.md
│   └── backup/
│
└── reflection/
    ├── member-1.md
    └── member-2.md
```

## Ownership

| Path | Owner chính | Người còn lại được làm gì? |
|---|---|---|
| `codebase/pipeline/` | Người 1 | Review, không sửa trực tiếp |
| `codebase/backend/` | Người 1 | Review API contract |
| `eval/` | Người 1 | Người 2 góp case từ user test |
| `data-samples/` | Người 1 | Review bảo mật |
| `codebase/frontend/` | Người 2 | Review, không sửa trực tiếp |
| `codebase/pdf/` | Người 2 | Người 1 review citation |
| `validation/` | Người 2 | Người 1 tham gia test |
| `demo/` | Người 2 | Người 1 góp phần thuyết trình |
| `codebase/shared/` | Cả hai | Chỉ đổi qua PR riêng |
| `spec.md` | Người 2 tổng hợp | Người 1 viết nội dung AI/eval qua PR |
| `README.md` | Người 2 tổng hợp | Người 1 kiểm tra phần kỹ thuật |

---

## 5. Git và GitHub workflow

## 5.1 Nhánh

Không dùng một branch dài hạn cho mỗi người. Dùng branch ngắn theo feature:

```text
main
├── feat/chatlog-cleaning
├── feat/question-clustering
├── feat/review-pack-api
├── feat/review-dashboard
├── feat/pdf-export
├── eval/golden-set
└── docs/spec
```

Tên branch:

```text
feat/<tính-năng>
fix/<lỗi>
eval/<nội-dung>
docs/<tài-liệu>
```

## 5.2 Bắt đầu một task

```bash
git switch main
git pull --rebase origin main
git switch -c feat/chatlog-cleaning
```

## 5.3 Commit

Commit nhỏ, mỗi commit một mục đích:

```bash
git add codebase/pipeline
git commit -m "feat: normalize student questions before clustering"
```

Ví dụ message:

```text
feat: add review pack JSON schema
feat: cluster learner questions by semantic intent
fix: exclude interface template from similarity score
eval: add adversarial clustering cases
docs: document pipeline limitations
```

Không dùng:

```text
update
fix stuff
done
final final
```

## 5.4 Trước khi push

```bash
git fetch origin
git rebase origin/main
```

Sau đó chạy test liên quan rồi:

```bash
git push -u origin feat/chatlog-cleaning
```

## 5.5 Pull Request

Mỗi PR nên ghi:

```markdown
## Làm gì?
- Chuẩn hoá câu hỏi học viên.
- Loại prefix từ giao diện.

## Test thế nào?
- Chạy trên 100 dòng mẫu.
- Kiểm tra 10 case thủ công.

## Output thay đổi?
- Không đổi schema.

## Rủi ro?
- Một số câu quá ngắn có thể bị lọc nhầm.

## Screenshot / sample output
...
```

## 5.6 Quy tắc review

- Người còn lại review mọi PR.
- PR nhỏ có thể review nhanh trong 5–10 phút.
- Không merge nếu:
  - Có API key.
  - Có nguyên data pack.
  - Đổi schema không báo.
  - Không có cách test.
  - Làm hỏng mock demo.
- Merge bằng squash để lịch sử `main` dễ đọc.

## 5.7 Tần suất merge

- Merge mỗi 1–2 giờ khi có phần chạy được.
- Không giữ branch quá nửa ngày nếu có thể tách nhỏ.
- Không chờ đến tối mới merge toàn bộ.

---

## 6. Cách xử lý conflict

## 6.1 Trước khi sửa

Kiểm tra:

```bash
git status
git pull --rebase origin main
```

Báo người còn lại nếu chuẩn bị sửa file dùng chung.

## 6.2 Khi conflict xảy ra

1. Không chọn mù `Accept Current` hoặc `Accept Incoming`.
2. Xác định mỗi phía đang muốn giữ hành vi gì.
3. Với schema: dừng lại và thống nhất contract trước.
4. Với tài liệu: owner file tổng hợp.
5. Chạy lại test sau khi resolve.

Sau khi sửa conflict:

```bash
git add <file-da-sua>
git rebase --continue
```

Nếu không chắc mình đang giữ đúng logic của người kia, gọi nhau xem 5 phút thay vì tự đoán.

## 6.3 Tránh conflict bằng ownership

Conflict tốt nhất là conflict không xảy ra:

- Người 1 không sửa component UI.
- Người 2 không sửa thuật toán clustering.
- Schema đổi bằng PR riêng.
- `spec.md` chỉ có một owner tổng hợp.
- Không chạy formatter toàn repo trong feature PR.

---

## 7. Kế hoạch theo checkpoint

Thời gian cụ thể phải điều chỉnh theo lịch K3/K4, nhưng thứ tự không đổi.

## CP1 — Canvas

### Cùng làm

- Chốt user, pain, evidence và lát cắt.
- Chốt tên VLười.
- Chốt một buổi học dùng cho demo.
- Chốt ai là Người 1, ai là Người 2.

### Output

- Canvas hoàn chỉnh.
- GitHub Project/issue board.
- Danh sách user sẵn sàng thử.

## Sau CP1 — Chốt contract, tối đa 45 phút

### Cùng làm

- Viết `review-pack.schema.json`.
- Viết `mock-review-pack.json`.
- Vẽ flow bốn màn hình.
- Chốt API.

### Điều kiện để tách việc

- Frontend đọc được mock JSON.
- Hai người hiểu ý nghĩa mọi field.
- Không còn tranh luận về output.

## CP2 — Bấm được

### Người 1

- Script đọc CSV.
- Trích student message.
- Tạo output preprocessing mẫu.

### Người 2

- UI bốn màn hình bằng mock JSON.
- Nút tạo pack.
- Dashboard cluster giả lập.
- Preview PDF giả lập.

### Output

- Flow chính bấm hết được.
- Có commit đầu.
- Không cần AI thật ở thời điểm này.

## CP3 — AI thật + đo lượt đầu

### Người 1

- Lời gọi AI thật.
- Clustering hoặc generation chạy thật.
- Golden set ≥20 case.
- Run đầu tiên có pass/fail.

### Người 2

- Kết nối API hoặc đọc output JSON thật.
- Render PDF thật.
- Hiển thị `needs_review`.

### Output

- End-to-end tối thiểu cho một buổi.
- Có log/trace AI.
- Có bảng kết quả lượt đầu.

## CP4 — Chốt spec

### Người 1

- Điền evidence.
- Phương pháp mining.
- Bốn lớp chỗ khó.
- Golden set, quality bar và kết quả.

### Người 2

- Tổng hợp `spec.md`.
- Non-goals.
- Nguyên tắc HAX/PAIR và vị trí áp dụng.
- Demo flow.
- Kế hoạch validation.

### Output

- `spec.md` đủ các mục.
- Quality bar bằng số.
- Không thêm feature mới sau mốc này.

## CP5 — Validation + dry run

### Người 1

- Sửa failure quan trọng nhất.
- Chạy lại toàn bộ golden set.
- Ghi regression nếu có.

### Người 2

- Test với người dùng.
- Ghi feedback log.
- Chốt PDF layout.
- Dry run và bấm giờ.

### Output

- Feedback log.
- Changelog.
- Slide final.
- Demo backup.

## CP6 — Demo

### Người 1 trình bày

- Evidence từ data.
- Cách clustering hoạt động.
- AI decision.
- Golden set và kết quả đo.

### Người 2 trình bày

- Pain và JTBD.
- Product flow.
- Demo.
- Validation và roadmap.

Cả hai phải trả lời được:

- Vì sao không chỉ dùng ChatGPT tóm tắt slide?
- Vì sao chatlog chỉ là signal, không phải nguồn sự thật?
- Case nguy hiểm nhất là gì?
- Khi nào PDF không được tự động phát hành?
- Quality bar được đo thế nào?

---

## 8. Task board đề xuất

Tạo các GitHub issue sau:

### Chung

- `[P0] Chốt JSON schema`
- `[P0] Chọn lesson demo`
- `[P0] Viết mock review pack`
- `[P0] Chốt quality dimensions`

### Người 1

- `[P0] Parse chatlog CSV`
- `[P0] Remove UI template from questions`
- `[P0] Filter noise and prompt injection`
- `[P0] Build clustering baseline`
- `[P0] Rank confusion clusters`
- `[P0] Generate grounded review content`
- `[P0] Build golden set`
- `[P0] Run evaluation`
- `[P1] Improve cluster naming`
- `[P1] Add grounding verifier`

### Người 2

- `[P0] Build lesson selection screen`
- `[P0] Build cluster dashboard`
- `[P0] Build review and approval flow`
- `[P0] Render Review Pack PDF`
- `[P0] Support needs-review state`
- `[P0] Create validation log`
- `[P0] Write demo script`
- `[P0] Prepare backup demo`
- `[P1] Improve mobile layout`
- `[P1] Add PDF version history`

`P0` là bắt buộc để demo. `P1` chỉ làm sau khi P0 chạy end-to-end.

---

## 9. API tối thiểu

## Tạo Review Pack

```http
POST /api/review-packs
```

Request:

```json
{
  "lesson_id": "day-01-foundation"
}
```

Response:

```json
{
  "pack_id": "pack-day-01-001",
  "status": "processing"
}
```

## Xem trạng thái

```http
GET /api/review-packs/pack-day-01-001
```

Response là JSON theo schema chung.

## Duyệt item

```http
PATCH /api/review-packs/pack-day-01-001/items/insight-01
```

Request:

```json
{
  "status": "ready",
  "content": "Nội dung sau khi Lab Coach sửa."
}
```

## Xuất PDF

```http
GET /api/review-packs/pack-day-01-001/pdf
```

Trong prototype, nếu chưa có database, có thể lưu pack tạm trong file hoặc memory. Phải ghi rõ phần nào mock.

---

## 10. Golden set

Golden set không chỉ test output đẹp. Nó phải test quyết định AI.

## Nhóm case

### A. Cùng chủ đề — phải gộp

- Hai cách hỏi khác nhau về context window.
- Câu hỏi Việt/Anh cùng một khái niệm.
- Câu hỏi có và không có đoạn được chọn.

### B. Giống câu nhưng khác chủ đề — không được gộp

- Template giống nhau nhưng chọn `token` và `attention`.
- Cùng trang nhưng hỏi hai mục đích khác nhau.

### C. Noise

- Hello.
- Một ký tự.
- Gửi trùng.
- Prompt injection.
- Hỏi model/system prompt.

### D. Nguồn sự thật

- Cluster có câu hỏi nhưng slide không có đáp án.
- Tutor cũ trả lời nhưng không có citation.
- Câu hỏi yêu cầu kiến thức ngoài buổi học.

### E. PDF generation

- Công thức cần giữ nguyên.
- Bảng không được diễn giải sai.
- Nội dung hành chính phải bỏ.
- Ý quan trọng xuất hiện ở nhiều trang phải gộp.

## Quality dimensions

1. **Cluster correctness:** câu được gán đúng nhóm.
2. **Coverage:** không bỏ các chủ đề quan trọng.
3. **Grounding:** claim/đáp án có nguồn trong slide.
4. **Question quality:** câu hỏi rõ và chấm được.
5. **Privacy:** không lộ thông tin nhận diện.
6. **Usefulness:** học viên thấy hữu ích khi ôn.

## Quality bar nháp

Chỉ chốt sau lượt thử đầu, ví dụ:

```text
- ≥80% case clustering đúng.
- 100% knowledge claim có nguồn slide.
- 0 trường hợp lộ thông tin nhận diện.
- 100% câu hỏi phát hành có đáp án suy ra được từ slide.
- PDF không vượt quá 5 trang cho lesson demo.
```

---

## 11. Validation

## Task cho học viên

> “Bạn vừa nghỉ buổi học này. Hãy dùng VLười Pack để nắm ý chính và trả lời ba câu ôn tập.”

Không giải thích nút bấm trong khi họ làm.

Ghi:

- Họ bắt đầu từ đâu.
- Có hiểu mục “Cả lớp thường hỏi” không.
- Có bấm xem nguồn không.
- Có phân biệt nội dung chính và insight từ chatlog không.
- Mất bao lâu.
- Trả lời đúng bao nhiêu câu.

## Ba câu phỏng vấn

1. Điều gì khó hiểu hoặc khó chịu nhất?
2. Bạn có tin nội dung trong pack không? Vì sao?
3. Bạn có dùng sau mỗi buổi không? Vì sao hoặc vì sao chưa?

## Task cho Lab Coach

> “Hãy kiểm tra ba mục được hệ thống đánh dấu và quyết định mục nào có thể phát hành.”

Ghi:

- Review mất bao lâu.
- Thông tin nào còn thiếu.
- Họ có hiểu lý do mục bị flag không.
- Họ có muốn sửa trực tiếp hay chỉ approve/reject.

---

## 12. Kế hoạch dự phòng

## Nếu clustering AI chưa chạy ổn

- Dùng 3–5 cluster đã được curate thủ công.
- AI thật vẫn chạy ở bước sinh nội dung/câu hỏi.
- Ghi rõ clustering nào mock.

## Nếu API lỗi khi demo

- Dùng `mock-review-pack.json`.
- Có video/screenshot của lần chạy thật.
- Giữ log lần gọi AI thật trong repo.

## Nếu PDF render lỗi

- Preview HTML phải vẫn hoạt động.
- Có PDF backup đã tạo trước.
- Không để toàn bộ demo phụ thuộc nút download.

## Nếu chưa có slide thật

- Dùng một bộ slide mẫu hoặc chuyển nội dung transcript thành slide giả lập.
- Ghi rõ trong spec và demo.
- Không tuyên bố slide giả là dữ liệu production.

## Nếu mapping `day_code` không đủ tin cậy

- Chọn một subset mapping chắc chắn.
- Demo đúng subset đó.
- Không cố phân tích toàn bộ data rồi đưa ra con số thiếu căn cứ.

---

## 13. Daily sync cho nhóm 2 người

Mỗi 60–90 phút, sync tối đa 5 phút:

```text
1. Tôi vừa hoàn thành gì?
2. Output nào đã merge?
3. Tôi đang làm gì tiếp?
4. Có đổi schema không?
5. Có blocker nào cần người kia xử lý?
```

Không họp dài. Nếu cần thảo luận thiết kế, tạo một quyết định có tên:

```text
Decision: Có tự động phát hành PDF không?
Options: Automate / Conditional
Choice: Conditional
Reason: Sai một claim có thể khiến cả lớp học sai.
```

Ghi quyết định vào `spec.md` hoặc issue thay vì chỉ nói miệng.

---

## 14. Checklist bắt đầu ngay

### Cả hai

- [ ] Điền tên thật vào tài liệu này.
- [ ] Tạo repo nhóm và bảo vệ `main`.
- [ ] Tạo GitHub Project hoặc issue board.
- [ ] Chọn một lesson demo.
- [ ] Chốt JSON schema.
- [ ] Tạo mock JSON.
- [ ] Chốt bốn màn hình.

### Người 1

- [ ] Parse được CSV.
- [ ] Tách được câu hỏi khỏi template giao diện.
- [ ] Tạo 20 case golden set đầu tiên.
- [ ] Thử baseline clustering.
- [ ] Lưu output JSON mẫu.

### Người 2

- [ ] Dựng flow từ mock JSON.
- [ ] Có màn hình cluster.
- [ ] Có màn hình review.
- [ ] Render thử một PDF.
- [ ] Chuẩn bị mẫu feedback log.

---

## 15. Tiêu chí thành công của cả nhóm

Prototype được coi là sẵn sàng demo khi:

- Một lesson chạy end-to-end.
- Có ít nhất một lời gọi AI thật.
- Có thể giải thích AI quyết định gì.
- Có JSON contract ổn định.
- Có một case bình thường.
- Có một case `needs_review`.
- Có PDF thật.
- Có citation về slide.
- Có golden set và bảng kết quả.
- Có feedback người dùng.
- Không lộ API key.
- Không commit nguyên data pack.
- Cả hai thành viên giải thích được phần mình phụ trách và flow tổng thể.

> **Nguyên tắc cuối:** merge thường xuyên, giữ contract ổn định và luôn duy trì một đường demo chạy được bằng mock data.
