import path from "node:path";
import type { LessonMapping } from "./types";

export const SHARED_DIR = path.resolve(process.cwd(), "..", "shared");
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
