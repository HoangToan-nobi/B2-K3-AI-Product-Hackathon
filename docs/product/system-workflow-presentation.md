# Luồng hoạt động toàn bộ hệ thống VLười

Tài liệu này dùng để thuyết trình sản phẩm theo cách dễ hiểu cho người không chuyên kỹ thuật. Có thể dùng trực tiếp làm dàn ý demo.

## 1. VLười giải quyết vấn đề gì?

Trong một lớp học có nhiều slide, transcript và câu hỏi rời rạc từ học viên, Lab Coach thường mất nhiều thời gian để:

- đọc lại toàn bộ tài liệu sau buổi học;
- tìm các phần học viên hay hiểu nhầm;
- viết tài liệu ôn tập;
- tạo quiz nhanh;
- trả lời câu hỏi học viên nhưng vẫn phải bám sát nội dung bài giảng.

VLười là AI Tutor giúp biến tài liệu lớp học thành một không gian học tập có thể hỏi đáp và tự động tạo gói ôn tập.

Nói ngắn gọn:

> Lab Coach đưa slide vào. VLười đọc slide, hiểu nội dung, gom câu hỏi học viên, tạo tài liệu ôn tập, và hỗ trợ học viên hỏi đáp theo đúng bài học.

## 2. Hai vai trò chính trong sản phẩm

### Lab Coach

Lab Coach là người quản lý học liệu. Lab Coach có thể:

- tạo ngày học mới;
- upload slide PDF hoặc PPTX;
- tạo tài liệu tổng hợp bằng AI;
- duyệt các nội dung AI đánh dấu là cần kiểm tra;
- xuất tài liệu ôn tập thành PDF.

### Học viên

Học viên là người học trong lớp. Học viên có thể:

- chọn ngày học;
- xem slide;
- hỏi AI Tutor về nội dung trong slide;
- xem tài liệu tổng hợp đã được Lab Coach phát hành;
- tải PDF ôn tập nếu có.

## 3. Bức tranh tổng thể

Luồng tổng quát của hệ thống:

```text
Slide / Transcript / Chatlog
        |
        v
VLười đọc và chuẩn hóa dữ liệu
        |
        v
AI phân tích kiến thức + câu hỏi học viên
        |
        v
Tạo tài liệu ôn tập + quiz + phần cần Lab Coach duyệt
        |
        v
Học viên xem slide, hỏi AI Tutor, tải tài liệu PDF
```

Có thể thuyết trình theo cách đơn giản:

> VLười giống một trợ lý học tập. Đầu tiên trợ lý đọc tài liệu lớp học, sau đó tóm tắt kiến thức trọng tâm, phát hiện câu hỏi học viên hay gặp, rồi biến tất cả thành tài liệu ôn tập và chatbot hỏi đáp.

## 4. Luồng 1: Lab Coach tạo bài học từ slide

Mục tiêu của luồng này là đưa slide bài giảng vào hệ thống để VLười có dữ liệu trả lời và tổng hợp.

```text
Lab Coach nhập tên buổi học
        |
Upload file PDF/PPTX
        |
VLười lưu file slide
        |
VLười đọc chữ trên từng trang
        |
Nếu trang khó đọc, hệ thống cố gắng OCR để lấy chữ
        |
Lưu lại bài học + danh sách trang slide
        |
Giao diện hiển thị bài học mới
```

Giải thích cho non-tech:

- Khi Lab Coach upload slide, hệ thống không chỉ lưu file.
- VLười còn đọc nội dung từng trang để biết slide đang nói về khái niệm nào.
- Nếu PDF là ảnh hoặc trang khó đọc, hệ thống dùng OCR để cố gắng nhận diện chữ.
- Sau bước này, slide đã sẵn sàng để học viên hỏi đáp.

Điểm nên nhấn khi demo:

> Đây là bước biến một file slide tĩnh thành dữ liệu mà AI có thể hiểu và dùng để trả lời.

## 5. Luồng 2: Học viên hỏi AI Tutor trong lúc xem slide

Mục tiêu của luồng này là giúp học viên hỏi ngay khi không hiểu nội dung bài.

```text
Học viên mở slide
        |
Học viên gửi câu hỏi
        |
VLười lưu lại câu hỏi đó
        |
Hệ thống tìm các trang slide liên quan nhất
        |
Bổ sung transcript và các câu hỏi cũ cùng chủ đề nếu có
        |
AI Tutor tạo câu trả lời ngắn gọn bằng tiếng Việt
        |
Trả lời kèm nguồn tham chiếu như "Slide 3", "Slide 7"
```

Ví dụ thuyết trình:

> Nếu học viên hỏi "RAG khác gì so với hỏi trực tiếp LLM?", VLười sẽ không trả lời theo trí nhớ chung ngay lập tức. Trước hết hệ thống tìm trong slide bài học xem trang nào nói về RAG, lấy đúng phần đó làm căn cứ, rồi mới nhờ AI viết câu trả lời dễ hiểu.

Nếu câu hỏi chưa đủ dữ liệu trong slide:

```text
Câu hỏi không đủ căn cứ trong slide
        |
VLười mở rộng tìm thêm trong toàn bộ slide
        |
Nếu vẫn thiếu, mới chuyển sang kiến thức ngoài slide hoặc web
        |
Câu trả lời ghi rõ đây là nội dung ngoài slide
```

Điểm nên nhấn khi demo:

> AI Tutor được thiết kế để bám vào bài học trước, không trả lời lan man. Điều này giúp giảm rủi ro bịa nội dung và giúp học viên biết câu trả lời đến từ đâu.

## 6. Luồng 3: Tạo tài liệu tổng hợp sau buổi học

Mục tiêu của luồng này là giảm thời gian Lab Coach phải tự viết tài liệu ôn tập.

```text
Lab Coach chọn một ngày học
        |
Bấm "Tạo tài liệu ôn tập"
        |
VLười đọc toàn bộ slide
        |
VLười đọc transcript nếu có
        |
VLười gom câu hỏi thật từ chatlog
        |
Lọc câu hỏi trùng nhau
        |
AI tạo bản tổng hợp
        |
Hệ thống kiểm tra lại nguồn slide cho từng ý
        |
Lưu bản nháp để Lab Coach duyệt
```

Tài liệu tổng hợp gồm 3 phần chính:

1. Lý thuyết trọng tâm: những ý quan trọng nhất từ slide.
2. Cả lớp thường hỏi: các chủ đề học viên hay vướng từ chatlog.
3. Quiz nhanh: câu hỏi trắc nghiệm để ôn lại bài.

Giải thích cho non-tech:

- Slide cho biết "bài học dạy gì".
- Transcript giúp bổ sung cách giảng nếu khớp với slide.
- Chatlog cho biết "học viên thật sự vướng ở đâu".
- AI kết hợp ba nguồn này để tạo tài liệu ôn tập sát nhu cầu lớp học hơn.

Điểm nên nhấn khi demo:

> Tài liệu không chỉ là tóm tắt slide. Nó còn phản ánh câu hỏi thật của học viên, nên sát với blindspot của lớp hơn.

## 7. Luồng 4: Lab Coach duyệt nội dung trước khi phát hành

AI có thể tạo nội dung nhanh, nhưng sản phẩm vẫn để Lab Coach kiểm soát chất lượng.

```text
AI tạo bản nháp
        |
Hệ thống đánh dấu mục cần kiểm tra
        |
Lab Coach xem từng mục
        |
Lab Coach chọn "duyệt" hoặc "bỏ"
        |
Chỉ nội dung đã sẵn sàng mới hiện cho học viên
```

Vì sao cần duyệt?

- Một số câu hỏi học viên có thể nằm ngoài phạm vi slide.
- Một số nội dung cần Lab Coach quyết định có nên phát hành hay không.
- Việc duyệt giúp sản phẩm phù hợp với lớp học và giảm rủi ro AI trả lời sai.

Thông điệp thuyết trình:

> VLười không thay thế Lab Coach. VLười làm bản nháp nhanh, còn Lab Coach là người quyết định nội dung cuối cùng.

## 8. Luồng 5: Học viên xem tài liệu tổng hợp và tải PDF

Sau khi tài liệu đã sẵn sàng:

```text
Học viên chọn ngày học
        |
Mở tài liệu tổng hợp
        |
Xem lý thuyết trọng tâm
        |
Xem câu hỏi lớp hay gặp
        |
Làm quiz nhanh
        |
Tải PDF để ôn tập
```

Điểm nên nhấn khi demo:

> Một buổi học sau khi kết thúc có thể tự động biến thành tài liệu ôn tập có cấu trúc, có câu hỏi hay gặp, có quiz và có thể xuất PDF.

## 9. Luồng dữ liệu theo cách dễ hiểu

```text
Nguồn dữ liệu đầu vào
  - Slide bài giảng
  - Transcript
  - Chatlog câu hỏi học viên

VLười xử lý
  - Đọc chữ từ slide
  - Chia nội dung theo từng trang
  - Tìm trang liên quan khi học viên hỏi
  - Gom nhóm câu hỏi giống nhau
  - Nhờ AI viết câu trả lời hoặc tài liệu ôn tập

Kết quả đầu ra
  - Chatbot trả lời theo slide
  - Tài liệu tổng hợp
  - Câu hỏi hay gặp của lớp
  - Quiz nhanh
  - PDF ôn tập
```

Cách nói trong phần pitching:

> Đầu vào là tài liệu lớp học rời rạc. Đầu ra là một trải nghiệm học tập có tổ chức: xem slide, hỏi đáp, ôn tập, làm quiz và tải PDF.

## 10. Vì sao sản phẩm này có giá trị?

### Với học viên

- Không cần tự lục lại toàn bộ slide để tìm câu trả lời.
- Có thể hỏi ngay khi đang xem slide.
- Nhận câu trả lời ngắn gọn, dễ hiểu, có nguồn slide.
- Có tài liệu ôn tập sau buổi học.

### Với Lab Coach

- Giảm thời gian đọc lại slide và viết tài liệu.
- Biết lớp hay hỏi gì, hay vướng chỗ nào.
- Có bản nháp tài liệu nhanh để duyệt.
- Có thể xuất PDF cho học viên.

### Với lớp học

- Tài liệu ôn tập sát với vấn đề thật của học viên.
- Câu hỏi lặp lại được gom thành chủ đề chung.
- Dữ liệu lớp học được tái sử dụng thành giá trị học tập.

## 11. Kịch bản demo đề xuất

### Bước 1: Giới thiệu vấn đề

Nói:

> Sau mỗi buổi học, slide, transcript và câu hỏi học viên thường nằm rời rạc. Lab Coach mất thời gian tổng hợp, còn học viên thì khó biết nên ôn phần nào.

### Bước 2: Chuyển sang vai trò Lab Coach

Demo:

- mở màn hình Lab Coach;
- chọn một ngày học có sẵn hoặc upload slide mới;
- bấm tạo tài liệu ôn tập.

Nói:

> Ở đây Lab Coach chỉ cần chọn buổi học. VLười sẽ tự đọc slide, lấy transcript, gom câu hỏi học viên và tạo bản nháp tài liệu.

### Bước 3: Cho xem tiến trình AI đang làm

Demo:

- chỉ vào thanh tiến trình;
- giải thích các bước: đọc slide, đọc transcript, gom chatlog, tổng hợp kiến thức, gắn nguồn slide.

Nói:

> Chúng tôi cố tình hiển thị tiến trình để người dùng biết AI đang làm gì, không phải chỉ chờ một hộp đen trả kết quả.

### Bước 4: Duyệt tài liệu

Demo:

- mở phần tài liệu tổng hợp;
- chỉ vào lý thuyết trọng tâm;
- chỉ vào câu hỏi lớp hay gặp;
- duyệt hoặc bỏ một mục nếu có.

Nói:

> AI tạo nhanh, nhưng Lab Coach vẫn giữ quyền kiểm soát. Những nội dung cần cân nhắc sẽ được đưa vào hàng chờ duyệt.

### Bước 5: Chuyển sang vai trò học viên

Demo:

- mở slide reader;
- hỏi một câu liên quan đến nội dung slide;
- cho thấy câu trả lời và nguồn slide.

Nói:

> Với học viên, trải nghiệm đơn giản hơn: xem slide ở bên trái, hỏi AI Tutor ở bên phải. Câu trả lời được bám vào nội dung bài học.

### Bước 6: Xuất PDF

Demo:

- mở tài liệu tổng hợp;
- bấm tải PDF.

Nói:

> Cuối cùng, tài liệu có thể xuất thành PDF để học viên ôn lại sau buổi học.

## 12. Một câu mô tả sản phẩm

> VLười là AI Tutor biến slide, transcript và câu hỏi học viên thành trải nghiệm học tập hoàn chỉnh: hỏi đáp theo slide, tổng hợp kiến thức, phát hiện blindspot của lớp và tạo tài liệu ôn tập có thể xuất PDF.

## 13. Câu kết cho phần thuyết trình

> Điểm mạnh của VLười không nằm ở việc chỉ tóm tắt slide. Điểm mạnh là hệ thống dùng dữ liệu thật của lớp học để tạo tài liệu sát nhu cầu học viên, đồng thời vẫn giữ Lab Coach ở vai trò kiểm duyệt cuối cùng.
