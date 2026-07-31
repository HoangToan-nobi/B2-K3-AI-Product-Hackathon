# AI Spec — VLười

## 1. Problem

Sau một buổi học lý thuyết, học viên phải đọc lại nhiều slide để ôn tập. Trong khi đó, các câu hỏi thật mà cả lớp hỏi AI Tutor lại nằm rải rác trong chatlog riêng lẻ, nên không trở thành tài liệu dùng chung.

VLười giải quyết lát cắt: **biến slide + chatlog sau buổi học thành learning intelligence cho Lab Coach và review pack grounded cho học viên.**

## 2. User

- User vận hành chính: Lab Coach cần biết lớp đang vướng gì để trao đổi với giảng viên.
- User học tập: học viên cần ôn lại, thấy phần cả lớp quan tâm nhiều và hỏi lại trong phạm vi bài học.
- User gián tiếp: giảng viên cải thiện slide/cách giảng cho khóa sau.

## 3. Input

- Slide Day 1: `data/vlearn-pack/slides/d1-slide-hackathon.pdf`.
- Chatlog AI Tutor đã ẩn danh: `data/vlearn-pack/chatlog/chat_history_anonymized_for_hackathon.csv`.
- Mapping demo: `Day 1`, `Day1-C302`, trang 1-29.

## 4. AI Decision

AI thực hiện hai quyết định trung tâm:

1. **Clustering:** lọc noise và nhóm các câu hỏi học viên theo chủ đề/khái niệm, không nhóm chỉ vì cùng template.
2. **Generation:** sinh summary, class insight và câu tự kiểm tra, nhưng chỉ được dùng slide làm nguồn sự thật.

Các nội dung confidence thấp hoặc nguồn không chắc được gắn `needs_review` để Lab Coach duyệt.

## 5. Product Slice

Luồng demo:

```text
Chọn buổi học
-> xem input slide + chatlog mẫu
-> tải hoặc chạy lại pipeline
-> xem confusion cluster
-> Lab Coach duyệt blindspot
-> preview/export PDF
-> học viên xem bản ôn tập đã duyệt
```

Output gồm:

- Dashboard top confusion topic, severity và heatmap theo slide.
- Teacher brief cho Lab Coach trao đổi với giảng viên.
- Màn upload/quản lý buổi học: thêm, sửa tên/số trang, xoá buổi đã upload.
- Màn biên tập nội dung trọng tâm: Lab Coach thêm/sửa/xoá mục, kiểm tra trang nào đã được tóm tắt/citation.
- Học liệu trọng tâm đầy đủ từ slide, phủ toàn bài theo thứ tự bài học, không chỉ là vài ý tóm tắt.
- Câu hỏi/điểm vướng được Lab Coach chọn đưa vào pack hoặc không gửi học viên; mọi cluster học thuật đều cần có mục để Lab Coach kiểm soát.
- Cách hiểu đúng theo slide.
- 20-30 câu tự kiểm tra/quiz cho mỗi bài học để Lab Coach duyệt trước khi gửi.
- Q&A grounded cho học viên hỏi lại sau buổi học.
- Citation về trang slide gốc.

## 6. Safety And Risk

- Slide là nguồn sự thật duy nhất cho kiến thức.
- Chatlog chỉ là tín hiệu phát hiện điểm khó.
- Không publish nội dung thiếu căn cứ dưới trạng thái `ready`.
- Không lộ danh tính học viên; chỉ dùng user/turn id đã ẩn danh.
- Prompt injection, off-topic, greeting, duplicate được lọc hoặc loại khỏi nội dung phát hành.

## 7. Quality Bar

| Chỉ tiêu | Mục tiêu | Kết quả hiện tại |
|---|---:|---:|
| Golden set pass rate | >= 80% | 24/24 = 100% |
| Claim published có source từ slide | 100% | Đạt |
| Lộ thông tin nhận diện | 0 case | Đạt |
| Câu tự kiểm tra có đáp án từ slide | 100% | Đạt |
| Lab Coach duyệt mục rủi ro | Có | Đạt |

## 8. Prototype Level

Mức prototype: **Working slice**.

Working:

- Next.js frontend bấm được theo vai Lab Coach/Học viên.
- Lab Coach thấy thống kê câu hỏi, severity, heatmap slide và teacher brief.
- Lab Coach upload dữ liệu thật và quản lý buổi đã upload.
- Lab Coach chỉnh sửa nội dung trọng tâm trước khi phát hành.
- Học viên thấy learning map, review pack và Q&A grounded.
- API đọc artifact, cập nhật trạng thái duyệt, export PDF.
- Pipeline Python có log AI thật.
- Next.js server có fallback TypeScript để gọi AI khi môi trường deploy không chạy được Python.

Fallback:

- Nếu thiếu `DEEPSEEK_API_KEY` hoặc runtime không hỗ trợ pipeline, app dùng artifact đã sinh sẵn để demo ổn định.

## 9. Known Limits

- Demo mới dùng Day 1, cỡ mẫu còn nhỏ: 38 tin nhắn liên quan, 7 user ẩn danh.
- Chưa mở rộng sang toàn bộ lesson trong data pack.
- PDF export hiện là bản đơn giản phục vụ demo, chưa phải bản thiết kế final.
- Chưa có production database/object storage; hiện metadata, upload và review pack còn lưu bằng local JSON/file. Schema production đề xuất nằm ở `docs/production-data-architecture.md`.
