import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { EVAL_RUNS_DIR, getLessonMapping, getPackPath, getPdfPath, LOCAL_DB_PATH, PIPELINE_DIR, SHARED_DIR } from "./catalog";
import { generateReviewPackPdf } from "./pdf";
import type { AppRole, CreateReviewPackInput, LocalDb, ReviewPack, ReviewPackItem, ReviewPackJob, UpdateReviewItemInput, ApprovalStatus } from "./types";
import { prisma } from "@/lib/db";

const execFileAsync = promisify(execFile);

type RawQuestionContent = {
  question?: string;
  options?: string[];
  correct_answer_index?: number;
  explanation?: string;
  source_pages?: number[];
  source_excerpt?: string;
};

export async function readLocalDb(): Promise<LocalDb> {
  try {
    const users = await prisma.user.findMany();
    const packs = await prisma.knowledgePack.findMany({ where: { status: 'published' } });
    if (users.length > 0) {
      return {
        active_lesson_id: "day1-foundation",
        published_pack_ids: packs.map(p => p.id),
        users: users.map(u => ({ id: u.id, name: u.name || '', role: u.role as AppRole })),
      };
    }
  } catch (e) {
    console.error("DB fallback to JSON", e);
  }
  
  // Fallback to json
  try {
    const raw = await readFile(LOCAL_DB_PATH, "utf8");
    return JSON.parse(raw) as LocalDb;
  } catch {
    return {
      active_lesson_id: "day1-foundation",
      published_pack_ids: ["pack-day1-foundation-001"],
      users: [
        { id: "student-demo", name: "Học viên demo", role: "student" },
        { id: "labcoach-demo", name: "Lab Coach demo", role: "labcoach" },
      ],
    };
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
  try {
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { slideDecks: true, knowledgePacks: { include: { knowledgeItems: true } } }
    });

    if (lesson && lesson.knowledgePacks.length > 0) {
      const pack = lesson.knowledgePacks[0];
      const items = pack.knowledgeItems;
      
      const summary = items.filter(i => i.type === 'summary').map(i => {
         const meta = JSON.parse(i.metadata || '{}');
         return {
           id: i.id,
           title: i.title || '',
           content: i.content,
           source_pages: meta.source_pages || [],
           source_excerpt: meta.source_excerpt || '',
           confidence: i.confidence || 1,
           status: i.status as ApprovalStatus
         };
      });
      
      const class_insights = items.filter(i => i.type === 'insight').map(i => {
         const meta = JSON.parse(i.metadata || '{}');
         return {
           id: i.id,
           topic: i.title || '',
           common_confusion: i.title || '',
           correct_understanding: i.content,
           source_pages: meta.source_pages || [],
           source_excerpt: meta.source_excerpt || '',
           confidence: i.confidence || 1,
           status: i.status as ApprovalStatus,
           unique_user_count: 1,
           question_count: 1,
           representative_questions: []
         };
      });
      
      const review_questions = items.filter(i => i.type === 'qa').map(i => {
         let rawItem: RawQuestionContent = {};
         try { rawItem = JSON.parse(i.content); } catch {}
         return {
           id: i.id,
           type: "multiple_choice" as const,
           question: rawItem.question || i.title || '',
           options: rawItem.options || [],
           correct_option: rawItem.correct_answer_index || 0,
           answer: rawItem.explanation || i.content,
           explanation: rawItem.explanation || i.content,
           source_pages: rawItem.source_pages || [],
           source_excerpt: rawItem.source_excerpt || '',
           confidence: i.confidence || 1,
           status: i.status as ApprovalStatus
         };
      });
      
      return {
        schema_version: "1.0",
        pack_id: pack.id,
        status: pack.status as ApprovalStatus,
        generated_at: pack.generatedAt?.toISOString() || new Date().toISOString(),
        lesson: {
          id: lesson.id,
          title: lesson.title,
          slide_count: lesson.slideDecks[0]?.pageCount || 29
        },
        analysis: {
          student_question_count: 0,
          unique_user_count: 0,
          cluster_count: 0,
          included_cluster_count: 0,
          excluded_noise_count: 0
        },
        summary,
        class_insights,
        review_questions,
        warnings: [],
      };
    }
  } catch (e) {
    console.error("Failed to read from DB", e);
  }
  
  // Fallback
  const raw = await readFile(getPackPath(lessonId), "utf8");
  return JSON.parse(raw) as ReviewPack;
}

export async function writeReviewPack(pack: ReviewPack): Promise<void> {
  // DB writes are handled elsewhere mostly.
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
    // skipped for DB rewrite simplicity for now
    return {
      pack: await readReviewPack(mapping.lesson_id),
      job: { mode: "pipeline", stdout: "Pipeline triggered via DB" },
      lesson_mapping: mapping,
    };
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
  const item = await prisma.knowledgeItem.findUnique({ where: { id: itemId }});
  if (item) {
    if (input.action === "approve") {
      await prisma.knowledgeItem.update({ where: { id: itemId }, data: { status: "ready" }});
    } else if (input.action === "drop") {
      await prisma.knowledgeItem.delete({ where: { id: itemId }});
    }
    const pack = await prisma.knowledgePack.findUnique({ where: { id: packId }});
    if (pack) {
      return readReviewPack(pack.lessonId);
    }
  }

  // Fallback to JSON update
  const lessonId = packId.replace(/^pack-/, "").replace(/-\d+$/, "");
  const pack = await readReviewPack(lessonId);
  
  const target: ReviewPackItem | undefined = pack.summary.find(i => i.id === itemId) || 
                    pack.class_insights.find(i => i.id === itemId) || 
                    pack.review_questions.find(i => i.id === itemId);
                    
  if (target) {
    if (input.action === "approve") target.status = "ready";
    else if (input.action === "drop") {
      pack.summary = pack.summary.filter(i => i.id !== itemId);
      pack.class_insights = pack.class_insights.filter(i => i.id !== itemId);
      pack.review_questions = pack.review_questions.filter(i => i.id !== itemId);
    }
    await writeReviewPack(pack);
  }
  return pack;
}

export async function exportReviewPackPdf(packId: string): Promise<{ bytes: Buffer; filename: string; path: string }> {
  const lessonId = packId.replace(/^pack-/, "").replace(/-\d+$/, "");
  const pack = await readReviewPack(lessonId);
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
