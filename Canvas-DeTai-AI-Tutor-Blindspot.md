# Startup Canvas — Venture Arena
**Chiến tuyến:** 01 — Tính năng AI mới trên VLearn  
**Tên Startup:** **VLười**  
**Slogan:** *Lười đọc dài. Không lười hiểu.*

---

## 1. Pain Point

Sau một buổi học lý thuyết, học viên phải đọc lại toàn bộ slide để ôn tập. Trong khi đó, những câu hỏi thực tế mà cả lớp đã hỏi AI Tutor — phản ánh các điểm khó, dễ nhầm hoặc chưa được giải thích rõ — lại nằm rải rác trong hàng trăm hội thoại riêng lẻ và không được tận dụng cho cả lớp.

Kết quả:

- Học viên mất thời gian đọc lại một bộ slide dài để tự xác định ý chính.
- Một học viên không biết những phần nào đang khiến nhiều bạn khác cùng thắc mắc.
- Các câu hỏi có giá trị bị lặp lại hoặc biến mất trong chatlog sau buổi học.
- Lab Coach không thể đọc thủ công toàn bộ hội thoại để tạo tài liệu ôn tập.

**Ai gặp phải:** Học viên cần ôn lại hoặc bắt kịp nội dung sau buổi học.  
**Ai chịu thiệt hại gián tiếp:** Lab Coach và đội vận hành nội dung VLearn — không tận dụng được chatlog để cải thiện tài liệu ôn tập.

## 2. Bằng chứng (Evidence)

- **Nguồn dữ liệu:** Slide của buổi học và chatlog AI Tutor đã ẩn danh trong data pack chính thức.
- **Quy mô chatlog hiện có:** 1.261 lượt hỏi–đáp thuộc 585 hội thoại của 369 mã người dùng đã ẩn danh.
- **Tín hiệu khả dụng:** `day_code`, `conversation_id`, `user_id`, nội dung đoạn được chọn, số trang, citation và rating.
- **Phương pháp mining dự kiến:**
  1. Lọc chatlog theo đúng buổi học/tài liệu.
  2. Loại lời chào, tin gửi trùng, prompt injection, nội dung ngoài bài và phần tiền tố tự sinh của giao diện.
  3. Chuẩn hoá câu hỏi rồi nhóm các câu cùng mục đích theo chủ đề.
  4. Đếm theo **số người dùng duy nhất**, không chỉ theo số message, để tránh một người hỏi nhiều lần làm lệch kết quả.
  5. Đối chiếu từng chủ đề với slide để xác định kiến thức chính thức cần đưa vào PDF.
- **Chuẩn bằng chứng cần hoàn thành:** số đếm kiểm tra lại được + ≥5 ví dụ nguyên văn đã ẩn danh + mô tả rõ quy tắc lọc và clustering.
- **Con số dùng để pitch:** tỷ lệ học viên/hội thoại hỏi về các chủ đề lặp lại nhiều nhất trong một buổi học. Chỉ chốt con số sau khi mining hoàn tất.

**Lưu ý dữ liệu:** `day_code` chưa được chuẩn hoá hoàn toàn; nhãn `New learning material` xuất hiện nhiều. Nhóm phải xác minh mapping giữa chatlog và slide trước khi công bố kết quả theo từng buổi.

## 3. Problem & Impact (không dùng chữ "AI" khi trình bày bài toán)

**Bài toán:** Sau mỗi buổi học, các kiến thức trọng tâm nằm trong một bộ slide dài, còn những thắc mắc thực tế của học viên nằm phân tán trong nhiều hội thoại. Học viên không có một tài liệu ngắn giúp họ vừa ôn lại bài, vừa biết những điểm cả lớp thường vướng.

**3 cơ hội impact đã cân nhắc trước khi chọn:**

1. **Chỉ tóm tắt slide thành PDF** → *loại*, vì dễ trùng với các công cụ tóm tắt tài liệu phổ thông và không tận dụng được chatlog VLearn.
2. **Sinh bộ câu hỏi chung từ slide** → *loại*, vì câu hỏi có thể đúng nội dung nhưng không phản ánh những phần học viên thực sự gặp khó.
3. **Tạo PDF từ slide + insight của chatlog cả lớp** → *chọn*, vì kết hợp nguồn kiến thức chính thức với hành vi hỏi thật để tạo bản ôn tập phù hợp với chính buổi học đó.

**Impact nếu làm đúng:**

- Học viên nắm lại nội dung trọng tâm trong thời gian ngắn hơn.
- Cả lớp được hưởng lợi từ những câu hỏi hay và điểm dễ nhầm mà các học viên khác đã phát hiện.
- Lab Coach không phải đọc thủ công hàng trăm hội thoại.
- Chatlog được biến từ dữ liệu rời rạc thành tri thức dùng chung sau mỗi buổi học.

**Cần xác minh thêm bằng khảo sát:** thời gian học viên hiện mất để ôn lại slide, tỷ lệ đọc hết slide và mức sẵn sàng sử dụng một PDF tổng hợp sau buổi học.

## 4. Lát cắt sản phẩm (Solution Slice)

| Thành phần | Nội dung |
|---|---|
| 1 người dùng | Học viên cần ôn lại nội dung sau một buổi học lý thuyết |
| 1 công việc | Nắm kiến thức trọng tâm và những điểm cả lớp thường thắc mắc mà không phải đọc lại toàn bộ slide và chatlog |
| 1 quyết định AI | Từ slide và các câu hỏi đã ẩn danh, xác định chủ đề nào là kiến thức trọng tâm, chủ đề nào là điểm khó lặp lại và nội dung nào cần loại bỏ |
| 1 kết quả | Một PDF VLười gồm lý thuyết trọng tâm, các điểm cần lưu ý, câu hỏi phổ biến và câu tự kiểm tra có tham chiếu về slide gốc |

**Lát cắt một câu:**  
> Sau mỗi buổi học, VLười kết hợp slide với chatlog đã ẩn danh, xác định những kiến thức trọng tâm và điểm học viên thường vướng, rồi tự động tạo một PDF ôn tập có tham chiếu về trang gốc cho cả lớp.

**Luồng chính:**

```text
Buổi học kết thúc
→ lấy slide và chatlog liên quan
→ lọc noise và dữ liệu ngoài phạm vi
→ nhóm câu hỏi theo chủ đề
→ xếp hạng điểm lớp thường vướng
→ đối chiếu với slide
→ sinh nội dung ôn tập và câu tự kiểm tra
→ Lab Coach duyệt mục không chắc chắn
→ xuất PDF cho học viên
```

**Cấu trúc PDF:**

1. Lý thuyết trọng tâm của buổi học.
2. Những điều cả lớp thường hỏi.
3. Điểm dễ nhầm và cách hiểu đúng theo slide.
4. Câu hỏi tự kiểm tra kèm đáp án ở cuối.
5. Tham chiếu tới trang slide gốc.

**Nguyên tắc nguồn:**

- Slide là nguồn sự thật cho kiến thức.
- Câu hỏi học viên chỉ là tín hiệu xác định điểm khó, không phải nguồn khẳng định kiến thức.
- Không đưa nguyên câu trả lời của AI Tutor vào PDF nếu chưa kiểm chứng với slide.
- Nội dung không có căn cứ trong slide phải được gắn cờ để Lab Coach duyệt, không tự động phát hành như kiến thức chính thức.

**Demo 5 phút:** Chọn một buổi học → xem các confusion cluster được phát hiện → mở một cluster để thấy các câu hỏi đã gộp → kiểm tra kiến thức tương ứng trên slide → preview và tải PDF VLười.

## 5. Người dùng sẵn sàng thử (Validation Target)

Cần tối thiểu:

- **≥3 học viên thật ngoài team** dùng PDF để ôn một buổi học và thực hiện task mà không được thuyết minh.
- **≥2 Lab Coach/TA hoặc người vận hành nội dung** đánh giá các confusion cluster và quy trình duyệt.

Ba câu hỏi sau khi học viên thử:

1. Phần nào trong PDF giúp bạn ôn nhanh hơn so với đọc lại slide?
2. Những điểm “cả lớp thường hỏi” có thực sự hữu ích hay gây nhiễu?
3. Bạn có dùng tài liệu này sau mỗi buổi học không — vì sao hoặc vì sao chưa?

Chỉ số validation cần ghi:

- Thời gian hoàn thành task ôn tập.
- Số ý chính học viên nhớ lại được.
- Số mục bị đánh giá thừa, thiếu hoặc khó hiểu.
- Quote nguyên văn và thay đổi sản phẩm sau feedback.

## 6. Vì sao thị trường nên đặt cược

- **Khác biệt rõ:** không chỉ tóm tắt slide, mà biến câu hỏi thật của cả lớp thành insight ôn tập.
- **Tận dụng tài sản riêng của VLearn:** chatlog Tutor đã gắn với ngữ cảnh học tập, điều công cụ tóm tắt PDF thông thường không có.
- **Giá trị lặp lại:** tự động tạo sau mỗi buổi học và liên tục phản ánh những điểm khó mới của từng lớp.
- **Một người hỏi, cả lớp được lợi:** tri thức từ hội thoại riêng được tổng hợp, ẩn danh và chia sẻ lại.
- **Đo lường được:** số người hỏi theo chủ đề, độ chính xác clustering, độ phủ kiến thức, tính đúng của citation và thời gian ôn tập.
- **Phù hợp hackathon:** có một quyết định AI trung tâm, có dữ liệu thật để mining, có đầu ra PDF rõ ràng và demo được end-to-end.

> **VLười — Lười đọc dài. Không lười hiểu.**

## 7. Rủi ro & điểm cần xử lý trước

1. **Mapping sai buổi/slide:** `day_code` chưa sạch hoàn toàn → cần quy tắc kết hợp `day_code`, trang, đoạn được chọn, thời gian và chủ đề.
2. **Clustering sai:** các câu hỏi có template giống nhau nhưng hỏi khái niệm khác → phải loại tiền tố giao diện trước khi so semantic.
3. **Popularity bias:** được hỏi nhiều không đồng nghĩa quan trọng → kết hợp tần suất với learning objective và cấu trúc slide.
4. **Silent confusion:** không có ai hỏi không có nghĩa mọi người đã hiểu → PDF luôn phải có phần lý thuyết trọng tâm, không chỉ dựa trên chatlog.
5. **Nguồn không đáng tin:** câu trả lời Tutor có thể sai hoặc thiếu citation → chỉ dùng slide làm nguồn kiến thức chính thức.
6. **Noise và prompt injection:** cần bộ lọc trước khi clustering.
7. **Quyền riêng tư:** chỉ dùng dữ liệu đã ẩn danh, trình bày số liệu tổng hợp và không đưa nội dung có khả năng nhận diện học viên vào PDF.
8. **Câu hỏi tự kiểm tra sai/mơ hồ:** mọi câu và đáp án phải truy ngược được về slide; case low-confidence chuyển Lab Coach duyệt.

**Golden set tối thiểu:** ≥20 case, gồm câu hỏi cùng chủ đề, câu gần giống nhưng khác mục đích, câu gửi trùng, câu ngoài bài, prompt injection và case không đủ căn cứ.  
**Quality bar nháp:** 100% kiến thức/câu trả lời trong PDF có nguồn từ slide; không lộ thông tin nhận diện; ≥80% câu hỏi trong golden set được gán đúng cluster. Quality bar chính thức chỉ chốt sau lượt đo thử đầu tiên và giữ nguyên từ hạn nộp spec.

---
  
