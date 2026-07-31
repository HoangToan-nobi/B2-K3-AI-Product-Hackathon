import path from "node:path";
import type { LessonMapping } from "./types";

export const SHARED_DIR = path.resolve(process.cwd(), "..", "shared");
export const UPLOADS_DIR = path.join(SHARED_DIR, "uploads");
export const PIPELINE_DIR = path.resolve(process.cwd(), "..", "pipeline");
export const EVAL_RUNS_DIR = path.resolve(process.cwd(), "..", "..", "eval", "runs");
export const LOCAL_DB_PATH = path.join(SHARED_DIR, "local-db.json");

export const LESSON_MAPPINGS: Record<string, LessonMapping> = {
  "day1-foundation": {
    lesson_id: "day1-foundation",
    title: "AI & LLM Foundation (Day 1)",
    slide_pdf: path.resolve(process.cwd(), "..", "..", "data", "vlearn-pack", "slides", "d1-slide-hackathon.pdf"),
    chatlog_csv: path.resolve(
      process.cwd(),
      "..",
      "..",
      "data",
      "vlearn-pack",
      "chatlog",
      "chat_history_anonymized_for_hackathon.csv",
    ),
    day_codes: ["Day 1", "Day1-C302"],
    max_page: 29,
    mapping_signals: [
      "day_code in Day 1 or Day1-C302",
      "page reference between 1 and 29",
      "slide keywords: token, attention, transformer, context, temperature",
    ],
  },
  "upload-day-2-ai-in-action": {
    lesson_id: "upload-day-2-ai-in-action",
    title: "Day 2 - AI In Action",
    slide_pdf: path.resolve(process.cwd(), "..", "..", "data", "vlearn-pack", "slides", "d2-slide-hackathon.pdf"),
    chatlog_csv: path.join(UPLOADS_DIR, "upload-day-2-ai-in-action", "chatlog.csv"),
    day_codes: ["day02-c301"],
    max_page: 29,
    mapping_signals: [
      "demo Day 2 artifact",
      "day_code day02-c301",
      "slide keywords: AI in action, product discovery, workflow, evaluation",
    ],
  },
};

export function getLessonMapping(lessonId = "day1-foundation"): LessonMapping {
  const mapping = LESSON_MAPPINGS[lessonId];
  if (!mapping) {
    throw new Error(`Unknown lesson_id: ${lessonId}`);
  }
  return mapping;
}

export function getPackPath(lessonId = "day1-foundation"): string {
  return path.join(SHARED_DIR, `review-pack-${lessonId}.json`);
}

export function getPdfPath(packId: string): string {
  return path.join(SHARED_DIR, "exports", `${packId}.pdf`);
}
