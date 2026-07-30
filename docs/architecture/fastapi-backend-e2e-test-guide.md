# FastAPI Backend End-to-End Test Guide

Muc tieu: verify pha 1 migration, trong do frontend van goi `/api/*` va Next API routes proxy sang FastAPI qua `FASTAPI_BASE_URL`.

## Dieu kien truoc khi test

- Cai dependency backend:

```bash
cd codebase/backend-fastapi
python3 -m pip install -e '.[test]'
```

- Khong commit secret. Neu can DB Aiven, dat `DATABASE_URL` trong shell hoac file `.env` local cua backend. Neu khong co `DATABASE_URL`, backend van chay bang fallback artifacts trong `codebase/shared` va `data/vlearn-pack`.

## Chay automated smoke tests

```bash
cd codebase/backend-fastapi
python3 -m pytest
```

Smoke tests cover:

- `GET /api/review-packs` voi role student.
- `GET /api/review-packs/{pack_id}` voi role student va labcoach.
- `PATCH /api/review-packs/{pack_id}/items/{item_id}` role guard va invalid action.
- `POST /api/review-packs/{pack_id}/export-pdf` binary PDF headers.
- Upload lesson PDF, doc slide PDF, va chat theo lesson vua upload.

## Chay local end-to-end qua Next proxy

Terminal 1:

```bash
cd codebase/backend-fastapi
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Terminal 2:

```bash
cd codebase/frontend
FASTAPI_BASE_URL=http://127.0.0.1:8000 npm run dev
```

Open:

```text
http://127.0.0.1:3000
```

## Checklist thu cong tren UI

1. Load trang voi role student, catalog lesson hien thi.
2. Mo review pack cua `pack-day1-foundation-001`, student khong thay item `needs_review`.
3. Chuyen sang Lab Coach, thay item `needs_review`.
4. Approve hoac drop mot item cua Lab Coach, response tra `{ "pack": ... }`.
5. Export PDF, browser nhan `application/pdf` va filename `{pack_id}.pdf`.
6. Upload mot file PDF moi, response co `{ "lesson": ..., "slideDeck": ... }`.
7. Mo slide iframe cua lesson vua upload, response la PDF inline.
8. Gui chat message, response co `reply` va `citations`.

## Smoke bang curl qua frontend proxy

```bash
curl -sS 'http://127.0.0.1:3000/api/review-packs?role=student'
curl -sS -H 'x-vluoi-role: labcoach' 'http://127.0.0.1:3000/api/review-packs/pack-day1-foundation-001'
curl -sS -X POST -H 'x-vluoi-role: labcoach' 'http://127.0.0.1:3000/api/review-packs/pack-day1-foundation-001/export-pdf' -o /tmp/vluoi-pack.pdf
curl -sS -X POST -H 'content-type: application/json' \
  -d '{"lesson_id":"day1-foundation","message":"tom tat slide nay","current_slide_page":1,"selected_text":""}' \
  'http://127.0.0.1:3000/api/chat'
```

Expected:

- Review pack JSON co dung `role`, `users`, `lessons`, hoac `{ "pack": ..., "role": ... }`.
- PDF file bat dau bang `%PDF`.
- Chat JSON co `reply` va `citations`.

## Build va lint hien tai

Frontend build/lint nen duoc chay truoc khi merge:

```bash
cd codebase/frontend
npm run lint
npm run build
```

Tai thoi diem migration nay, repo frontend con loi TypeScript/ESLint trong Prisma seed va service cu. Can sua cac loi do rieng truoc khi coi build/lint la green toan bo.

