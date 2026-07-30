# Hướng Dẫn Chạy Dự Án VLười (Slide Chat Learning Plan MVP)

Dự án này là một MVP (Minimum Viable Product) để số hóa quá trình giảng dạy và ôn tập thông qua AI, dựa trên slide bài giảng và dữ liệu chatlog từ sinh viên. Kiến trúc của dự án là một Next.js Monolith sử dụng Prisma ORM kết nối với SQLite database.

## 1. Yêu cầu hệ thống
- **Node.js**: Phiên bản >= 18
- **NPM**: Phiên bản >= 9
- **Trình duyệt**: Chrome, Firefox, Safari (để test UI)

## 2. Cài đặt các thư viện phụ thuộc
Đầu tiên, bạn cần di chuyển vào thư mục `frontend` (chứa dự án Next.js) và cài đặt dependencies:

```bash
cd codebase/frontend
npm install
```

## 3. Khởi tạo Database và Seeding
Dự án sử dụng SQLite thông qua Prisma ORM v7, với adapter `better-sqlite3`.

Tạo schema database (cập nhật cấu trúc bảng cho db local) và chạy script mock seed data:

```bash
# Đẩy schema lên database (sẽ tự động tạo file ./prisma/dev.db)
npx prisma db push

# Chạy script seeding để nạp sẵn dữ liệu giả định (mock artifact JSON) vào SQLite
npm run seed 
# hoặc
npx tsx prisma/seed.ts
```
*(Bạn sẽ thấy dòng `Seeding finished.` xuất hiện khi hoàn thành).*

## 4. Chạy Server
Sau khi chuẩn bị dữ liệu, tiến hành khởi động server Next.js:

```bash
npm run dev
```

Server sẽ lắng nghe tại `http://localhost:3000`.

## 5. Hướng dẫn Test các luồng (End-to-End)

Dự án đã triển khai đầy đủ các yêu cầu MVP cho phép thử nghiệm trên trình duyệt:

### A. Dành cho Học viên (Student Role)
1. Vào `http://localhost:3000`, mặc định bạn sẽ ở role Học viên.
2. Bạn có thể xem các trang "Ôn tập tổng hợp" để xem lý thuyết trọng tâm, điểm cả lớp vướng và câu tự kiểm tra (chỉ các mục đã được Lab Coach duyệt mới hiện lên).
3. Chuyển sang tab "Xem slide" (Slide & Chat).
4. Bạn sẽ thấy Slide nằm bên trái và Chatbot nằm bên phải:
   - Chatbot sẽ có chức năng phân giải ngữ cảnh (Context Resolution) rất thông minh:
     - Gõ `"tóm tắt toàn bộ slide"`: Chatbot lấy toàn deck để xử lý.
     - Gõ `"giải thích trang 7"`: Chatbot lấy text trang số 7.
     - Nhập nội dung chứa đoạn text đã chọn: Chatbot sẽ dựa trên text đó.

### B. Dành cho Lab Coach (Giảng viên / Trợ giảng)
1. Ở cột menu bên trái (Sidebar), nhấn chọn nút "Lab Coach".
2. Khung nhìn sẽ chuyển sang Workspace của giảng viên, với các luồng riêng biệt:
   - **Đề tài (Generate)**: Nơi thiết lập và chạy lại Pipeline AI.
     - Bạn có thể tải lên (Upload) một file PDF Slide hoàn toàn mới cùng tiêu đề mới. 
     - Sau khi Upload, database sẽ lưu trữ `Lesson`, `SlideDeck`, tiến hành extract chữ bằng thư viện `pdf-parse` (không cần backend python) thành các `SlidePage` và `SlideChunk`. Bài học mới sẽ xuất hiện trên thanh chọn Lesson.
     - Tại đây bạn cũng có form giả lập Upload Chatlog & Chạy AI.
   - **AI Tutor & Blindspot**: Nơi Lab Coach xem các mining insight từ lớp học và duyệt (Approve/Drop) từng thẻ knowledge. Những nội dung bị Drop sẽ không nằm trong PDF xuất bản.
   - **Phát hành (Release)**: Cho phép xuất khẩu nội dung đã duyệt thành tệp PDF tổng hợp phát cho sinh viên. 

## Cấu trúc DB sau khi thay đổi (Phase 1 -> 5)
- Không còn đọc JSON thô từ file, tất cả đều lưu trong SQLite (`Course`, `Lesson`, `KnowledgePack`, `KnowledgeItem`).
- Có `SlideDeck`, `SlidePage` và `SlideChunk` để phục vụ upload tài liệu PDF và truy xuất RAG (Retrieval-Augmented Generation) khi sinh viên hỏi Chatbot.
- API Route `/api/lessons` nhận file upload.
- API Route `/api/chat` làm Context Resolver cho sinh viên.
- Service của review-packs được viết lại để query Prisma DB.
