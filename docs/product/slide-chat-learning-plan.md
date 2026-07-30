# Plan chuyen VLười tu mock data sang web hoc slide co DB that

## 1. Cau truc hien tai

Repo hien tai dang chia thanh cac phan chinh:

- `codebase/frontend`: ung dung Next.js 16, React 19. Day la app web chinh hien tai.
- `codebase/frontend/src/app/page.tsx`: UI mot trang, co switch vai tro `student` / `labcoach`, hien review pack, slide PDF, dashboard, blindspot, release.
- `codebase/frontend/src/app/api/review-packs/*`: API route doc/ghi review pack, duyet item, export PDF.
- `codebase/frontend/src/app/api/lessons/[lessonId]/slide/route.ts`: tra PDF slide tu file local.
- `codebase/frontend/src/lib/review-packs/*`: service, type, auth demo, catalog mapping lesson.
- `codebase/shared`: artifact JSON dang dong vai tro "local DB", gom slide extract, questions, clusters, generated, review pack, export PDF.
- `codebase/pipeline`: pipeline Python xu ly PDF + chatlog CSV thanh JSON artifact.
- `data/vlearn-pack`: data hackathon mau, gom PDF slide, transcript, chatlog CSV.
- `eval`: golden set, rubric, run logs de kiem tra chatlog/cluster/generation.

Ket luan: san pham hien tai la prototype co pipeline that mot phan, nhung app runtime van doc/ghi artifact JSON. Chua co upload slide, chua co DB quan ly course/session/document, chua co indexing, chua co chat hoi-dap theo ngu canh slide, va phan quyen chi la demo bang header.

## 2. Muc tieu san pham moi

Xay mot web hoc tap co 2 vai tro:

- Lab Coach tai len slide, chatlog/transcript, chay xu ly AI, duyet/tinh chinh knowledge pack.
- Hoc vien xem slide, hoi dap ve slide dang xem, doan text dang boi den, mot slide cu the, hoac toan bo deck.

Ung dung khong dung mock data trong runtime. Tat ca du lieu chinh can co DB cu the, file slide can co storage ro rang, va cac cau tra loi cua chatbot phai duoc grounding vao slide/chatlog.

## 3. Huong kien truc nen chon

Nen giu `codebase/frontend` lam monolith Next.js truoc, them DB va cac module backend trong cung app. Ly do:

- Du hackathon/MVP nhanh hon so voi tach backend rieng.
- API route hien co da la seam tu UI sang backend, co the thay JSON service bang DB service ma khong phai viet lai toan bo UI mot luc.
- Sau nay neu can scale ingestion/chat rieng thi tach worker hoac backend service sau.

Stack de xuat:

- App: Next.js App Router hien co.
- DB: PostgreSQL.
- ORM: Prisma.
- File storage MVP: local `uploads/` trong dev, sau do doi sang S3/R2/Supabase Storage.
- PDF processing: giu pipeline Python hien co cho buoc dau, goi qua job worker; ve sau co the chuyen cac buoc nhe sang Node.
- Vector search: giai doan 1 dung `pgvector` trong PostgreSQL neu co the; neu khong, luu chunks truoc va them vector sau.
- AI provider: tao adapter chung `AiProvider`, khong hardcode mot provider vao route.
- Auth MVP: session/user role that trong DB; neu can nhanh thi dung NextAuth/Auth.js hoac auth custom cookie don gian.

## 4. Domain model can co

Nen doi cach nghi tu `review-pack` thanh cac module domain sau:

- `Course`: lop/khoa hoc.
- `Lesson`: mot buoi hoc hoac mot deck slide.
- `SlideDeck`: file slide goc do Lab Coach upload.
- `SlidePage`: tung trang slide da extract text/image.
- `SlideChunk`: doan nho de retrieval, co page number va bounding/source info neu co.
- `ChatLogImport`: file chatlog/transcript nguon.
- `StudentQuestion`: cau hoi that cua hoc vien trich tu chatlog.
- `KnowledgePack`: ban tong hop kien thuc sinh tu slide + chatlog.
- `KnowledgeItem`: summary, misconception, Q&A, quiz, blindspot.
- `Conversation`: phien chat cua hoc vien voi mot lesson/deck.
- `ChatMessage`: tin nhan user/assistant, luu context dang dung.
- `Citation`: lien ket cau tra loi/item ve slide page/chunk/chatlog evidence.
- `IngestionJob`: trang thai xu ly upload, extract, embed, cluster, generate.

## 5. Schema DB de xuat

MVP PostgreSQL nen co cac bang sau:

```text
users
- id, name, email, role, created_at

courses
- id, title, description, owner_id, created_at

lessons
- id, course_id, title, description, status, created_by, created_at, updated_at

slide_decks
- id, lesson_id, original_filename, storage_key, mime_type, page_count, status, uploaded_by, created_at

slide_pages
- id, deck_id, page_number, text_content, image_storage_key, thumbnail_storage_key, created_at

slide_chunks
- id, page_id, deck_id, lesson_id, chunk_index, content, embedding, token_count, metadata, created_at

chatlog_imports
- id, lesson_id, original_filename, storage_key, status, uploaded_by, created_at

student_questions
- id, lesson_id, import_id, anonymized_user_id, message, normalized_message, slide_page_hint, created_at

knowledge_packs
- id, lesson_id, version, status, generated_by, generated_at, published_at

knowledge_items
- id, pack_id, type, title, content, confidence, status, metadata, created_at

citations
- id, target_type, target_id, slide_page_id, slide_chunk_id, student_question_id, quote, created_at

conversations
- id, lesson_id, user_id, active_slide_page, created_at, updated_at

chat_messages
- id, conversation_id, role, content, selected_text, referenced_slide_page, retrieval_context, created_at

ingestion_jobs
- id, lesson_id, type, status, progress, error, metadata, started_at, finished_at, created_at
```

`embedding` co the la `vector` neu dung `pgvector`; neu chua cai duoc `pgvector`, tam thoi luu `embedding_json` de khong chan MVP.

## 6. Workflow Lab Coach

1. Tao lesson moi.
2. Upload PDF slide.
3. He thong tao `slide_deck`, luu file, tao `ingestion_job`.
4. Job extract tung trang thanh `slide_pages`: text, thumbnail/image preview.
5. Job chunk va embed thanh `slide_chunks`.
6. Lab Coach upload chatlog/transcript neu co.
7. Job preprocess chatlog thanh `student_questions`, detect slide hints neu message co nhac "slide 5", "trang 10", "phần attention", v.v.
8. Job cluster cau hoi, map cluster ve slide chunks.
9. AI sinh `knowledge_pack`: summary toan deck, key concepts theo slide/page, misconceptions, Q&A, quiz.
10. Lab Coach duyet `knowledge_items`: approve, edit, hide, regenerate.
11. Publish pack cho hoc vien.

## 7. Workflow hoc vien

1. Chon lesson.
2. Xem slide bang viewer co state `currentPage`.
3. Chatbot mac dinh lay context theo `currentPage` neu hoc vien khong chi ro.
4. Neu hoc vien boi den text tren slide, request chat gui kem `selected_text` va `currentPage`.
5. Neu hoc vien hoi "slide so 7..." thi parser uu tien `referenced_slide_page = 7`.
6. Neu hoi "tom tat toan bo slide" thi retrieval chay o deck scope, khong chi current page.
7. Assistant tra loi ngan gon, kem citations ve slide page va neu phu hop thi them "cau hoi lop tung hoi".
8. Luu conversation/chat_messages de hoc vien tiep tuc hoi tiep va Lab Coach xem insight sau.

## 8. Context routing cho chatbot

Can co mot ham trung tam `resolveQuestionContext(input)`:

Input:

- `lesson_id`
- `message`
- `current_slide_page`
- `selected_text`
- `conversation_id`

Output:

- `scope`: `selected_text` | `explicit_slide` | `current_slide` | `whole_deck`
- `page_numbers`
- `query`
- `retrieval_filters`

Thu tu uu tien:

1. Co `selected_text`: hoi ve text dang boi den tren slide hien tai.
2. Message co nhac slide/trang so cu the: hoi ve page do.
3. Message co y dinh global nhu "tom tat toan bo", "cac y chinh", "toan bo slide": hoi toan deck.
4. Mac dinh: hoi ve `current_slide_page`.

Sau khi resolve context, API chat se retrieval `slide_chunks` va `student_questions` lien quan, roi goi AI voi prompt bat buoc citation theo page.

## 9. API routes can them/thay doi

Nen them cac route sau:

```text
POST /api/lessons
GET  /api/lessons
GET  /api/lessons/:lessonId

POST /api/lessons/:lessonId/slides
GET  /api/lessons/:lessonId/slides
GET  /api/lessons/:lessonId/slides/:pageNumber

POST /api/lessons/:lessonId/chatlogs
POST /api/lessons/:lessonId/ingestion-jobs
GET  /api/ingestion-jobs/:jobId

POST /api/lessons/:lessonId/knowledge-packs/generate
GET  /api/lessons/:lessonId/knowledge-packs/current
PATCH /api/knowledge-items/:itemId
POST /api/knowledge-packs/:packId/publish

POST /api/lessons/:lessonId/conversations
GET  /api/conversations/:conversationId/messages
POST /api/conversations/:conversationId/messages
```

Route `review-packs` hien tai co the giu tam thoi de migrate UI tung phan, nhung nen xem la legacy adapter.

## 10. Frontend can doi

Student:

- Man hinh chinh nen la split view: slide viewer ben trai, chat ben phai.
- Slide viewer can co page navigation, thumbnail rail, current page state, selected text state.
- Chat composer gui `message`, `current_slide_page`, `selected_text`.
- Tra loi assistant hien citations bam duoc: `Slide 7`, `Slide 12`, doan evidence ngan.
- Them quick actions: "Tom tat slide nay", "Giai thich text da chon", "Tom tat toan bo deck".

Lab Coach:

- Dashboard lesson list thay cho lesson hardcode.
- Upload slide PDF va chatlog/transcript.
- Job progress: uploaded, extracting, chunking, embedding, clustering, generating, ready/error.
- Knowledge review table/card: filter `needs_review`, edit content, approve, hide, regenerate item.
- Preview che do hoc vien truoc khi publish.

## 11. Migration tu code hien tai

Phase 1: Cai DB layer

- Them Prisma vao `codebase/frontend`.
- Tao `prisma/schema.prisma` voi cac bang MVP.
- Tao `.env.example` co `DATABASE_URL`.
- Tao seed import du lieu hien co tu `codebase/shared/review-pack-day1-foundation.json` va PDF local vao DB.
- Tao `src/lib/db.ts` va repositories cho lesson, slide, knowledge pack.

Phase 2: Thay local JSON service bang DB

- Doi `readLocalDb`, `readReviewPack`, `writeReviewPack` thanh repository DB.
- Giu response shape gan voi `ReviewPack` hien tai de UI khong vo lon.
- Route `/api/review-packs` lay lesson/pack tu DB thay vi `codebase/shared/local-db.json`.
- Route slide lay file tu `slide_decks.storage_key`.

Phase 3: Upload va ingestion

- Them upload endpoint cho slide PDF.
- Luu file vao `uploads/slides`.
- Tao job extract pages.
- Reuse pipeline Python: refactor input/output de nhan `lesson_id`, path PDF, path chatlog, output vao DB thay vi JSON file.
- Neu chua co queue, MVP co the chay job sync/async bang server action/API route, nhung can co bang `ingestion_jobs` de UI poll.

Phase 4: Student slide chat

- Tao conversation/message tables va API chat.
- Implement `resolveQuestionContext`.
- Implement retrieval tu `slide_chunks` theo scope.
- Goi AI de answer co citations.
- UI split slide viewer + chat.

Phase 5: Lab Coach knowledge workflow

- Generate knowledge pack tu slide chunks + chatlog clusters.
- Luu `knowledge_items` va `citations`.
- Lab Coach approve/edit/hide/publish.
- Student chi thay pack da publish va item status `ready`.

Phase 6: Hardening

- Auth/role that.
- File size limits va validation PDF/CSV.
- Background worker that neu job cham.
- Tests cho context routing, repositories, chat API, permission checks.
- Eval grounding: cau tra loi phai co citation va khong tra loi ngoai slide khi khong co bang chung.

## 12. Thu tu implement de it vo nhat

Nen yeu cau Antigravity lam theo thu tu nay:

1. Them Prisma/PostgreSQL va schema MVP.
2. Seed du lieu demo hien co vao DB.
3. Doi API `review-packs` sang doc DB nhung giu UI hien tai chay duoc.
4. Them Lab Coach upload slide cho lesson moi.
5. Them extract slide pages va hien viewer tu DB.
6. Them chat theo `current_slide_page`.
7. Them selected text va explicit slide parser.
8. Them chatlog import + knowledge generation.
9. Them approve/publish workflow that.

## 13. Acceptance criteria

- Khong con phu thuoc `codebase/shared/local-db.json` trong runtime chinh.
- Lab Coach tao lesson moi va upload PDF moi duoc.
- Sau upload, DB co `slide_decks`, `slide_pages`, `slide_chunks`.
- Hoc vien xem slide tu lesson vua upload.
- Khi hoc vien hoi trong luc dang o slide N, chatbot tra loi dua tren slide N neu cau hoi khong noi scope khac.
- Khi hoc vien boi den text, chatbot uu tien text do.
- Khi hoc vien hoi "slide so X", chatbot dung slide X.
- Khi hoc vien hoi "tom tat toan bo slide", chatbot dung toan deck va tra loi co citations.
- Lab Coach upload chatlog va sinh knowledge pack tu slide + chatlog.
- Lab Coach duyet/publish, hoc vien chi thay noi dung da publish.

## 14. Prompt goi y cho Antigravity

```text
Hay doc docs/product/slide-chat-learning-plan.md va implement theo Phase 1 -> Phase 2 truoc.
Muc tieu dau tien: them PostgreSQL/Prisma schema, seed artifact hien co vao DB, va doi API review-packs hien tai sang doc DB nhung giu UI hien tai khong vo.
Sau khi xong hay chay lint/build/test lien quan va bao cao file da sua.
```

