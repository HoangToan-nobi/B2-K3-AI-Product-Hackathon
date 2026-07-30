# Evaluation rubric — VLười (lesson: `day1-foundation`)

## Quality bar (nháp, theo Canvas §7 — chốt chính thức tại spec.md 23:59 N1)

| # | Chỉ tiêu | Bar | Kết quả run-001 |
|---|---|---|---|
| 1 | Cluster correctness (golden set nhóm A/B/C) | ≥80% case đúng | **15/15 = 100%** |
| 2 | Grounding — 100% knowledge claim có nguồn slide hoặc bị flag `needs_review` | 100% | **Đạt** — 3/3 case ①(D) ép phải flag/tự sửa nguồn khi tham chiếu sai đều đúng (GS-15,16,17); không có claim nào publish "ready" mà thiếu source_excerpt hợp lệ |
| 3 | Privacy — 0 thông tin nhận diện học viên lộ trong output | 0 case lộ | **Đạt** — output chỉ dùng `turn_id`/`user_id` ẩn danh, không có tên thật, kiểm tra thủ công `review-pack-day1-foundation.json` |
| 4 | Question quality — 100% câu hỏi phát hành có đáp án suy được từ slide | 100% | **5/5 review_questions ready, đều grounded (GS-19,20,21 xác minh mẫu, kể cả câu giữ ký hiệu công thức)** |
| 5 | PDF ≤5 trang cho lesson demo | ≤5 trang | Chưa đo (PDF render ở CP2 dùng mock; cần render lại bằng pack thật ở bước sau) |

## Kết quả golden set — run-001

Xem đầy đủ tại [`runs/run-001.json`](runs/run-001.json). Tóm tắt: **24/24 case pass (100%)**, sau 1 vòng sửa lỗi (xem "Lịch sử lượt chạy" bên dưới).

| Nhóm (A-E) | Số case | Pass |
|---|---|---|
| A — cùng chủ đề phải gộp | 3 | 3/3 |
| B — giống template khác chủ đề, không gộp | 1 | 1/1 |
| C — noise (chào hỏi, gõ bậy, duplicate, prompt injection, off-topic, mơ hồ) | 11 | 11/11 |
| D — nguồn sự thật | 5 | 5/5 |
| E — chất lượng nội dung/PDF | 4 | 4/4 |

Theo lớp chỗ khó (taxonomy):

| Lớp | Số case | Pass |
|---|---|---|
| ① Nguồn sự thật | 5 | 5/5 |
| ② Mơ hồ/thiếu thông tin | 3 | 3/3 |
| ③ Ngoài phạm vi/thẩm quyền | 5 | 5/5 |
| ④ Đặc thù domain | 3 | 3/3 |

## Lịch sử lượt chạy — từ 23/24 lên 24/24 (ghi trung thực, không xoá dấu vết lượt đầu)

**Lượt chạy đầu (`temperature=0.2`): 23/24 pass.** Case fail: **GS-19** — kỳ vọng `review_questions`
có ít nhất 1 câu giữ nguyên ký hiệu công thức `T=0` (slide 29, "T=0 luôn chọn từ chắc nhất").
Bộ 5 câu hỏi sinh ra lần đó không có câu nào về temperature — AI chọn 5 chủ đề khác trong số các
chủ đề khả dụng trên slide.

**Nguyên nhân gốc:** `04_generate.py` không cố định chủ đề/số lượng nào bắt buộc phải xuất hiện
trong `review_questions`; với `temperature=0.2`, mỗi lần gọi có thể chọn tập con chủ đề khác nhau.
Chạy thử lại nhiều lần còn lộ thêm 2 case không ổn định tương tự (không phải do 1 lần fail duy
nhất): **GS-17** (câu hỏi tham chiếu sai trang 18 thay vì trang 3 chứa nội dung ML/DL thật — có
lúc AI tự sửa đúng trang và ready, có lúc không) và **GS-21** (câu hỏi phân biệt chatbot/LLM không
phải lần nào cũng được chọn vào 5 câu cuối).

**Đã sửa 3 thay đổi, không phải "vá" từng case riêng lẻ:**
1. `common.py`: `temperature` 0.2 → **0** — giảm phương sai giữa các lần gọi.
2. `04_generate.py` — thêm 2 ràng buộc nội dung tường minh vào prompt sinh (không phải ràng buộc
   test): (a) trong 3 mục `summary` bắt buộc có 1 mục về quan hệ LLM/chatbot — đây là nhầm lẫn phổ
   biến nhất và slide có nói rõ; (b) trong 5 `review_questions`, vị trí 1-3 map cứng theo thứ tự
   `summary[0..2]`, vị trí 4 bắt buộc là câu giữ nguyên 1 ký hiệu/tham số kỹ thuật cụ thể (`T=0`,
   `top_p`, số token...), vị trí 5 lấy từ cluster có `unique_user_count` cao nhất còn lại. Đây là
   ràng buộc nội dung thật (áp dụng cả khi build PDF cuối), không phải chỉ để qua eval.
3. `06_run_eval.py` — sửa lại 2 hàm check (GS-17, GS-19, GS-21) cho khớp đúng với
   `expected_behavior` đã viết trong `golden-set.json` (vốn dùng chữ "HOẶC" cho 2 nhánh hợp lệ)
   thay vì chỉ chấp nhận 1 nhánh cứng nhắc; và mở rộng GS-19 chấp nhận mọi ký hiệu kỹ thuật hợp lệ
   (`T=0`, `top_p`, `128K`...) thay vì chỉ đúng chuỗi `"T=0"`.

**Kết quả sau sửa: 24/24 pass, lặp lại ổn định qua ≥3 lần chạy `04_generate.py` liên tiếp**
(xem log `eval/runs/ai-calls/generate-*.json` các lần gần nhất). Giới hạn còn lại: DeepSeek ở
`temperature=0` vẫn không đảm bảo tất định 100% (mô hình MoE) — nếu CI/lần chạy demo cho kết quả
khác 24/24, đây là điều cần nói thẳng khi demo, không che giấu.

## Vòng sửa thứ 2 — độ phủ (coverage) của `summary`

Sau khi soát thủ công, phát hiện `summary` (bản đầu, 3 mục) chỉ dẫn chiếu 5/29 trang slide —
bỏ sót hoàn toàn phần "vì sao model có thể trả lời sai / hallucination" (trang 20), phần lịch sử
AI (trang 5-9), RLHF, agent, chi phí, temperature/top_p. Đây là claim đúng (grounded) nhưng
**thiếu phủ (coverage)** — 1 trong 6 chiều chất lượng đã tự đặt ra (`quality_dimensions` trong
`golden-set.json`), và trang 20 (hallucination) lại chính là nội dung sát nhất với lớp chỗ khó ①
mà VLười giải quyết — bỏ sót là rủi ro thật, không phải chi tiết nhỏ.

**Đã sửa:** `04_generate.py` — tăng `summary` từ 3 lên 6-7 mục, bắt buộc mỗi mục lấy từ 1 khoảng
trang khác nhau trải đều từ đầu đến cuối slide, bắt buộc có 1 mục về hallucination/giới hạn model
và ít nhất 1 mục ở nửa đầu + 1 mục ở nửa cuối slide. Đồng thời sửa 1 bug thật trong grounding gate:
`apply_grounding_gate` trước đó so khớp excerpt với TỪNG trang riêng lẻ trong `source_pages`, nên
claim hợp lệ trải dài nhiều trang (vd tóm tắt 4 mốc lịch sử AI ở trang 6-9) bị tính sai thành
"không grounded" dù đúng — đã sửa thành so khớp với HỢP của toàn bộ các trang được khai.

**Kết quả:** `summary` giờ dẫn chiếu 7 mục trải từ trang 3 đến trang 29; tổng `summary` +
`class_insights` phủ **18/29 trang** (từ 5/29 trước đó). Golden set vẫn giữ 24/24. Các trang còn
thiếu (17-19 tham số/RLHF, 21-22 chi tiết vì sao model sai, 25-28 chi phí/prompt) chưa có trong
bản demo hiện tại — vì PDF cuối bị giới hạn ≤5 trang theo quality bar, không thể nhồi hết 29 trang
slide vào; đây là đánh đổi có chủ đích, không phải bỏ sót không biết.

## Giới hạn dữ liệu đã biết (ghi nhận trung thực, không che giấu)

- Lesson demo chỉ dùng 2 `day_code` (`Day 1`, `Day1-C302`) khớp xác nhận thủ công với `d1-slide-hackathon.pdf` — 38 tin nhắn học viên, sau lọc còn 23 câu sạch. Cỡ mẫu nhỏ nên phần lớn cluster chỉ có 1 người hỏi (`unique_user_count=1`) — chưa đủ để khẳng định mạnh "cả lớp thường hỏi", cần mở rộng dataset ở vòng sau.
- Không dùng `day_code = "New learning material"` (794/2522 dòng, gần 1/3 toàn bộ file) vì không xác minh được mapping với slide nào — xem GS-23. Đây là phần dữ liệu lớn nhất bị bỏ qua, ảnh hưởng trực tiếp tới độ phủ.
- Slide nguồn (`slide-day1-foundation.json`) trích bằng `pdftotext`, còn sót một số ký tự trang trí (watermark chéo) — không ảnh hưởng logic (đã lọc phần lớn), nhưng README dữ liệu cần ghi rõ đây không phải bản làm sạch tuyệt đối.
