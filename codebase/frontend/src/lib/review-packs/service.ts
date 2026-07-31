import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { EVAL_RUNS_DIR, getLessonMapping, getPackPath, getPdfPath, LOCAL_DB_PATH, PIPELINE_DIR, SHARED_DIR, UPLOADS_DIR } from "./catalog";
import { generateReviewPackPdf } from "./pdf";
import type { AppRole, ClassInsight, CreateReviewPackInput, LessonMapping, LocalDb, ReviewPack, ReviewPackItem, ReviewPackJob, SummaryItem, UpdateReviewItemInput, UploadedLesson } from "./types";
import {
  applyGroundingGate,
  buildReviewPack,
  computeUniqueUserCounts,
  runClustering,
  runGeneration,
  type QuestionRecord,
  type Slide,
} from "@/lib/pipeline";

const execFileAsync = promisify(execFile);

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "lesson";
}

function isFormFile(value: FormDataEntryValue | null): value is File {
  return Boolean(
    value
      && typeof value === "object"
      && "arrayBuffer" in value
      && typeof (value as { arrayBuffer?: unknown }).arrayBuffer === "function",
  );
}

function assertPackShape(value: unknown): asserts value is ReviewPack {
  if (!value || typeof value !== "object") throw new Error("Review pack is not an object");
  const pack = value as Partial<ReviewPack>;
  if (typeof pack.pack_id !== "string") throw new Error("Review pack missing pack_id");
  if (!pack.lesson || typeof pack.lesson.id !== "string") throw new Error("Review pack missing lesson");
  if (!Array.isArray(pack.summary)) throw new Error("Review pack missing summary");
  if (!Array.isArray(pack.class_insights)) throw new Error("Review pack missing class_insights");
  if (!Array.isArray(pack.review_questions)) throw new Error("Review pack missing review_questions");
  if (!Array.isArray(pack.warnings)) throw new Error("Review pack missing warnings");
}

function findItem(pack: ReviewPack, itemId: string): ReviewPackItem | undefined {
  return (
    pack.summary.find((item) => item.id === itemId)
    || pack.class_insights.find((item) => item.id === itemId)
    || pack.review_questions.find((item) => item.id === itemId)
  );
}

function recomputePackStatus(pack: ReviewPack): void {
  const hasReviewItem = [...pack.summary, ...pack.class_insights, ...pack.review_questions].some(
    (item) => item.status === "needs_review",
  );
  pack.status = hasReviewItem ? "needs_review" : "ready";
}

async function prepareUploadedArtifacts(lesson: UploadedLesson): Promise<void> {
  const slideArtifact = path.join(SHARED_DIR, `slide-${lesson.lesson_id}.json`);
  const questionArtifact = path.join(SHARED_DIR, `questions-${lesson.lesson_id}.json`);
  const extractScript = path.join(PIPELINE_DIR, "01_extract_slides.py");
  const preprocessScript = path.join(PIPELINE_DIR, "02_preprocess_chatlog.py");
  const dayCodes = lesson.day_codes.join(",");

  try {
    await execFileAsync("python3", [extractScript, lesson.slide_pdf, lesson.lesson_id, slideArtifact], {
      cwd: PIPELINE_DIR,
      timeout: 60_000,
      maxBuffer: 1024 * 1024 * 2,
    });
    await execFileAsync("python3", [preprocessScript, lesson.chatlog_csv, lesson.lesson_id, dayCodes, String(lesson.max_page), questionArtifact], {
      cwd: PIPELINE_DIR,
      timeout: 60_000,
      maxBuffer: 1024 * 1024 * 2,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cannot preprocess uploaded input";
    throw new Error(`Không thể đọc dữ liệu upload: ${message}. Cần Python 3 và pdftotext/Poppler trên server.`);
  }
}

async function detectPdfPageCount(pdfPath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("pdfinfo", [pdfPath], {
      timeout: 10_000,
      maxBuffer: 1024 * 256,
    });
    const pagesLine = stdout.split(/\r?\n/).find((line) => line.toLowerCase().startsWith("pages:"));
    const pageCount = Number(pagesLine?.replace(/pages:\s*/i, "").trim());
    if (Number.isFinite(pageCount) && pageCount > 0) return pageCount;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cannot run pdfinfo";
    throw new Error(`Không tự đọc được số trang PDF: ${message}. Cần Poppler/pdfinfo trên server.`);
  }
  throw new Error("Không tự đọc được số trang PDF: pdfinfo không trả về trường Pages.");
}

// Chay song song clustering + generate bang cach goi thang DeepSeek qua fetch (khong shell
// ra Python) — dung khi moi truong khong co bash/python3/pdftotext (vd Vercel serverless).
// Doc du lieu slide/questions da tien xu ly san (khong doi, chi phan cluster+generate can AI
// that chay lai) tu dung SHARED_DIR de dam bao khop voi ban Python neu chay lai xen ke.
async function runTypeScriptPipelineLive(lessonId: string, lessonTitle: string): Promise<ReviewPack> {
  const slideRaw = await readFile(path.join(SHARED_DIR, `slide-${lessonId}.json`), "utf8");
  const questionsRaw = await readFile(path.join(SHARED_DIR, `questions-${lessonId}.json`), "utf8");
  const slide = JSON.parse(slideRaw) as Slide;
  const questions = JSON.parse(questionsRaw) as QuestionRecord[];

  const clusters = await runClustering(questions, slide);
  const generatedRaw = await runGeneration(slide, clusters, lessonTitle);
  const turnToUser = computeUniqueUserCounts(questions);
  const generated = applyGroundingGate(generatedRaw, slide, clusters, turnToUser);

  // lib/pipeline.ts dung kieu du lieu rieng (GroundedItem chung cho ca 3 mang) de doc lap voi
  // service nay va khop 1-1 voi ban Python — nhung ve mat JSON, shape khop dung ReviewPack
  // cua chinh module nay (da xac minh bang scripts/verify-review-pack.mjs).
  const pack = buildReviewPack(
    lessonId,
    lessonTitle,
    slide.page_count,
    questions,
    clusters,
    generated
  ) as unknown as ReviewPack;
  await writeReviewPack(pack);
  return pack;
}

function defaultLocalDb(): LocalDb {
  return {
    active_lesson_id: "day1-foundation",
    published_pack_ids: ["pack-day1-foundation-001"],
    hidden_lesson_ids: [],
    uploaded_lessons: [],
    users: [
      { id: "student-demo", name: "Học viên demo", role: "student" },
      { id: "labcoach-demo", name: "Lab Coach demo", role: "labcoach" },
    ],
  };
}

export async function readLocalDb(): Promise<LocalDb> {
  try {
    const raw = await readFile(LOCAL_DB_PATH, "utf8");
    return { ...defaultLocalDb(), ...(JSON.parse(raw) as Partial<LocalDb>) };
  } catch {
    const db = defaultLocalDb();
    await mkdir(path.dirname(LOCAL_DB_PATH), { recursive: true });
    await writeFile(LOCAL_DB_PATH, `${JSON.stringify(db, null, 2)}\n`, "utf8");
    return db;
  }
}

async function writeLocalDb(db: LocalDb): Promise<void> {
  await mkdir(path.dirname(LOCAL_DB_PATH), { recursive: true });
  await writeFile(LOCAL_DB_PATH, `${JSON.stringify(db, null, 2)}\n`, "utf8");
}

export async function getLessonMappingById(lessonId = "day1-foundation"): Promise<LessonMapping> {
  try {
    return getLessonMapping(lessonId);
  } catch {
    const db = await readLocalDb();
    const lesson = db.uploaded_lessons.find((item) => item.lesson_id === lessonId);
    if (!lesson) throw new Error(`Unknown lesson_id: ${lessonId}`);
    return lesson;
  }
}

async function loadQuestionStats(lessonId: string): Promise<{
  student_question_count: number;
  unique_user_count: number;
  excluded_noise_count: number;
}> {
  try {
    const raw = await readFile(path.join(SHARED_DIR, `questions-${lessonId}.json`), "utf8");
    const questions = JSON.parse(raw) as QuestionRecord[];
    const included = questions.filter((question) => !question.is_noise);
    return {
      student_question_count: questions.length,
      unique_user_count: new Set(included.map((question) => question.user_id)).size,
      excluded_noise_count: questions.length - included.length,
    };
  } catch {
    return {
      student_question_count: 0,
      unique_user_count: 0,
      excluded_noise_count: 0,
    };
  }
}

async function summarizeStudentDayCodes(csvPath: string): Promise<Array<{ code: string; count: number }>> {
  try {
    const raw = await readFile(csvPath, "utf8");
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const header = lines[0]?.split(",") || [];
    const dayCodeIndex = header.indexOf("day_code");
    const roleIndex = header.indexOf("role");
    if (dayCodeIndex < 0 || roleIndex < 0) return [];

    const counts = new Map<string, number>();
    for (const line of lines.slice(1)) {
      const cols = line.split(",");
      if (cols[roleIndex] !== "student") continue;
      const code = (cols[dayCodeIndex] || "").trim() || "(trống)";
      counts.set(code, (counts.get(code) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  } catch {
    return [];
  }
}

function buildEmptyUploadedPack(lesson: UploadedLesson, stats?: {
  student_question_count: number;
  unique_user_count: number;
  excluded_noise_count: number;
  day_code_suggestions?: Array<{ code: string; count: number }>;
}): ReviewPack {
  const suggestions = stats?.day_code_suggestions?.length
    ? ` Các day_code student thấy nhiều trong CSV: ${stats.day_code_suggestions.map((item) => `${item.code} (${item.count})`).join(", ")}.`
    : "";

  return {
    schema_version: "1.0",
    pack_id: `pack-${lesson.lesson_id}-001`,
    status: "needs_review",
    lesson: {
      id: lesson.lesson_id,
      title: lesson.title,
      slide_count: lesson.max_page,
    },
    analysis: {
      student_question_count: stats?.student_question_count || 0,
      unique_user_count: stats?.unique_user_count || 0,
      cluster_count: 0,
      included_cluster_count: 0,
      excluded_noise_count: stats?.excluded_noise_count || 0,
    },
    summary: [
      {
        id: "summary-01",
        title: "Thêm nội dung trọng tâm đầu tiên",
        content: "Lab Coach có thể chỉnh mục này sau khi upload dữ liệu hoặc sau khi chạy AI để soát từng phần của slide.",
        source_pages: [1],
        source_excerpt: "Nội dung chờ trích xuất từ slide upload.",
        confidence: 0.2,
        status: "needs_review",
      },
    ],
    class_insights: [],
    review_questions: [],
    warnings: [
      {
        code: "uploaded_waiting_for_analysis",
        message: stats?.student_question_count
          ? "Buổi học vừa được upload và chatlog đã được preprocess. Hãy chạy AI để tạo cluster/summary hoặc thêm/sửa nội dung trọng tâm trước khi gửi học viên."
          : `Buổi học vừa được upload nhưng chưa có tin nhắn student nào được nhận từ chatlog. Kiểm tra day_codes hoặc schema CSV rồi upload lại.${suggestions}`,
        item_ids: ["summary-01"],
      },
    ],
    generated_at: new Date().toISOString(),
  };
}

function compactText(value: string, maxLength: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  return clean.slice(0, maxLength).replace(/\s+\S*$/, "").trim();
}

function firstMeaningfulLine(value: string, fallback: string): string {
  return value.split(/\r?\n/).map((line) => line.trim()).find((line) => line.length > 8) || fallback;
}

function friendlyPipelineReason(reason: string): string {
  if (reason.includes("JSON") || reason.includes("Unterminated string")) {
    return "AI live trả JSON chưa hoàn chỉnh do output quá dài hoặc bị ngắt kết nối.";
  }
  if (reason.includes("DEEPSEEK_API_KEY")) return "Thiếu DEEPSEEK_API_KEY.";
  if (reason.toLowerCase().includes("timeout") || reason.includes("quá")) return "AI live phản hồi quá chậm.";
  return reason;
}

function topicFromQuestion(question: QuestionRecord, fallback: string): string {
  const selected = compactText(question.selected_text || "", 70);
  if (selected) return selected.replace(/[?.!]+$/g, "");
  const clean = compactText(question.clean_question || "", 70);
  return clean.replace(/[?.!]+$/g, "") || fallback;
}

async function buildFallbackClassInsights(lessonId: string, slide: Slide): Promise<ClassInsight[]> {
  let questions: QuestionRecord[] = [];
  try {
    const raw = await readFile(path.join(SHARED_DIR, `questions-${lessonId}.json`), "utf8");
    questions = JSON.parse(raw) as QuestionRecord[];
  } catch {
    return [];
  }

  const pageText = new Map(slide.pages.map((page) => [page.page, page.text]));
  const groups = new Map<number, QuestionRecord[]>();
  for (const question of questions) {
    if (question.is_noise || !question.page || !pageText.has(question.page)) continue;
    const current = groups.get(question.page) || [];
    current.push(question);
    groups.set(question.page, current);
  }

  return [...groups.entries()]
    .map(([page, items]) => {
      const users = new Set(items.map((item) => item.user_id));
      const representative = items.slice(0, 4).map((item) => item.clean_question);
      const slideExcerpt = compactText(pageText.get(page) || "", 220);
      const topic = topicFromQuestion(items[0], `Nội dung trang ${page}`);
      return {
        id: `insight-fallback-page-${page}`,
        topic: `Trang ${page}: ${topic}`,
        common_confusion: `Có ${items.length} lượt hỏi từ ${users.size} học viên quanh nội dung trang ${page}. Câu hỏi thường gặp: ${representative[0] || "học viên cần giải thích thêm nội dung này"}.`,
        correct_understanding: `Theo slide, phần này cần được hiểu dựa trên nội dung: ${slideExcerpt}`,
        source_pages: [page],
        source_excerpt: slideExcerpt,
        confidence: 0.72,
        status: "ready" as const,
        unique_user_count: users.size,
        question_count: items.length,
        representative_questions: representative,
      };
    })
    .sort((a, b) => b.unique_user_count - a.unique_user_count || b.question_count - a.question_count)
    .slice(0, 8);
}

async function buildOfflineGroundedPack(lessonId: string, lessonTitle: string, reason: string): Promise<ReviewPack> {
  const friendlyReason = friendlyPipelineReason(reason);
  const slideRaw = await readFile(path.join(SHARED_DIR, `slide-${lessonId}.json`), "utf8");
  const slide = JSON.parse(slideRaw) as Slide;
  const stats = await loadQuestionStats(lessonId);
  const pages = slide.pages.filter((page) => page.text.trim());
  const summaryPages = pages.slice(0, Math.min(18, pages.length));
  const summary = summaryPages.map((page, index) => ({
    id: `summary-${String(index + 1).padStart(2, "0")}`,
    title: firstMeaningfulLine(page.text, `Nội dung trang ${page.page}`),
    content: compactText(page.text, 620),
    source_pages: [page.page],
    source_excerpt: compactText(page.text, 180),
    confidence: 0.82,
    status: "ready" as const,
  }));

  const quizSources = pages.length ? pages : [{ page: 1, text: lessonTitle }];
  const review_questions = Array.from({ length: 12 }, (_, index) => {
    const page = quizSources[index % quizSources.length];
    const title = firstMeaningfulLine(page.text, `nội dung trang ${page.page}`);
    const answer = compactText(page.text, 260);
    return {
      id: `question-${String(index + 1).padStart(2, "0")}`,
      type: "multiple_choice" as const,
      question: `Theo slide, ý nào mô tả đúng về ${title.replace(/[?.!]+$/g, "")}?`,
      options: [
        answer,
        "Một ý chưa có dẫn chứng trực tiếp trong slide của buổi học này.",
        "Một nhận định chỉ suy ra từ chatlog, không dựa trên slide.",
        "Một lựa chọn ngoài phạm vi nội dung bài học.",
      ],
      correct_option: 0,
      answer,
      explanation: `Đáp án đúng vì nội dung này được trích từ trang ${page.page} của slide.`,
      source_pages: [page.page],
      source_excerpt: compactText(page.text, 180),
      confidence: 0.82,
      status: "ready" as const,
    };
  });
  const class_insights = await buildFallbackClassInsights(lessonId, slide);

  const pack: ReviewPack = {
    schema_version: "1.0",
    pack_id: `pack-${lessonId}-001`,
    status: "needs_review",
    lesson: {
      id: lessonId,
      title: lessonTitle,
      slide_count: slide.page_count,
    },
    analysis: {
      student_question_count: stats.student_question_count,
      unique_user_count: stats.unique_user_count,
      cluster_count: class_insights.length,
      included_cluster_count: class_insights.length,
      excluded_noise_count: stats.excluded_noise_count,
    },
    summary,
    class_insights,
    review_questions,
    warnings: [
      {
        code: "OFFLINE_GROUNDED_FALLBACK",
        message: `Không gọi được AI live (${friendlyReason}). Hệ thống đã tạo bản grounded fallback từ slide với ${summary.length} mục học liệu, ${class_insights.length} cụm phân tích lớp từ chatlog và 12 câu quiz; Lab Coach cần rà soát trước khi gửi học viên.`,
        item_ids: [...summary.map((item) => item.id), ...class_insights.map((item) => item.id), ...review_questions.map((item) => item.id)],
      },
    ],
    generated_at: new Date().toISOString(),
  };
  await writeReviewPack(pack);
  return pack;
}

export async function listLessonCatalog(role: AppRole): Promise<Array<{
  id: string;
  title: string;
  slide_count: number;
  pack_id: string;
  status: string;
  source_type: "demo" | "uploaded";
  slide_source_label?: string;
  chatlog_source_label?: string;
  day_code_label?: string;
}>> {
  const db = await readLocalDb();
  const hiddenLessonIds = new Set(db.hidden_lesson_ids || []);
  const baseMappings = [getLessonMapping("day1-foundation"), getLessonMapping("upload-day-2-ai-in-action")]
    .filter((lesson) => !hiddenLessonIds.has(lesson.lesson_id));
  const allLessons = [
    ...baseMappings.map((lesson) => ({ ...lesson, source_type: "demo" as const })),
    ...db.uploaded_lessons,
  ];

  return Promise.all(allLessons.map(async (lesson) => {
    const pack = await readReviewPack(lesson.lesson_id).catch(() => buildEmptyUploadedPack(lesson as UploadedLesson));
    const visiblePack = filterPackForRole(pack, role);
    return {
      id: lesson.lesson_id,
      title: lesson.title,
      slide_count: lesson.max_page,
      pack_id: visiblePack.pack_id,
      status: visiblePack.status,
      source_type: lesson.source_type,
      ...(role === "labcoach"
        ? {
            slide_source_label: lesson.source_type === "uploaded"
              ? `uploads/${lesson.lesson_id}/slide.pdf`
              : lesson.lesson_id === "upload-day-2-ai-in-action"
                ? "data/vlearn-pack/slides/d2-slide-hackathon.pdf"
                : "data/vlearn-pack/slides/d1-slide-hackathon.pdf",
            chatlog_source_label: lesson.source_type === "uploaded"
              ? `uploads/${lesson.lesson_id}/chatlog.csv`
              : lesson.lesson_id === "upload-day-2-ai-in-action"
                ? "codebase/shared/uploads/upload-day-2-ai-in-action/chatlog.csv"
                : "data/vlearn-pack/chatlog/chat_history_anonymized_for_hackathon.csv",
            day_code_label: lesson.day_codes.length ? lesson.day_codes.join(", ") : "Tất cả dòng student trong CSV upload",
          }
        : {}),
    };
  }));
}

export function filterPackForRole(pack: ReviewPack, role: AppRole): ReviewPack {
  if (role === "labcoach") return pack;
  return {
    ...pack,
    status: "ready",
    warnings: [],
    summary: pack.summary.filter((item) => item.status === "ready"),
    class_insights: pack.class_insights.filter((item) => item.status === "ready"),
    review_questions: pack.review_questions.filter((item) => item.status === "ready"),
  };
}

export async function readReviewPack(lessonId = "day1-foundation"): Promise<ReviewPack> {
  const raw = await readFile(getPackPath(lessonId), "utf8");
  const parsed = JSON.parse(raw) as unknown;
  assertPackShape(parsed);
  return parsed;
}

export async function writeReviewPack(pack: ReviewPack): Promise<void> {
  await mkdir(SHARED_DIR, { recursive: true });
  await writeFile(getPackPath(pack.lesson.id), `${JSON.stringify(pack, null, 2)}\n`, "utf8");
}

export async function createReviewPack(input: CreateReviewPackInput = {}): Promise<{
  pack: ReviewPack;
  job: ReviewPackJob;
  lesson_mapping: LessonMapping;
}> {
  const db = await readLocalDb();
  const mapping = await getLessonMappingById(input.lesson_id || db.active_lesson_id);

  if (input.run_pipeline) {
    if ("source_type" in mapping && mapping.source_type === "uploaded") {
      await prepareUploadedArtifacts(mapping as UploadedLesson);
      try {
        const pack = await runTypeScriptPipelineLive(mapping.lesson_id, mapping.title);
        return {
          pack,
          job: { mode: "typescript_pipeline_live", note: "Đã preprocess PDF/CSV upload và chạy pipeline grounded trên dữ liệu mới." },
          lesson_mapping: mapping,
        };
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Uploaded pipeline failed";
        const pack = await buildOfflineGroundedPack(mapping.lesson_id, mapping.title, reason);
        return {
          pack,
          job: {
            mode: "typescript_pipeline_live",
            note: `AI live chưa trả được kết quả hoàn chỉnh (${friendlyPipelineReason(reason)}). Đã tạo offline grounded fallback từ slide để demo tiếp.`,
          },
          lesson_mapping: mapping,
        };
      }
    }
    if (mapping.lesson_id !== "day1-foundation") {
      try {
        const pack = await runTypeScriptPipelineLive(mapping.lesson_id, mapping.title);
        return {
          pack,
          job: { mode: "typescript_pipeline_live", note: "Đã chạy pipeline grounded trên artifact của buổi đang chọn." },
          lesson_mapping: mapping,
        };
      } catch (error) {
        const reason = error instanceof Error ? error.message : "TypeScript pipeline failed";
        const pack = await buildOfflineGroundedPack(mapping.lesson_id, mapping.title, reason);
        return {
          pack,
          job: {
            mode: "typescript_pipeline_live",
            note: `AI live chưa trả được kết quả hoàn chỉnh (${friendlyPipelineReason(reason)}). Đã tạo offline grounded fallback từ slide để demo tiếp.`,
          },
          lesson_mapping: mapping,
        };
      }
    }
    const env = { ...process.env };
    try {
      const { stdout } = await execFileAsync("bash", ["run_all.sh"], {
        cwd: PIPELINE_DIR,
        env,
        timeout: 180_000,
        maxBuffer: 1024 * 1024 * 8,
      });
      return { pack: await readReviewPack(mapping.lesson_id), job: { mode: "pipeline", stdout }, lesson_mapping: mapping };
    } catch (bashError) {
      // execFile("bash", ["run_all.sh"]) doi hoi bash + python3 + pdftotext trong PATH cua
      // runtime — co that tren may dev/self-host, nhung KHONG co tren Vercel serverless
      // (khong co Python). Thay vi lang le fallback ve artifact tinh (san pham lai khong nhan
      // duoc input moi khi deploy — dung van de nguoi dung da bao), thu chay lai dung 2 loi
      // goi AI that bang TypeScript (goi thang DeepSeek qua fetch, khong can shell/Python).
      try {
        const pack = await runTypeScriptPipelineLive(mapping.lesson_id, mapping.title);
        return {
          pack,
          job: {
            mode: "typescript_pipeline_live",
            note: "bash run_all.sh khong chay duoc trong moi truong nay (thieu Python/pdftotext) — da chay lai bang TypeScript, goi DeepSeek that qua fetch.",
          },
          lesson_mapping: mapping,
        };
      } catch (tsError) {
        const bashFailed = bashError as { message?: string; stdout?: string; stderr?: string };
        const tsFailed = tsError as { message?: string };
        const reason = `bash: ${bashFailed.message || "unknown"} | typescript: ${tsFailed.message || "unknown"}`;
        const fallbackPack = await buildOfflineGroundedPack(mapping.lesson_id, mapping.title, reason).catch(async () => readReviewPack(mapping.lesson_id));
        return {
          pack: fallbackPack,
          job: {
            mode: "pipeline_failed_fallback",
            error: reason,
            stdout: bashFailed.stdout,
            stderr: bashFailed.stderr,
          },
          lesson_mapping: mapping,
        };
      }
    }
  }

  return {
    pack: await readReviewPack(mapping.lesson_id),
    job: { mode: "existing_artifact" },
    lesson_mapping: mapping,
  };
}

export async function updateReviewPackItem(
  packId: string,
  itemId: string,
  input: UpdateReviewItemInput,
): Promise<ReviewPack> {
  const lessonId = packId.replace(/^pack-/, "").replace(/-\d+$/, "");
  const pack = await readReviewPack(lessonId);
  if (pack.pack_id !== packId) throw new Error("Pack id does not match stored artifact");

  const item = findItem(pack, itemId);
  if (!item) throw new Error(`Unknown item_id: ${itemId}`);

  if (input.action === "approve") {
    if (item.status === "ready") return pack;
    item.status = "ready";
  } else if (input.action === "drop") {
    item.status = "needs_review";
  } else if (input.action === "edit") {
    if ("title" in item && typeof input.title === "string") item.title = input.title.trim() || item.title;
    if ("content" in item && typeof input.content === "string") item.content = input.content.trim() || item.content;
    if (Array.isArray(input.source_pages) && input.source_pages.length > 0) item.source_pages = input.source_pages;
    if (typeof input.source_excerpt === "string") item.source_excerpt = input.source_excerpt.trim() || item.source_excerpt;
    if (input.status === "ready" || input.status === "needs_review") item.status = input.status;
  } else {
    throw new Error("Invalid action");
  }

  pack.warnings = pack.warnings
    .map((warning) => ({ ...warning, item_ids: warning.item_ids.filter((id) => id !== itemId) }))
    .filter((warning) => warning.item_ids.length > 0);
  recomputePackStatus(pack);
  await writeReviewPack(pack);
  return pack;
}

export async function addSummaryItem(packId: string, input: Partial<SummaryItem>): Promise<ReviewPack> {
  const lessonId = packId.replace(/^pack-/, "").replace(/-\d+$/, "");
  const pack = await readReviewPack(lessonId);
  if (pack.pack_id !== packId) throw new Error("Pack id does not match stored artifact");
  const nextNumber = pack.summary.length + 1;
  const item: SummaryItem = {
    id: `summary-${String(nextNumber).padStart(2, "0")}`,
    title: input.title?.trim() || "Nội dung trọng tâm mới",
    content: input.content?.trim() || "Lab Coach nhập nội dung trọng tâm tại đây.",
    source_pages: input.source_pages && input.source_pages.length > 0 ? input.source_pages : [1],
    source_excerpt: input.source_excerpt?.trim() || "Lab Coach thêm trích dẫn hoặc ghi chú nguồn từ slide.",
    confidence: typeof input.confidence === "number" ? input.confidence : 0.9,
    status: input.status || "needs_review",
  };
  pack.summary.push(item);
  recomputePackStatus(pack);
  await writeReviewPack(pack);
  return pack;
}

export async function uploadLessonFromForm(form: FormData): Promise<{ lesson: UploadedLesson; pack: ReviewPack }> {
  const title = String(form.get("title") || "").trim() || "Buổi học mới";
  const slide = form.get("slide_pdf");
  const chatlog = form.get("chatlog_csv");
  if (!isFormFile(slide) || !isFormFile(chatlog)) {
    throw new Error("Missing slide_pdf or chatlog_csv");
  }
  const maxSlideBytes = 25 * 1024 * 1024;
  const maxChatlogBytes = 10 * 1024 * 1024;
  if (slide.size <= 0 || slide.size > maxSlideBytes) throw new Error("Slide PDF phải lớn hơn 0 và không quá 25MB");
  if (chatlog.size <= 0 || chatlog.size > maxChatlogBytes) throw new Error("Chatlog CSV phải lớn hơn 0 và không quá 10MB");
  if (slide.type && slide.type !== "application/pdf") throw new Error("Slide upload phải là PDF");
  if (chatlog.type && !["text/csv", "application/vnd.ms-excel", "application/octet-stream"].includes(chatlog.type)) {
    throw new Error("Chatlog upload phải là CSV");
  }

  const db = await readLocalDb();
  const idBase = `upload-${slugify(title)}`;
  let lessonId = idBase;
  let suffix = 2;
  while (db.uploaded_lessons.some((item) => item.lesson_id === lessonId) || lessonId === "day1-foundation") {
    lessonId = `${idBase}-${suffix}`;
    suffix += 1;
  }

  const dir = path.join(UPLOADS_DIR, lessonId);
  await mkdir(dir, { recursive: true });
  const slidePath = path.join(dir, "slide.pdf");
  const chatlogPath = path.join(dir, "chatlog.csv");
  await writeFile(slidePath, Buffer.from(await slide.arrayBuffer()));
  await writeFile(chatlogPath, Buffer.from(await chatlog.arrayBuffer()));
  const maxPage = await detectPdfPageCount(slidePath);
  const now = new Date().toISOString();
  const lesson: UploadedLesson = {
    lesson_id: lessonId,
    title,
    slide_pdf: slidePath,
    chatlog_csv: chatlogPath,
    day_codes: String(form.get("day_codes") || "").split(",").map((item) => item.trim()).filter(Boolean),
    max_page: maxPage,
    mapping_signals: ["Uploaded by Lab Coach", "Slide PDF + chatlog CSV stored locally"],
    source_type: "uploaded",
    created_at: now,
    updated_at: now,
  };

  await prepareUploadedArtifacts(lesson);
  const stats = {
    ...(await loadQuestionStats(lesson.lesson_id)),
    day_code_suggestions: await summarizeStudentDayCodes(chatlogPath),
  };

  db.uploaded_lessons.push(lesson);
  db.active_lesson_id = lesson.lesson_id;
  await writeLocalDb(db);

  const pack = buildEmptyUploadedPack(lesson, stats);
  await writeReviewPack(pack);
  return { lesson, pack };
}

export async function renameUploadedLesson(lessonId: string, title: string, maxPage?: number): Promise<UploadedLesson> {
  const db = await readLocalDb();
  const lesson = db.uploaded_lessons.find((item) => item.lesson_id === lessonId);
  if (!lesson) throw new Error("Uploaded lesson not found");
  lesson.title = title.trim() || lesson.title;
  if (maxPage && maxPage > 0) lesson.max_page = maxPage;
  lesson.updated_at = new Date().toISOString();
  await writeLocalDb(db);
  const pack = await readReviewPack(lessonId);
  pack.lesson.title = lesson.title;
  pack.lesson.slide_count = lesson.max_page;
  await writeReviewPack(pack);
  return lesson;
}

export async function deleteUploadedLesson(lessonId: string): Promise<void> {
  const db = await readLocalDb();
  const lesson = db.uploaded_lessons.find((item) => item.lesson_id === lessonId);
  if (!lesson && lessonId === "day1-foundation") throw new Error("Không thể xoá buổi demo mặc định Day 1.");
  if (lesson) {
    db.uploaded_lessons = db.uploaded_lessons.filter((item) => item.lesson_id !== lessonId);
  } else {
    db.hidden_lesson_ids = [...new Set([...(db.hidden_lesson_ids || []), lessonId])];
  }
  if (db.active_lesson_id === lessonId) db.active_lesson_id = "day1-foundation";
  await writeLocalDb(db);
  await rm(path.join(UPLOADS_DIR, lessonId), { recursive: true, force: true });
  await rm(getPackPath(lessonId), { force: true });
}

export async function exportReviewPackPdf(packId: string): Promise<{ bytes: Buffer; filename: string; path: string }> {
  const lessonId = packId.replace(/^pack-/, "").replace(/-\d+$/, "");
  const pack = await readReviewPack(lessonId);
  if (pack.pack_id !== packId) throw new Error("Pack id does not match stored artifact");

  const bytes = generateReviewPackPdf(pack);
  const outputPath = getPdfPath(packId);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, bytes);

  return { bytes, filename: `${packId}.pdf`, path: outputPath };
}

export async function listArtifacts(lessonId = "day1-foundation"): Promise<Record<string, string>> {
  return {
    slide: path.join(SHARED_DIR, `slide-${lessonId}.json`),
    questions: path.join(SHARED_DIR, `questions-${lessonId}.json`),
    clusters: path.join(SHARED_DIR, `clusters-${lessonId}.json`),
    generated: path.join(SHARED_DIR, `generated-${lessonId}.json`),
    review_pack: getPackPath(lessonId),
    eval_runs: EVAL_RUNS_DIR,
  };
}
