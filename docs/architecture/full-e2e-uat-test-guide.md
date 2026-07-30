# Full End-to-End and UAT Test Guide

Muc tieu: chay va test toan bo use case hien co sau migration FastAPI phase 1. Frontend Next.js van goi `/api/*`; Next API routes proxy sang FastAPI qua `FASTAPI_BASE_URL`.

## 1. Dieu kien truoc khi chay

- Node.js va npm da cai.
- Python 3.11+ da cai.
- DB Aiven da duoc dat trong env local:
  - `codebase/backend-fastapi/.env`
  - `codebase/frontend/.env`
- Khong commit cac file `.env`.

Backend env mau:

```env
DATABASE_URL=postgresql+asyncpg://USER:PASSWORD@HOST:PORT/DB?ssl=require
BACKEND_CORS_ORIGINS=http://localhost:3000
UPLOAD_DIR=uploads
```

Frontend env mau:

```env
DATABASE_URL="postgres://USER:PASSWORD@HOST:PORT/DB?sslmode=require"
FASTAPI_BASE_URL="http://127.0.0.1:8000"
```

## 2. Cai dependencies

Backend:

```bash
cd codebase/backend-fastapi
python3 -m pip install -e '.[test]'
```

Frontend:

```bash
cd codebase/frontend
npm install
```

## 3. Seed DB tu `data/vlearn-pack`

Seed script se reset cac bang app va nap lai du lieu VLearn:

```bash
cd codebase/frontend
npx tsx prisma/seed-vlearn.ts
```

Expected output:

```text
Starting seed...
Parsed 2522 chat records. Seeding all records...
Seeding finished successfully!
```

Verify row counts tu repo root:

```bash
cd /Users/plxg/workspace/vinuni/B2-K3-AI-Product-Hackathon/codebase/backend-fastapi
```

Neu dang dung o `codebase/frontend`, dung:

```bash
cd ../backend-fastapi
```

Sau do chay:

```bash
python3 -c "import asyncio
from sqlalchemy import text
from app.core.database import engine
async def main():
    async with engine.connect() as conn:
        for table in ['User','Course','Lesson','SlideDeck','Transcript','StudentQuestion','KnowledgePack','KnowledgeItem']:
            count=(await conn.execute(text(f'SELECT COUNT(*) FROM \"{table}\"'))).scalar_one()
            print(f'{table}: {count}')
asyncio.run(main())"
```

Expected minimum:

- `User: 3`
- `Course: 1`
- `Lesson: 5`
- `SlideDeck: 5`
- `Transcript: 7`
- `StudentQuestion: 2522`
- `KnowledgePack: 1`
- `KnowledgeItem: 1`

## 4. Chay app local

Terminal 1, FastAPI:

```bash
cd codebase/backend-fastapi
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Terminal 2, Next.js:

```bash
cd codebase/frontend
npm run dev
```

Open:

```text
http://127.0.0.1:3000
```

## 5. Automated verification

Backend smoke tests:

```bash
cd codebase/backend-fastapi
python3 -m pytest
```

Frontend checks:

```bash
cd codebase/frontend
npm run lint
npm run build
```

Acceptance:

- Backend pytest: all tests pass.
- Frontend build: pass.
- Frontend lint: 0 errors. Warnings hien tai co the chap nhan neu khong lien quan flow UAT.

## 6. API smoke qua Next proxy

Chay khi ca FastAPI va Next.js dang bat.

Catalog student:

```bash
curl -sS 'http://127.0.0.1:3000/api/review-packs?role=student'
```

Expected:

- HTTP 200.
- JSON co `role: "student"`.
- `lessons` co it nhat 1 item.

Review pack labcoach:

```bash
curl -sS -H 'x-vluoi-role: labcoach' \
  'http://127.0.0.1:3000/api/review-packs/pack-day1-foundation-001'
```

Expected:

- HTTP 200.
- JSON co `{ "pack": ..., "role": "labcoach" }`.

Export PDF:

```bash
curl -sS -X POST -H 'x-vluoi-role: labcoach' \
  'http://127.0.0.1:3000/api/review-packs/pack-day1-foundation-001/export-pdf' \
  -o /tmp/vluoi-pack.pdf
file /tmp/vluoi-pack.pdf
```

Expected:

- Response la PDF.
- File bat dau bang `%PDF`.

Chat:

```bash
curl -sS -X POST -H 'content-type: application/json' \
  -d '{"lesson_id":"day1-foundation","message":"tom tat slide nay","current_slide_page":1,"selected_text":""}' \
  'http://127.0.0.1:3000/api/chat'
```

Expected:

- JSON co `reply`.
- JSON co `citations`.

## 7. UAT checklist tren UI

### UC-01 Student load catalog

Steps:

1. Mo `http://127.0.0.1:3000`.
2. Chon role Student neu app khong mac dinh Student.
3. Quan sat lesson/review pack list.

Pass:

- Trang load khong error.
- Co lesson VLearn/Day 1.
- Khong hien noi dung chi danh cho Lab Coach.

### UC-02 Student xem review pack da duyet

Steps:

1. O role Student, mo review pack Day 1.
2. Kiem tra cac khu vuc summary, insight, review questions.

Pass:

- Chi thay item `ready`.
- Khong thay warning hoac item `needs_review`.
- UI khong crash khi data den tu FastAPI proxy.

### UC-03 Lab Coach xem noi dung can duyet

Steps:

1. Chuyen role sang Lab Coach.
2. Mo AI Tutor/Blindspot hoac workspace review.
3. Kiem tra cac item trong review pack.

Pass:

- Lab Coach thay duoc item can review neu DB/artifact co.
- Cac controls approve/drop hien dung.
- Student role khong co quyen mutate.

### UC-04 Lab Coach approve item

Steps:

1. Chon mot item dang review.
2. Bam approve.
3. Reload review pack.

Pass:

- Request `PATCH /api/review-packs/{pack_id}/items/{item_id}` tra 200.
- Item chuyen sang `ready`.
- Student co the thay item sau khi approve.

### UC-05 Lab Coach drop item

Steps:

1. Chon mot item test co the xoa.
2. Bam drop.
3. Reload review pack.

Pass:

- Request tra 200.
- Item khong con trong review pack.
- Student khong thay item da drop.

Note: UC nay thay doi data. Neu can lap lai UAT tu dau, chay lai seed.

### UC-06 Export PDF

Steps:

1. O role Lab Coach, vao khu vuc Release/Export.
2. Bam export PDF.
3. Mo file PDF vua tai.

Pass:

- Response `Content-Type: application/pdf`.
- Filename la `{pack_id}.pdf`.
- File mo duoc va co noi dung review pack.

### UC-07 Xem slide PDF

Steps:

1. Chon tab/view Slide & Chat.
2. Mo lesson co slide.
3. Quan sat iframe/PDF viewer.

Pass:

- Slide PDF render duoc.
- Route `/api/lessons/{lesson_id}/slide` tra PDF inline.
- Neu file upload local khong ton tai, fallback slide trong `data/vlearn-pack/slides` van hoat dong.

### UC-08 Chat theo slide hien tai

Steps:

1. Mo Slide & Chat.
2. O current slide page 1, gui `tom tat slide nay`.

Pass:

- Chat tra JSON co `reply`.
- `citations` co `Slide 1` hoac danh sach slide lien quan.
- UI hien response khong crash.

### UC-09 Chat theo trang cu the

Steps:

1. Gui message `giai thich slide 3`.

Pass:

- Response scope dung trang/slide 3.
- `citations` co `Slide 3`.

### UC-10 Chat theo selected text

Steps:

1. Chon mot doan text trong slide neu UI ho tro selected text.
2. Gui cau hoi ve doan text do.

Pass:

- Response uu tien selected text.
- Reply co scope `Văn bản đang chọn`.

### UC-11 Upload lesson PDF

Steps:

1. Chuyen sang Lab Coach.
2. Upload mot file PDF voi title moi.
3. Cho request hoan tat.

Pass:

- Response co `{ "lesson": ..., "slideDeck": ... }`.
- `slideDeck.status` la `ready`.
- Lesson moi xuat hien trong danh sach.
- File duoc luu trong backend upload storage.

### UC-12 Mo slide cua lesson vua upload

Steps:

1. Chon lesson vua upload.
2. Mo slide viewer.

Pass:

- Route slide tra `application/pdf`.
- PDF viewer hien file vua upload hoac fallback hop le.

### UC-13 Role guard

Steps:

1. O role Student, goi approve/drop hoac export PDF bang UI/curl.

Pass:

- Mutate route tra 403 voi `{ "error": "Lab Coach role required" }`.
- Student khong the lam thay doi data.

### UC-14 Backend unavailable

Steps:

1. Tat FastAPI server.
2. Goi mot endpoint `/api/*` tu frontend.

Pass:

- Next proxy tra 502 voi `{ "error": "FastAPI backend unavailable" }`.
- UI khong silent fail; hien loi hoac state fallback chap nhan duoc.

## 8. Reset data sau UAT

Neu UAT approve/drop/upload lam thay doi DB, reset ve dataset ban dau:

```bash
cd codebase/frontend
npx tsx prisma/seed-vlearn.ts
```

Sau reset, verify lai:

```text
StudentQuestion: 2522
Lesson: 5
SlideDeck: 5
```

## 9. Troubleshooting

### FastAPI khong ket noi DB

Kiem tra `codebase/backend-fastapi/.env` co `postgresql+asyncpg://...` va `ssl=require`.

### Prisma seed bao TLS self-signed certificate

Seed script da normalize `sslmode` va dung `ssl: { rejectUnauthorized: false }`. Neu van loi, kiem tra `codebase/frontend/src/lib/db.ts` va `codebase/frontend/prisma/seed-vlearn.ts` dang dung helper `pgPoolConnectionString`.

### Next API tra 502

Kiem tra FastAPI dang chay:

```bash
curl -sS http://127.0.0.1:8000/health
```

Expected:

```json
{"status":"ok"}
```

### StudentQuestion khong du 2522

Chay lai seed va dam bao log co:

```text
Parsed 2522 chat records. Seeding all records...
```
