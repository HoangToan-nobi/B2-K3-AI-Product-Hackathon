export type ApprovalStatus = "ready" | "needs_review";
export type AppRole = "student" | "labcoach";

export interface Lesson {
  id: string;
  title: string;
  slide_count: number;
}

export interface Warning {
  code: string;
  message: string;
  item_ids: string[];
}

export interface SummaryItem {
  id: string;
  title: string;
  content: string;
  source_pages: number[];
  source_excerpt: string;
  confidence: number;
  status: ApprovalStatus;
}

export interface ClassInsight {
  id: string;
  topic: string;
  common_confusion: string;
  correct_understanding: string;
  source_pages: number[];
  source_excerpt: string;
  confidence: number;
  status: ApprovalStatus;
  unique_user_count: number;
  question_count: number;
  representative_questions: string[];
}

export interface ReviewQuestion {
  id: string;
  type: "multiple_choice";
  question: string;
  options: string[];
  correct_option: number;
  answer: string;
  explanation: string;
  source_pages: number[];
  source_excerpt: string;
  confidence: number;
  status: ApprovalStatus;
}

export type ReviewPackItem = SummaryItem | ClassInsight | ReviewQuestion;

export interface ReviewPack {
  schema_version: string;
  pack_id: string;
  status: ApprovalStatus;
  lesson: Lesson;
  analysis: {
    student_question_count: number;
    unique_user_count: number;
    cluster_count: number;
    included_cluster_count: number;
    excluded_noise_count: number;
  };
  summary: SummaryItem[];
  class_insights: ClassInsight[];
  review_questions: ReviewQuestion[];
  warnings: Warning[];
  generated_at: string;
}

export interface LessonMapping {
  lesson_id: string;
  title: string;
  slide_pdf: string;
  chatlog_csv: string;
  day_codes: string[];
  max_page: number;
  mapping_signals: string[];
}

export interface CreateReviewPackInput {
  lesson_id?: string;
  run_pipeline?: boolean;
}

export type ReviewPackJob =
  | { mode: "pipeline"; stdout?: string }
  | { mode: "existing_artifact" }
  | { mode: "pipeline_failed_fallback"; error: string; stdout?: string; stderr?: string };

export interface UpdateReviewItemInput {
  action: "approve" | "drop";
}

export interface LocalDbUser {
  id: string;
  name: string;
  role: AppRole;
}

export interface LocalDb {
  users: LocalDbUser[];
  active_lesson_id: string;
  published_pack_ids: string[];
}
