import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { EVAL_RUNS_DIR, getLessonMapping, getPackPath, getPdfPath, LOCAL_DB_PATH, PIPELINE_DIR, SHARED_DIR } from "./catalog";
import { generateReviewPackPdf } from "./pdf";
import type { AppRole, CreateReviewPackInput, LocalDb, ReviewPack, ReviewPackItem, ReviewPackJob, UpdateReviewItemInput } from "./types";

const execFileAsync = promisify(execFile);

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

function defaultLocalDb(): LocalDb {
  return {
    active_lesson_id: "day1-foundation",
    published_pack_ids: ["pack-day1-foundation-001"],
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
  lesson_mapping: ReturnType<typeof getLessonMapping>;
}> {
  const db = await readLocalDb();
  const mapping = getLessonMapping(input.lesson_id || db.active_lesson_id);

  if (input.run_pipeline) {
    const env = { ...process.env };
    try {
      const { stdout } = await execFileAsync("bash", ["run_all.sh"], {
        cwd: PIPELINE_DIR,
        env,
        timeout: 180_000,
        maxBuffer: 1024 * 1024 * 8,
      });
      return { pack: await readReviewPack(mapping.lesson_id), job: { mode: "pipeline", stdout }, lesson_mapping: mapping };
    } catch (error) {
      const fallbackPack = await readReviewPack(mapping.lesson_id);
      const failed = error as { message?: string; stdout?: string; stderr?: string };
      return {
        pack: fallbackPack,
        job: {
          mode: "pipeline_failed_fallback",
          error: failed.message || "Pipeline failed",
          stdout: failed.stdout,
          stderr: failed.stderr,
        },
        lesson_mapping: mapping,
      };
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
    pack.summary = pack.summary.filter((entry) => entry.id !== itemId);
    pack.class_insights = pack.class_insights.filter((entry) => entry.id !== itemId);
    pack.review_questions = pack.review_questions.filter((entry) => entry.id !== itemId);
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
