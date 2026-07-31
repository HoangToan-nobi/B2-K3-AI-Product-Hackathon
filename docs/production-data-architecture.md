# Production Data Architecture

VLười hiện chạy được bằng local JSON/file storage để demo nhanh. Khi đưa vào vận hành thật, không dùng `codebase/shared/local-db.json` và local upload folder làm nguồn dữ liệu chính.

## Quyết Định Lưu Trữ

- Database: Postgres cho metadata, review pack, trạng thái duyệt, job pipeline và audit log.
- Object storage: S3/Supabase Storage/Vercel Blob cho PDF slide, CSV chatlog, artifact JSON và PDF export.
- Cache tùy chọn: Redis/queue backend cho job dài như extract PDF, clustering và generation.

Không lưu PDF/CSV trực tiếp trong database. Database chỉ lưu `storage_key`, checksum, size, MIME type và quan hệ nghiệp vụ.

## Bảng Cốt Lõi

```sql
create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  display_name text not null,
  role text not null check (role in ('student', 'labcoach', 'teacher', 'admin')),
  created_at timestamptz not null default now()
);

create table courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  cohort text,
  created_at timestamptz not null default now()
);

create table lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade,
  title text not null,
  day_codes text[] not null default '{}',
  slide_count integer not null check (slide_count > 0),
  status text not null default 'uploaded' check (status in ('uploaded', 'processing', 'needs_review', 'ready', 'archived')),
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table lesson_files (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  kind text not null check (kind in ('slide_pdf', 'chatlog_csv', 'slide_artifact', 'question_artifact', 'export_pdf')),
  storage_key text not null,
  mime_type text not null,
  size_bytes bigint not null,
  checksum_sha256 text,
  created_at timestamptz not null default now()
);

create table student_questions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  anon_user_id text not null,
  turn_id text,
  question text not null,
  normalized_question text,
  page integer,
  noise_reason text,
  is_included boolean not null default true,
  created_at timestamptz not null default now()
);

create table question_clusters (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  topic text not null,
  unique_user_count integer not null default 0,
  question_count integer not null default 0,
  source_pages integer[] not null default '{}',
  status text not null default 'needs_review' check (status in ('needs_review', 'ready', 'dropped')),
  created_at timestamptz not null default now()
);

create table review_packs (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  version integer not null default 1,
  status text not null default 'needs_review' check (status in ('needs_review', 'ready', 'published', 'archived')),
  analysis jsonb not null default '{}',
  warnings jsonb not null default '[]',
  generated_at timestamptz not null default now(),
  unique (lesson_id, version)
);

create table review_items (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references review_packs(id) on delete cascade,
  item_type text not null check (item_type in ('summary', 'class_insight', 'review_question')),
  title text,
  content text not null,
  source_pages integer[] not null default '{}',
  source_excerpt text,
  confidence numeric not null default 0,
  status text not null default 'needs_review' check (status in ('needs_review', 'ready', 'dropped')),
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table pipeline_jobs (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  job_type text not null check (job_type in ('extract', 'preprocess', 'cluster', 'generate', 'build_pack', 'export_pdf')),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users(id),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
```

## Mapping Từ Prototype Sang Production

| Prototype hiện tại | Production |
|---|---|
| `local-db.json` | `lessons`, `users`, `review_packs` |
| `review-pack-*.json` | `review_packs` + `review_items` |
| `uploads/<lesson>/slide.pdf` | `lesson_files(kind='slide_pdf')` + object storage |
| `uploads/<lesson>/chatlog.csv` | `lesson_files(kind='chatlog_csv')` + object storage |
| `slide-*.json`, `questions-*.json` | `lesson_files` hoặc generated artifact table |
| role header demo | real auth session/JWT + `users.role` |

## API Nên Đổi Khi Có DB

- `GET /api/review-packs`: query `lessons` + latest `review_packs`.
- `POST /api/lessons`: upload file vào object storage, đọc số trang, insert `lessons` + `lesson_files`.
- `POST /api/review-packs`: tạo `pipeline_jobs`, worker chạy async, không block request dài.
- `PATCH /api/review-packs/[packId]/items/[itemId]`: update `review_items`, ghi `audit_logs`.
- `POST /api/review-packs/[packId]/qa`: chỉ đọc `review_items.status='ready'`, không đọc item dropped/needs_review.

## Điều Kiện Để Deploy Thật

- Có `DATABASE_URL`.
- Có object storage bucket và signed upload/download URL.
- Có auth thật thay cho `x-vluoi-role`.
- Có queue/job runner cho pipeline dài.
- Có migration từ artifact demo sang DB để vẫn giữ Day 1 làm seed data.
