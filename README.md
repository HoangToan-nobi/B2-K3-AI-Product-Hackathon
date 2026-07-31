# VLười

**Lười đọc dài. Không lười hiểu.**

VLười là prototype **learning intelligence sau buổi học** từ **slide chính thức** và **chatlog AI Tutor đã ẩn danh**. Sản phẩm giúp Lab Coach thấy lớp đang vướng gì, trao đổi lại với giảng viên để cải thiện bài dạy, rồi phát hành review pack và Q&A grounded cho học viên.

## Demo Flow

1. Mở app ở vai **Lab Coach**.
2. Vào **1. Upload/Sửa/Xoá buổi học** để upload slide PDF + chatlog CSV thật, chọn/sửa/xoá buổi đã upload.
3. Vào **2. Dữ liệu vào** để kiểm tra đúng slide/chatlog của buổi đang chọn, rồi bấm **Tải pack demo** hoặc **Chạy lại AI** nếu đã cấu hình `DEEPSEEK_API_KEY`.
4. Vào **3. Phân tích lớp** để trả lời ngay: lớp chưa hiểu gì, cần nói gì với giảng viên, gửi gì cho học viên.
5. Vào **4. Duyệt nội dung** để thêm/sửa lý thuyết trọng tâm, kiểm tra độ phủ slide và chọn câu hỏi/điểm vướng nào được đưa vào pack học viên.
6. Vào **5. Gửi học viên** để preview và tải PDF.
7. Chuyển sang vai **Học viên** để thấy learning map, bản ôn tập đã duyệt và khung hỏi lại grounded.

## Chạy Frontend

```bash
cd codebase/frontend
npm install
npm run dev
```

Mở `http://localhost:3000`.

## Build/Deploy

Root deploy nên trỏ vào:

```text
codebase/frontend
```

Lệnh build:

```bash
npm run build
```

Environment variable tuỳ chọn:

```text
DEEPSEEK_API_KEY=...
```

Nếu không có key, app vẫn demo được bằng artifact đã sinh sẵn trong `codebase/shared/review-pack-day1-foundation.json`. Nếu có key, nút **Chạy lại AI** sẽ gọi DeepSeek thật qua API route của Next.js.

### Database Và Storage

Bản hiện tại dùng local JSON/file storage để demo nhanh: `codebase/shared/local-db.json`, `review-pack-*.json` và thư mục upload local. Cách này không đủ cho production vì serverless/multi-instance có thể mất hoặc lệch state.

Khi vận hành thật cần:

- Postgres cho lesson metadata, review pack, review item, job state và audit log.
- Object storage cho PDF slide, CSV chatlog, artifact JSON và PDF export.
- Auth thật thay cho role header demo.
- Queue/worker cho pipeline dài.

Schema đề xuất nằm ở `docs/production-data-architecture.md`.

### Vận hành với dữ liệu buổi học mới

- Upload PDF + CSV ở **1. Upload/Sửa/Xoá buổi học**, điền `day_code` nếu file chứa nhiều buổi; để trống nếu CSV chỉ có một buổi. Số trang slide được đọc tự động từ PDF bằng Poppler (`pdfinfo`).
- Khi bấm **Chạy lại AI**, server sẽ preprocess PDF bằng Poppler (`pdftotext`) và CSV bằng rule-based filter, tạo artifact riêng cho lesson rồi mới gọi clustering/generation.
- Self-host cần Node.js, Python 3 và Poppler (`pdfinfo`, `pdftotext`). Serverless không có Python/Poppler sẽ không thể phân tích PDF upload mới; không nên coi artifact demo là kết quả của dữ liệu upload.
- Chatbot học viên chạy qua server route `/api/review-packs/[packId]/qa`, chỉ nhận nội dung đã duyệt và trả citation trang slide. Thiếu API key hoặc không tìm được evidence thì dùng câu trả lời an toàn, không suy đoán.
- File upload bị giới hạn 25MB cho PDF và 10MB cho CSV. Dữ liệu nhận diện chỉ nên được ẩn danh trước khi upload.

## Cấu Trúc Chính

```text
codebase/frontend/          Next.js app demo
codebase/pipeline/          Pipeline Python gốc: extract, preprocess, cluster, generate, eval
codebase/shared/            Artifact đã sinh cho demo Day 1
data/vlearn-pack/           Slide Day 1 + chatlog ẩn danh
eval/                       Golden set, kết quả chạy, log AI calls
spec.md                     AI spec của sản phẩm
validation/                 Log feedback thử nghiệm
reflection/                 Reflection cá nhân/nhóm
```

## Phần Thật Và Fallback

- Thật: upload slide/chatlog, quản lý buổi upload, preprocess chatlog, cluster bằng AI, generate nội dung bằng AI, grounding gate, Lab Coach dashboard, teacher brief, chỉnh sửa nội dung trọng tâm, role-based view, duyệt item, student Q&A grounded, export PDF.
- Local demo: metadata và review pack đang lưu bằng JSON/file trong `codebase/shared`.
- Fallback: khi deploy không có Python/Poppler hoặc thiếu API key, app dùng artifact đã sinh trước để demo không bị gãy.
- Demo hiện chỉ dùng lesson `day1-foundation`: 29 slide, 38 tin nhắn liên quan, 7 user ẩn danh, 8 cluster.

## Kiểm Thử

```bash
cd codebase/frontend
npm run test:review-pack
npm run lint
npm run build
```

Kết quả eval chính thức nằm ở `eval/runs/run-002.json`: **24/24 case pass** theo golden set.
