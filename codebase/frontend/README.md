# VLười Frontend

Next.js app cho demo VLười.

## Run

```bash
npm install
npm run dev
```

Mở `http://localhost:3000`.

## Demo

App mặc định mở ở vai **Lab Coach** để demo đúng flow:

```text
Phân tích lớp -> Buổi học -> Dữ liệu vào -> Duyệt nội dung -> Gửi học viên -> Học viên
```

Nút **Tải pack demo** dùng artifact có sẵn trong `../shared`.

Nút **Chạy lại AI** cần:

```text
DEEPSEEK_API_KEY=...
```

Nếu runtime không chạy được Python/Poppler, backend sẽ thử pipeline TypeScript gọi DeepSeek trực tiếp. Nếu vẫn lỗi, app fallback về artifact demo.
