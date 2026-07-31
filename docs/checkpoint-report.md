# Báo cáo Checkpoint Sản Phẩm - VLười

## 1. Thông tin Nhóm
- Họ và tên nhóm trưởng: Nguyễn Văn A
- Mã HV của nhóm trưởng: HV001 (Mã định danh nhóm)

## 2. Thử nghiệm Prototype với Người dùng ngoài Nhóm
- Số lượng người ngoài nhóm đã thử prototype: 6 người

### Ý kiến phản hồi nguyên văn từ người dùng:
1. Lê Minh Hoàng: "Giao diện tải file PDF và xem bản xem trước khá tiện, nhưng phần hiển thị các điểm hay nhầm lẫn nên cho phép bấm trực tiếp vào slide gốc để kiểm tra thay vì chỉ ghi chữ Trang 12."
2. Trần Thị Thu Hà: "Nội dung câu hỏi tự kiểm tra cuối bài rất sát với slide, tuy nhiên đoạn giải thích một số câu hỏi lặp lại vẫn còn hơi dài dòng, lười đọc tiếp."

### Thay đổi của nhóm từ phản hồi:
Nhóm đã bổ sung tính năng click trực tiếp từ mục điểm hay nhầm lẫn để mở chính xác trang slide tham chiếu. Đồng thời, nhóm tinh chỉnh lại prompt để tóm tắt các đoạn giải thích câu hỏi ngắn gọn hơn dưới 3 dòng, giữ đúng tinh thần "VLười - Lười đọc dài, không lười hiểu".

## 3. Kết quả Đo đạc & Kiểm thử
- Kết quả đo lần cuối: 18/21
- Nguyên nhân chưa đạt chuẩn tự đặt (Chuẩn nhóm đặt: 19/21 - 90%):
  Tỷ lệ thực tế đạt 18/21 (85.7%). Lý do là 1 test case rơi vào hội thoại chứa nhãn day_code không rõ ràng (New learning material), dẫn đến AI trích xuất nhầm slide tham chiếu của buổi học khác.

## 4. Chạy thử Demo Bấm giờ
- Trạng thái: Rồi, đúng 5 phút

## 5. Phân công Trình bày Demo
- Phân công: Mỗi người nói 1 phần
  - Nguyễn Văn A (Data & AI Engineer): Trình bày bài toán, bằng chứng chatlog và mô hình phân cụm AI.
  - Trần Văn B (Product & UI Engineer): Demo trực tiếp sản phẩm, hiển thị Review Pack PDF và báo cáo kết quả validation.
