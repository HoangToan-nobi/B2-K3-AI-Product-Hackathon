# FastAPI Backend Migration Plan

Muc tieu: tach backend va database ra khoi `codebase/frontend` ma khong doi luong end-to-end hien tai. Frontend Next.js van giu UI, role switch, review pack, upload lesson, xem slide, chat, export PDF nhu cu. Backend moi dung FastAPI cho nhanh. Database van dung Postgres Aiven hien co qua `DATABASE_URL`, khong hardcode connection string vao source.

## Trang thai hien tai

Backend dang nam trong frontend Next.js:

- Next API routes:
  - `codebase/frontend/src/app/api/review-packs/route.ts`
  - `codebase/frontend/src/app/api/review-packs/[packId]/route.ts`
  - `codebase/frontend/src/app/api/review-packs/[packId]/items/[itemId]/route.ts`
  - `codebase/frontend/src/app/api/review-packs/[packId]/export-pdf/route.ts`
  - `codebase/frontend/src/app/api/lessons/route.ts`
  - `codebase/frontend/src/app/api/lessons/[lessonId]/slide/route.ts`
  - `codebase/frontend/src/app/api/chat/route.ts`
- Database client dang o frontend:
  - `codebase/frontend/src/lib/db.ts`
  - `codebase/frontend/prisma/schema.prisma`
  - `codebase/frontend/prisma.config.ts`
  - `codebase/frontend/prisma/seed*.ts`
- Frontend goi API bang relative URL `/api/...` trong `codebase/frontend/src/app/page.tsx`.
- Database da la PostgreSQL, ket noi bang `DATABASE_URL` va SSL `rejectUnauthorized: false`.
- Co fallback artifact JSON/PDF trong `codebase/shared` va `data/vlearn-pack`.

## Nguyen tac migration

1. Khong doi luong end-to-end cua user.
   Frontend van thao tac cac workflow hien tai: load catalog, load review pack, approve/drop item, export PDF, upload lesson, xem slide PDF, chat theo slide.

2. Giu nguyen API contract truoc, doi implementation sau.
   FastAPI phai tra ve JSON/body/header tuong thich voi Next API routes hien tai. Sau khi backend moi pass parity test moi xoa route cu.

3. Database thuoc backend.
   `DATABASE_URL`, models, migrations, seed, repository, SQLAlchemy session chi nam trong `codebase/backend-fastapi`. Frontend khong import Prisma/database client nua.

4. Khong hardcode secret.
   Copy gia tri `DATABASE_URL` tu env hien co sang env backend khi chay local/deploy, nhung khong ghi connection string vao markdown, source code, hay commit.

5. Tach tung buoc, co rollback.
   Ban dau co the giu Next `/api/*` lam proxy sang FastAPI de frontend khong can doi fetch path. Khi on dinh, co the chuyen sang `NEXT_PUBLIC_API_BASE_URL`.

## Cau truc de xuat

```text
codebase/
  backend-fastapi/
    app/
      main.py
      core/
        config.py
        database.py
      models/
        entities.py
      schemas/
        review_packs.py
        lessons.py
        chat.py
      repositories/
        lessons.py
        review_packs.py
      services/
        review_packs.py
        lessons.py
        chat.py
        pdf_export.py
        artifacts.py
      api/
        deps.py
        routes/
          review_packs.py
          lessons.py
          chat.py
    alembic/
    tests/
    pyproject.toml
    .env.example
  frontend/
    src/app/page.tsx
    src/app/api/...        # tam thoi proxy hoac xoa sau khi frontend goi FastAPI truc tiep
```

Khuyen nghi dung:

- FastAPI
- Uvicorn
- SQLAlchemy 2.x async
- asyncpg
- Alembic
- Pydantic Settings
- pytest + httpx AsyncClient

## API contract can giu nguyen

### `GET /api/review-packs`

Input:

- Query/header role: `role=student|labcoach`, header `x-vluoi-role`.

Response:

```json
{
  "role": "student",
  "users": [{ "id": "student-demo", "name": "Hoc vien demo", "role": "student" }],
  "lessons": [
    {
      "id": "day1-foundation",
      "title": "AI & LLM Foundation (Day 1)",
      "slide_count": 29,
      "pack_id": "pack-day1-foundation-001",
      "status": "ready"
    }
  ]
}
```

Student chi thay item `status = "ready"`. Lab Coach thay ca item `needs_review`.

### `POST /api/review-packs`

Input:

```json
{ "lesson_id": "day1-foundation", "run_pipeline": false }
```

Response phai giu shape:

```json
{
  "pack": {},
  "job": { "mode": "existing_artifact" },
  "lesson_mapping": {},
  "artifacts": {}
}
```

Voi `run_pipeline=true`, giai doan dau van co the return pack hien co nhu logic hien tai, khong can chay pipeline that.

### `GET /api/review-packs/{pack_id}`

Response:

```json
{ "pack": {}, "role": "labcoach" }
```

Neu pack khong ton tai, return `404` va `{ "error": "Review pack not found" }`.

### `PATCH /api/review-packs/{pack_id}/items/{item_id}`

Header role bat buoc `labcoach`.

Input:

```json
{ "action": "approve" }
```

Action hop le: `approve`, `drop`.

Response:

```json
{ "pack": {} }
```

Mapping hien tai:

- `approve` -> update `knowledge_items.status = "ready"`
- `drop` -> delete knowledge item

### `POST /api/review-packs/{pack_id}/export-pdf`

Header role bat buoc `labcoach`.

Response:

- Body: PDF bytes
- Headers:
  - `Content-Type: application/pdf`
  - `Content-Disposition: attachment; filename="{pack_id}.pdf"`
  - `X-Artifact-Path: <path>`

Co the port logic `generateReviewPackPdf` sang Python bang `reportlab` hoac tam thoi tra PDF artifact co san trong `codebase/shared/exports`.

### `GET /api/lessons`

Response:

```json
{ "lessons": [] }
```

Can include `slideDecks` nhu route Next hien tai de frontend khong vo tinh mat field.

### `POST /api/lessons`

Header role bat buoc `labcoach`.

Input multipart form:

- `title`
- `courseId` optional
- `file`

Response:

```json
{ "lesson": {}, "slideDeck": {} }
```

Giu logic MVP hien tai:

- Neu thieu `courseId`, lay course dau tien, neu chua co thi tao `Default Course`.
- Tao lesson draft.
- Luu file vao backend storage, vi du `codebase/backend-fastapi/uploads/slides`.
- Tao slide deck status `ready`.
- Tao mock 5 slide pages neu chua implement PDF parsing that.
- Tao slide chunks page-level.

### `GET /api/lessons/{lesson_id}/slide`

Response:

- Body: PDF bytes
- Headers:
  - `Content-Type: application/pdf` hoac mime type tu DB
  - `Content-Disposition: inline; filename="<originalFilename>"`

Fallback van doc `data/vlearn-pack/slides/d1-slide-hackathon.pdf` neu storage file khong ton tai.

### `POST /api/chat`

Input:

```json
{
  "lesson_id": "day1-foundation",
  "message": "tom tat slide nay",
  "current_slide_page": 1,
  "selected_text": ""
}
```

Response:

```json
{ "reply": "...", "citations": "Slide 1" }
```

Giu logic mock hien tai truoc:

- Co `selected_text` -> scope theo text dang chon.
- Message co `toan bo slide`, `toàn bộ slide`, `tom tat` -> scope tat ca pages.
- Message co `trang N` hoac `slide N` -> scope page N.
- Mac dinh -> current slide page.

## Database migration

Chuyen Prisma schema sang SQLAlchemy models/Alembic trong backend. Bang va cot nen giu ten gan voi schema hien tai de khong phai rebuild DB Aiven.

Mapping model hien tai:

- `User`
- `Course`
- `Lesson`
- `SlideDeck`
- `SlidePage`
- `SlideChunk`
- `ChatlogImport`
- `StudentQuestion`
- `KnowledgePack`
- `KnowledgeItem`
- `Citation`
- `Conversation`
- `ChatMessage`
- `IngestionJob`
- `Transcript`

Luu y Prisma hien tai dung camelCase field trong app, nhung DB PostgreSQL co the la quoted camelCase tuy theo migration/seed da tao. Antigravity can inspect DB/Alembic/Prisma migration thuc te truoc khi viet SQLAlchemy `Column(name=...)`.

Khuyen nghi:

1. Neu DB Aiven da co schema dung Prisma tao ra, SQLAlchemy models phai map dung ten table/column hien co.
2. Neu chua can Alembic apply ngay, tao Alembic baseline tu schema hien co de tranh drop/recreate data.
3. Khong chay destructive migration tren Aiven.
4. Backend `.env.example` chi ghi:

```env
DATABASE_URL=postgresql+asyncpg://USER:PASSWORD@HOST:PORT/DB?ssl=require
BACKEND_CORS_ORIGINS=http://localhost:3000
UPLOAD_DIR=uploads
```

## Frontend integration strategy

De it rui ro nhat, lam theo 2 pha.

### Pha 1: Next API proxy sang FastAPI

Giu cac fetch hien tai trong `page.tsx`:

- `/api/review-packs`
- `/api/review-packs/{pack_id}`
- `/api/review-packs/{pack_id}/items/{item_id}`
- `/api/review-packs/{pack_id}/export-pdf`
- `/api/lessons`
- `/api/lessons/{lesson_id}/slide`
- `/api/chat`

Sua Next API routes thanh proxy mong:

- Doc `FASTAPI_BASE_URL`, default `http://127.0.0.1:8000`.
- Forward method, query, headers can thiet, body/form-data.
- Forward status, JSON/PDF body, `Content-Type`, `Content-Disposition`, `X-Artifact-Path`.

Loi ich: UI khong can sua nhieu, CORS gan nhu khong phat sinh, rollback de.

### Pha 2: Frontend goi FastAPI truc tiep

Sau khi parity on dinh:

- Tao `codebase/frontend/src/lib/api-client.ts`.
- Dung `NEXT_PUBLIC_API_BASE_URL`.
- Replace fetch relative `/api/...` bang helper.
- Xoa Next API routes cu va xoa Prisma/frontend DB dependencies.

## Viec can xoa khoi frontend sau khi FastAPI on dinh

Chi xoa sau khi da verify parity:

- `codebase/frontend/src/lib/db.ts`
- `codebase/frontend/prisma/`
- `codebase/frontend/prisma.config.ts`
- `codebase/frontend/dev.db`
- Prisma dependencies trong `codebase/frontend/package.json`:
  - `@prisma/client`
  - `prisma`
  - `@prisma/adapter-pg`
  - `@prisma/adapter-better-sqlite3`
  - `better-sqlite3`
  - `pg`
- DB seed scripts trong frontend neu da port sang backend.

Khong xoa `codebase/shared` va `data/vlearn-pack` trong buoc dau, vi backend moi van can fallback artifacts.

## Suggested implementation prompt for Antigravity

```text
Implement a FastAPI backend migration without changing the current end-to-end user flow.

Repository context:
- Current frontend is Next.js in codebase/frontend.
- Current backend logic is incorrectly inside Next API routes under codebase/frontend/src/app/api.
- Current DB access is incorrectly inside frontend via Prisma under codebase/frontend/src/lib/db.ts and codebase/frontend/prisma.
- Existing Postgres Aiven connection is provided by DATABASE_URL in env. Do not hardcode or commit secrets.
- Keep codebase/shared and data/vlearn-pack fallback artifacts working.

Goal:
1. Create codebase/backend-fastapi with FastAPI, SQLAlchemy async, asyncpg, Alembic, Pydantic schemas, pytest/httpx tests.
2. Port the behavior of the existing Next API routes to FastAPI while preserving route paths, request bodies, response JSON shapes, status codes, and PDF headers.
3. Keep frontend UI behavior unchanged.
4. Use Phase 1 integration: convert or keep Next API routes as thin proxies to FastAPI using FASTAPI_BASE_URL=http://127.0.0.1:8000, so existing frontend fetch('/api/...') calls continue to work.
5. Only after parity is verified, remove Prisma/database ownership from frontend. Do not delete fallback artifacts.

Required FastAPI routes:
- GET /api/review-packs
- POST /api/review-packs
- GET /api/review-packs/{pack_id}
- PATCH /api/review-packs/{pack_id}/items/{item_id}
- POST /api/review-packs/{pack_id}/export-pdf
- GET /api/lessons
- POST /api/lessons
- GET /api/lessons/{lesson_id}/slide
- POST /api/chat

Implementation rules:
- Preserve role behavior from header/query x-vluoi-role / role. labcoach can mutate and see needs_review. student sees only ready items.
- Preserve fallback behavior to codebase/shared JSON/PDF and data/vlearn-pack slide PDF.
- Preserve mock chat behavior initially. Do not introduce a real LLM unless separately requested.
- Preserve MVP upload behavior: save PDF, create Lesson, SlideDeck, mock 5 SlidePages, create page-level SlideChunks.
- Map SQLAlchemy models to existing Aiven DB schema. Inspect actual table/column names before writing migrations. Do not run destructive migrations.
- Add .env.example but never commit real DATABASE_URL.
- Add smoke/parity tests for each route.

Verification:
- Start FastAPI on port 8000 and Next on port 3000.
- Verify frontend can:
  1. Load lesson catalog as student.
  2. Load review pack as student and hide needs_review.
  3. Switch to labcoach and see needs_review.
  4. Approve/drop one item.
  5. Export PDF and receive application/pdf.
  6. Upload lesson PDF and get lesson + slideDeck JSON.
  7. Open slide iframe.
  8. Send chat message and receive reply + citations.
- Run frontend build/lint if available and backend tests.
```

## Acceptance criteria

- `codebase/backend-fastapi` exists and owns all DB access.
- FastAPI route responses match the current Next API route contracts.
- Frontend workflow works without changing user-visible flow.
- `DATABASE_URL` is read only from backend env.
- No secret is committed.
- Next API routes are either thin proxies or removed only after frontend uses a typed API client.
- Prisma and `dev.db` are removed from frontend only after FastAPI parity is verified.
- Tests or smoke scripts cover all current workflows.

## Rui ro chinh can tranh

- Doi response shape lam `page.tsx` vo silently.
- Doi `pack_id -> lesson_id` parsing khong tuong thich voi `pack-day1-foundation-001`.
- Mat filter role student/labcoach.
- PDF route mat binary headers.
- Upload file luu o frontend cwd thay vi backend cwd.
- Alembic tao schema moi lam lech DB Aiven dang co.
- Xoa Prisma/front API route qua som truoc khi co FastAPI parity.
