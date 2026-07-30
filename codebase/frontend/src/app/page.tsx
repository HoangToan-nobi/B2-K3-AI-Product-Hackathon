"use client";

import { useEffect, useMemo, useState } from "react";
import type { ClassInsight, ReviewPack, ReviewQuestion, SummaryItem } from "@/lib/review-packs/types";

type AppRole = "student" | "labcoach";

type LessonOption = {
  id: string;
  title: string;
  slide_count: number;
  pack_id: string;
  status: string;
};

type Notice = { tone: "error" | "success" | "info"; text: string };

function sourceLabel(pages: number[]): string {
  return `Trang ${pages.join(", ")}`;
}

function statusLabel(status: string): string {
  return status === "needs_review" ? "Cần duyệt" : "Sẵn sàng";
}

function explainPipelineError(job: { error?: string; stdout?: string; stderr?: string }): string {
  const detail = `${job.error || ""}\n${job.stdout || ""}\n${job.stderr || ""}`;
  if (detail.includes("pdftotext")) return "Thiếu pdftotext/Poppler trong PATH.";
  if (detail.includes("DEEPSEEK_API_KEY")) return "Thiếu DEEPSEEK_API_KEY trong codebase/pipeline/.env.";
  if (detail.includes("DeepSeek API")) return "DeepSeek API trả lỗi hoặc network không gọi được.";
  return "Pipeline thật lỗi, backend dùng artifact có sẵn.";
}

export default function Home() {
  const [role, setRole] = useState<AppRole>("student");
  const [view, setView] = useState("review");
  const [lessons, setLessons] = useState<LessonOption[]>([]);
  const [selectedLessonId, setSelectedLessonId] = useState("day1-foundation");
  const [pack, setPack] = useState<ReviewPack | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [processing, setProcessing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [expandedInsights, setExpandedInsights] = useState<string[]>([]);
  const [openQA, setOpenQA] = useState<string[]>([]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "light");
  }, []);

  useEffect(() => {
    fetch(`/api/review-packs?role=${role}`, { headers: { "x-vluoi-role": role } })
      .then((res) => res.json())
      .then((data: { lessons?: LessonOption[] }) => {
        const nextLessons = data.lessons || [];
        setLessons(nextLessons);
        if (nextLessons[0] && !nextLessons.some((lesson) => lesson.id === selectedLessonId)) {
          setSelectedLessonId(nextLessons[0].id);
        }
      })
      .catch(() => setNotice({ tone: "error", text: "Không tải được danh sách buổi học." }));
  }, [role, selectedLessonId]);

  useEffect(() => {
    const lesson = lessons.find((item) => item.id === selectedLessonId);
    if (!lesson) return;
    fetch(`/api/review-packs/${lesson.pack_id}?role=${role}`, { headers: { "x-vluoi-role": role } })
      .then((res) => {
        if (!res.ok) throw new Error("Cannot load pack");
        return res.json();
      })
      .then((data: { pack: ReviewPack }) => {
        setPack(data.pack);
        setExpandedInsights([]);
        setOpenQA([]);
      })
      .catch(() => setNotice({ tone: "error", text: "Không tải được gói ôn tập." }));
  }, [lessons, role, selectedLessonId]);

  const selectedLesson = lessons.find((lesson) => lesson.id === selectedLessonId);
  const topics = useMemo(() => {
    return [...(pack?.class_insights || [])].sort(
      (a, b) => b.unique_user_count - a.unique_user_count || b.question_count - a.question_count,
    );
  }, [pack]);
  const maxUsers = Math.max(1, ...topics.map((topic) => topic.unique_user_count));
  const readySummary = pack?.summary.filter((item) => item.status === "ready") || [];
  const readyInsights = pack?.class_insights.filter((item) => item.status === "ready") || [];
  const readyQuestions = pack?.review_questions.filter((item) => item.status === "ready") || [];
  const needsReviewCount = pack
    ? [...pack.summary, ...pack.class_insights, ...pack.review_questions].filter((item) => item.status === "needs_review").length
    : 0;

  const changeRole = (nextRole: AppRole) => {
    setRole(nextRole);
    setView(nextRole === "student" ? "review" : "dashboard");
    setNotice({ tone: "info", text: nextRole === "student" ? "Đang xem bằng quyền học viên." : "Đang xem bằng quyền Lab Coach." });
  };

  const handleGenerate = async (runPipeline = false) => {
    if (role !== "labcoach") return;
    setProcessing(true);
    setNotice(null);
    try {
      const res = await fetch("/api/review-packs", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-vluoi-role": role },
        body: JSON.stringify({ lesson_id: selectedLessonId, run_pipeline: runPipeline }),
      });
      if (!res.ok) throw new Error("create failed");
      const data = (await res.json()) as { pack: ReviewPack; job: { mode: string; error?: string; stdout?: string; stderr?: string } };
      setPack(data.pack);
      setNotice({
        tone: "success",
        text: data.job.mode === "pipeline"
          ? "Pipeline đã chạy lại và tạo review pack mới."
          : data.job.mode === "pipeline_failed_fallback"
            ? `${explainPipelineError(data.job)} Backend dùng artifact có sẵn để demo tiếp.`
            : "Đã tải review pack từ database local.",
      });
    } catch {
      setNotice({ tone: "error", text: "Không tạo được review pack. Kiểm tra API key hoặc artifact pipeline." });
    } finally {
      setProcessing(false);
    }
  };

  const updateItem = async (itemId: string, action: "approve" | "drop") => {
    if (!pack || role !== "labcoach") return;
    setNotice(null);
    try {
      const res = await fetch(`/api/review-packs/${pack.pack_id}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-vluoi-role": role },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error("patch failed");
      const data = (await res.json()) as { pack: ReviewPack };
      setPack(data.pack);
      setNotice({ tone: "success", text: action === "approve" ? "Đã duyệt mục này." : "Đã bỏ mục này khỏi bản phát hành." });
    } catch {
      setNotice({ tone: "error", text: "Không cập nhật được mục review." });
    }
  };

  const handleDownload = async () => {
    if (!pack || role !== "labcoach") return;
    setDownloading(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/review-packs/${pack.pack_id}/export-pdf`, {
        method: "POST",
        headers: { "x-vluoi-role": role },
      });
      if (!res.ok) throw new Error("download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${pack.pack_id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setNotice({ tone: "success", text: "Đã xuất PDF từ backend." });
    } catch {
      setNotice({ tone: "error", text: "Không xuất được PDF." });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sb-logo"><span className="dot" />VLười</div>
        <div className="sb-section-label">Vai trò</div>
        <div className="role-switch" role="group" aria-label="Chọn vai trò">
          <button type="button" className={role === "student" ? "active" : ""} onClick={() => changeRole("student")}>Học viên</button>
          <button type="button" className={role === "labcoach" ? "active" : ""} onClick={() => changeRole("labcoach")}>Lab Coach</button>
        </div>

        <div className="sb-section-label">Buổi học</div>
        <select className="lesson-select" value={selectedLessonId} onChange={(event) => setSelectedLessonId(event.target.value)}>
          {lessons.map((lesson) => (
            <option key={lesson.id} value={lesson.id}>{lesson.title}</option>
          ))}
        </select>

        <div className="sb-section-label">Điều hướng</div>
        <nav className="sb-nav" aria-label="Điều hướng chức năng">
          {role === "student" ? (
            <>
              <NavButton id="review" view={view} setView={setView} label="Ôn tập tổng hợp" count={readySummary.length + readyInsights.length} />
              <NavButton id="slides" view={view} setView={setView} label="Xem slide" count={selectedLesson?.slide_count || 0} />
            </>
          ) : (
            <>
              <NavButton id="dashboard" view={view} setView={setView} label="Canvas" count={pack?.analysis.cluster_count || 0} />
              <NavButton id="generate" view={view} setView={setView} label="Đề tài" count={selectedLesson?.slide_count || 0} />
              <NavButton id="tutor" view={view} setView={setView} label="AI Tutor" count={pack?.analysis.student_question_count || 0} />
              <NavButton id="blindspot" view={view} setView={setView} label="Blindspot" count={needsReviewCount} />
              <NavButton id="release" view={view} setView={setView} label="Phát hành" count={readyQuestions.length} />
            </>
          )}
        </nav>

        <div className="sb-spacer" />
        <div className="sb-user">
          <div className="avatar">{role === "student" ? "HV" : "LC"}</div>
          <div>
            <div className="name">{role === "student" ? "Học viên demo" : "Lab Coach demo"}</div>
            <div className="role">{role === "student" ? "Chỉ đọc nội dung đã duyệt" : "Quản trị review pack"}</div>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>{role === "student" ? "Không gian ôn tập" : "Lab Coach Console"}</h1>
            <p>{selectedLesson?.title || "Đang tải buổi học"}</p>
          </div>
          <div className={`status-pill ${pack?.status === "needs_review" ? "review" : "ready"}`}>
            {pack ? statusLabel(pack.status) : "Đang tải"}
          </div>
        </header>

        <div className="content">
          {notice && <div className={`notice notice-${notice.tone}`}>{notice.text}</div>}
          {role === "student" ? (
            <StudentWorkspace
              view={view}
              pack={pack}
              lesson={selectedLesson}
              readySummary={readySummary}
              readyInsights={readyInsights}
              readyQuestions={readyQuestions}
              selectedLessonId={selectedLessonId}
            />
          ) : (
            <LabCoachWorkspace
              view={view}
              pack={pack}
              topics={topics}
              maxUsers={maxUsers}
              needsReviewCount={needsReviewCount}
              processing={processing}
              downloading={downloading}
              expandedInsights={expandedInsights}
              openQA={openQA}
              setExpandedInsights={setExpandedInsights}
              setOpenQA={setOpenQA}
              handleGenerate={handleGenerate}
              handleDownload={handleDownload}
              updateItem={updateItem}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function NavButton({
  id,
  view,
  setView,
  label,
  count,
}: {
  id: string;
  view: string;
  setView: (view: string) => void;
  label: string;
  count: number;
}) {
  return (
    <button type="button" className={`sb-item ${view === id ? "active" : ""}`} onClick={() => setView(id)}>
      <span>{label}</span>
      <span className="count">{count}</span>
    </button>
  );
}

function StudentWorkspace({
  view,
  pack,
  lesson,
  readySummary,
  readyInsights,
  readyQuestions,
  selectedLessonId,
}: {
  view: string;
  pack: ReviewPack | null;
  lesson?: LessonOption;
  readySummary: SummaryItem[];
  readyInsights: ClassInsight[];
  readyQuestions: ReviewQuestion[];
  selectedLessonId: string;
}) {
  if (!pack) return <EmptyState title="Chưa có dữ liệu" text="Backend chưa trả được review pack cho buổi học này." />;

  if (view === "slides") {
    return (
      <section className="workspace">
        <PageHead title="Slide buổi học" text="Học viên chỉ xem tài liệu gốc và không có quyền chạy pipeline hoặc duyệt nội dung." />
        <div className="slide-frame">
          <iframe title={lesson?.title || "Slide"} src={`/api/lessons/${selectedLessonId}/slide`} />
        </div>
      </section>
    );
  }

  return (
    <section className="workspace">
      <PageHead
        title="Ôn tập tổng hợp"
        text="Bản dành cho học viên chỉ hiển thị nội dung đã sẵn sàng, có tham chiếu về trang slide gốc."
      />
      <div className="stat-row">
        <Stat value={pack.lesson.slide_count} label="slide nguồn" />
        <Stat value={readySummary.length} label="ý chính" />
        <Stat value={readyInsights.length} label="điểm cả lớp vướng" />
        <Stat value={readyQuestions.length} label="câu tự kiểm tra" />
      </div>

      <div className="section-label">Lý thuyết trọng tâm</div>
      {readySummary.map((item) => <StudySummary key={item.id} item={item} />)}

      <div className="section-label">Điểm cả lớp thường hỏi</div>
      {readyInsights.map((item) => <StudyInsight key={item.id} item={item} />)}

      <div className="section-label">Tự kiểm tra</div>
      {readyQuestions.map((item, index) => <StudyQuestion key={item.id} item={item} index={index} />)}
    </section>
  );
}

function LabCoachWorkspace({
  view,
  pack,
  topics,
  maxUsers,
  needsReviewCount,
  processing,
  downloading,
  expandedInsights,
  openQA,
  setExpandedInsights,
  setOpenQA,
  handleGenerate,
  handleDownload,
  updateItem,
}: {
  view: string;
  pack: ReviewPack | null;
  topics: ClassInsight[];
  maxUsers: number;
  needsReviewCount: number;
  processing: boolean;
  downloading: boolean;
  expandedInsights: string[];
  openQA: string[];
  setExpandedInsights: (value: string[] | ((prev: string[]) => string[])) => void;
  setOpenQA: (value: string[] | ((prev: string[]) => string[])) => void;
  handleGenerate: (runPipeline?: boolean) => void;
  handleDownload: () => void;
  updateItem: (itemId: string, action: "approve" | "drop") => void;
}) {
  if (!pack) return <EmptyState title="Chưa có dữ liệu" text="Tải review pack từ artifact hoặc chạy lại pipeline." />;

  if (view === "generate") {
    return (
      <section className="workspace">
        <PageHead title="Đề tài" text="Thiết lập dữ liệu đầu vào cho lát cắt VLười: slide là nguồn sự thật, chatlog là tín hiệu điểm khó." />
        <div className="action-panel">
          <div>
            <h3>{pack.lesson.title}</h3>
            <p>{pack.lesson.slide_count} slide, {pack.analysis.student_question_count} tin nhắn liên quan, {pack.analysis.unique_user_count} học viên đã ẩn danh.</p>
          </div>
          <div className="action-row">
            <button className="btn btn-primary" disabled={processing} onClick={() => handleGenerate(false)}>
              {processing ? "Đang tải..." : "Tải từ DB local"}
            </button>
            <button className="btn btn-ghost" disabled={processing} onClick={() => handleGenerate(true)}>
              Chạy lại AI
            </button>
          </div>
        </div>
        {processing && <div className="processing-box"><span className="spinner" />Backend đang chuẩn bị artifact và kiểm tra grounding.</div>}
      </section>
    );
  }

  if (view === "tutor") {
    return (
      <section className="workspace">
        <PageHead title="AI Tutor" text="Các cụm câu hỏi được mining từ chatlog đã ẩn danh và xếp hạng theo số học viên duy nhất." />
        <div className="section-label">Confusion cluster</div>
        {topics.map((topic) => (
          <div key={topic.id} className="topic-item">
            <button
              type="button"
              className="topic-main"
              onClick={() => setExpandedInsights((prev) => prev.includes(topic.id) ? prev.filter((id) => id !== topic.id) : [...prev, topic.id])}
            >
              <div className="topic-top">
                <div className="topic-name">{topic.topic}</div>
                <div className="topic-count">{topic.unique_user_count} học viên</div>
              </div>
              <div className="topic-bar-track">
                <div className="topic-bar-fill" style={{ width: `${Math.round((topic.unique_user_count / maxUsers) * 100)}%` }} />
              </div>
              <div className="topic-foot">
                <span>{topic.question_count} lượt hỏi</span>
                <span>{sourceLabel(topic.source_pages)} · {statusLabel(topic.status)}</span>
              </div>
            </button>
            {expandedInsights.includes(topic.id) && <RepresentativeQuestions topic={topic} />}
          </div>
        ))}
      </section>
    );
  }

  if (view === "blindspot") {
    return (
      <section className="workspace">
        <PageHead title="Blindspot" text="Lab Coach xử lý các mục có confidence thấp hoặc cần đối chiếu thêm trước khi phát hành cho học viên." />
        <div className="stat-row compact">
          <Stat value={needsReviewCount} label="mục cần duyệt" />
          <Stat value={pack.warnings.length} label="cảnh báo" />
          <Stat value={pack.analysis.excluded_noise_count} label="tin nhiễu đã loại" />
        </div>

        <div className="section-label">Lý thuyết trọng tâm</div>
        {pack.summary.map((item) => <SummaryCard key={item.id} item={item} onUpdate={updateItem} />)}

        <div className="section-label">Điểm cả lớp thường vướng</div>
        {pack.class_insights.map((item) => <InsightCard key={item.id} item={item} onUpdate={updateItem} />)}

        <div className="section-label">Câu hỏi tự kiểm tra</div>
        {pack.review_questions.map((item) => (
          <QuestionCard
            key={item.id}
            item={item}
            open={openQA.includes(item.id)}
            onToggle={() => setOpenQA((prev) => prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id])}
            onUpdate={updateItem}
          />
        ))}
      </section>
    );
  }

  if (view === "release") {
    return (
      <section className="workspace">
        <PageHead title="Phát hành" text="Bản preview chỉ dùng nội dung đang sẵn sàng; mục cần duyệt không được phát hành cho học viên." />
        <PdfPreview pack={pack} />
        <div className="footer-actions">
          <button className="btn btn-primary" disabled={downloading} onClick={handleDownload}>
            {downloading ? "Đang xuất..." : "Tải PDF"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="workspace">
      <PageHead title="Canvas" text="Tổng quan theo đúng đề tài VLười: slide chính thức, chatlog ẩn danh, review pack có grounding và trạng thái duyệt." />
      <div className="stat-row">
        <Stat value={pack.lesson.slide_count} label="slide đã quét" />
        <Stat value={pack.analysis.student_question_count} label="tin nhắn liên quan" />
        <Stat value={pack.analysis.unique_user_count} label="học viên duy nhất" />
        <Stat value={pack.analysis.cluster_count} label="cluster" />
      </div>
      {pack.warnings.length > 0 && (
        <div className="warning-list">
          {pack.warnings.map((warning) => (
            <div key={warning.message} className="warning-banner">
              <p><strong>Cần chú ý.</strong> {warning.message}</p>
            </div>
          ))}
        </div>
      )}
      <div className="canvas-grid">
        <CanvasCard title="Pain point" text="Học viên không muốn đọc lại toàn bộ slide dài, còn câu hỏi thật của lớp đang nằm rải rác trong chatlog." />
        <CanvasCard title="Nguồn sự thật" text="Slide là cơ sở kiến thức chính thức. Chatlog chỉ dùng để phát hiện chủ đề khó và câu hỏi lặp lại." />
        <CanvasCard title="Quyết định AI" text="Lọc noise, nhóm câu hỏi, xếp hạng blindspot và sinh nội dung có tham chiếu về trang slide." />
        <CanvasCard title="Kết quả" text="Một gói ôn tập ngắn gồm lý thuyết trọng tâm, điểm dễ nhầm và câu tự kiểm tra." />
      </div>
    </section>
  );
}

function PageHead({ title, text }: { title: string; text: string }) {
  return (
    <div className="page-head">
      <div>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return <div className="stat-card"><div className="stat-value">{value}</div><div className="stat-label">{label}</div></div>;
}

function CanvasCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="canvas-card">
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function Evidence({ pages, excerpt }: { pages: number[]; excerpt: string }) {
  return (
    <details className="evidence-box">
      <summary>{sourceLabel(pages)}</summary>
      <p>{excerpt}</p>
    </details>
  );
}

function StudySummary({ item }: { item: SummaryItem }) {
  return (
    <article className="study-card">
      <div className="study-card-head">
        <h3>{item.title}</h3>
        <span>{sourceLabel(item.source_pages)}</span>
      </div>
      <p>{item.content}</p>
    </article>
  );
}

function StudyInsight({ item }: { item: ClassInsight }) {
  return (
    <article className="study-card accent">
      <div className="study-card-head">
        <h3>{item.topic}</h3>
        <span>{item.unique_user_count} học viên</span>
      </div>
      <p><strong>Điểm dễ vướng:</strong> {item.common_confusion}</p>
      <p><strong>Cách hiểu đúng:</strong> {item.correct_understanding}</p>
      <div className="study-questions">
        {item.representative_questions.slice(0, 2).map((question, index) => (
          <span key={`${item.id}-${index}`}>{question}</span>
        ))}
      </div>
    </article>
  );
}

function StudyQuestion({ item, index }: { item: ReviewQuestion; index: number }) {
  return (
    <details className="study-question">
      <summary>{index + 1}. {item.question}</summary>
      <p><strong>Đáp án:</strong> {item.answer}</p>
      <p>{item.explanation}</p>
    </details>
  );
}

function ReviewActions({ item, onUpdate }: { item: { id: string; status: string }; onUpdate: (itemId: string, action: "approve" | "drop") => void }) {
  if (item.status !== "needs_review") return <span className="chip chip-ready">Sẵn sàng</span>;
  return (
    <div className="review-actions">
      <button type="button" className="btn btn-primary btn-sm" onClick={() => onUpdate(item.id, "approve")}>Duyệt</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onUpdate(item.id, "drop")}>Bỏ khỏi PDF</button>
    </div>
  );
}

function SummaryCard({ item, onUpdate }: { item: SummaryItem; onUpdate: (itemId: string, action: "approve" | "drop") => void }) {
  return (
    <div className={`content-card ${item.status === "needs_review" ? "needs-review" : ""}`}>
      <div className="content-card-head">
        <h4>{item.title}</h4>
        <span className={`chip ${item.status === "ready" ? "chip-ready" : "chip-review"}`}>{statusLabel(item.status)}</span>
      </div>
      <p>{item.content}</p>
      <Evidence pages={item.source_pages} excerpt={item.source_excerpt} />
      <ReviewActions item={item} onUpdate={onUpdate} />
    </div>
  );
}

function InsightCard({ item, onUpdate }: { item: ClassInsight; onUpdate: (itemId: string, action: "approve" | "drop") => void }) {
  return (
    <div className={`content-card insight-card ${item.status === "needs_review" ? "needs-review" : ""}`}>
      <div className="content-card-head">
        <h4>{item.topic}</h4>
        <span className={`chip ${item.status === "ready" ? "chip-ready" : "chip-review"}`}>{statusLabel(item.status)}</span>
      </div>
      <p><strong>Điểm vướng:</strong> {item.common_confusion}</p>
      <p><strong>Cách hiểu đúng:</strong> {item.correct_understanding}</p>
      <div className="content-card-foot">
        <span className="chip chip-evidence">{item.unique_user_count} học viên · {item.question_count} lượt</span>
      </div>
      <RepresentativeQuestions topic={item} compact />
      <Evidence pages={item.source_pages} excerpt={item.source_excerpt} />
      <ReviewActions item={item} onUpdate={onUpdate} />
    </div>
  );
}

function RepresentativeQuestions({ topic, compact = false }: { topic: ClassInsight; compact?: boolean }) {
  return (
    <div className={compact ? "representative compact" : "representative"}>
      {topic.representative_questions.slice(0, compact ? 3 : 5).map((question, index) => (
        <p key={`${topic.id}-${index}`}>“{question}”</p>
      ))}
    </div>
  );
}

function QuestionCard({
  item,
  open,
  onToggle,
  onUpdate,
}: {
  item: ReviewQuestion;
  open: boolean;
  onToggle: () => void;
  onUpdate: (itemId: string, action: "approve" | "drop") => void;
}) {
  return (
    <div className={`qa-item ${open ? "open" : ""} ${item.status === "needs_review" ? "needs-review" : ""}`}>
      <button type="button" className="qa-question" onClick={onToggle}>
        <span>{item.question}</span>
        <span className="arrow">▾</span>
      </button>
      <div className="qa-answer">
        <div className="qa-answer-inner">
          <p><strong>Đáp án:</strong> {item.answer}</p>
          <p>{item.explanation}</p>
          <Evidence pages={item.source_pages} excerpt={item.source_excerpt} />
          <ReviewActions item={item} onUpdate={onUpdate} />
        </div>
      </div>
    </div>
  );
}

function PdfPreview({ pack }: { pack: ReviewPack }) {
  const hasFlagged = [...pack.summary, ...pack.class_insights, ...pack.review_questions].some((item) => item.status === "needs_review");
  return (
    <article className="pdf-sheet">
      <div className="pdf-header">
        <div className="mark">VLười — Gói Ôn Tập</div>
        <div className="meta">Nguồn: slide + chatlog ẩn danh<br />Pack: {pack.pack_id}</div>
      </div>
      <div className="pdf-h1">{pack.lesson.title}</div>
      <div className="pdf-sub">{pack.lesson.slide_count} slide · {pack.analysis.unique_user_count} học viên hỏi · {pack.analysis.cluster_count} cluster</div>

      <PdfBlock title="Lý thuyết trọng tâm" items={pack.summary.filter((item) => item.status === "ready").map((item) => `${item.title}. ${item.content} [${sourceLabel(item.source_pages)}]`)} />
      <PdfBlock title="Cả lớp thường hỏi" items={pack.class_insights.filter((item) => item.status === "ready").map((item) => `${item.topic}. ${item.correct_understanding} [${sourceLabel(item.source_pages)}]`)} />
      <PdfBlock title="Câu hỏi tự kiểm tra" items={pack.review_questions.filter((item) => item.status === "ready").map((item, index) => `${index + 1}. ${item.question} Đáp án: ${item.answer}.`)} />
      {hasFlagged && <div className="disclaimer">Một số nội dung đang chờ Lab Coach duyệt nên chưa phát hành như kiến thức chính thức.</div>}
    </article>
  );
}

function PdfBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="pdf-block">
      <h5>{title}</h5>
      {items.map((item, index) => <p key={`${title}-${index}`}>{item}</p>)}
    </div>
  );
}
