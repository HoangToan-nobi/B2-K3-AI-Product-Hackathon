"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { ClassInsight, ReviewPack, ReviewQuestion, SummaryItem } from "@/lib/review-packs/types";

type AppRole = "student" | "labcoach";
type Screen = "home" | "course" | "reader";
type CoachAction = "menu" | "summary" | "review" | "preview";
type Notice = { tone: "error" | "success" | "info"; text: string };

type LessonOption = {
  id: string;
  title: string;
  slide_count: number;
  pack_id: string;
  status: "ready" | "needs_review" | "missing" | string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: string;
};

const starterChat: ChatMessage[] = [
  {
    id: "hello",
    role: "assistant",
    content: "Em đang theo ngữ cảnh slide này. Rin-chan có thể hỏi trực tiếp hoặc chọn phạm vi toàn bộ ngày học.",
  },
];

function sourceLabel(pages: number[]): string {
  return pages.length ? `Slide ${pages.join(", ")}` : "Theo deck";
}

function statusLabel(status: string): string {
  if (status === "missing") return "Chưa có tài liệu";
  return status === "needs_review" ? "Cần duyệt" : "Đã có tài liệu";
}

function dayNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}

export default function Home() {
  const [role, setRole] = useState<AppRole>("student");
  const [screen, setScreen] = useState<Screen>("home");
  const [coachAction, setCoachAction] = useState<CoachAction>("menu");
  const [lessons, setLessons] = useState<LessonOption[]>([]);
  const [selectedLessonId, setSelectedLessonId] = useState("");
  const [openLessonId, setOpenLessonId] = useState("");
  const [pack, setPack] = useState<ReviewPack | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loadingLessons, setLoadingLessons] = useState(true);
  const [loadingPack, setLoadingPack] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [catalogVersion, setCatalogVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) setLoadingLessons(true);
    });
    fetch(`/api/review-packs?role=${role}`, { headers: { "x-vluoi-role": role } })
      .then(async (res) => {
        if (!res.ok) throw new Error("Cannot load lessons");
        return (await res.json()) as { lessons?: LessonOption[] };
      })
      .then((data) => {
        if (cancelled) return;
        const nextLessons = data.lessons || [];
        setLessons(nextLessons);
        const nextSelected = selectedLessonId && nextLessons.some((lesson) => lesson.id === selectedLessonId)
          ? selectedLessonId
          : nextLessons[0]?.id || "";
        setSelectedLessonId(nextSelected);
        setOpenLessonId((prev) => prev || nextSelected);
      })
      .catch(() => setNotice({ tone: "error", text: "Không tải được danh sách ngày học từ backend." }))
      .finally(() => {
        if (!cancelled) setLoadingLessons(false);
      });
    return () => {
      cancelled = true;
    };
  }, [role, selectedLessonId, catalogVersion]);

  const selectedLesson = lessons.find((lesson) => lesson.id === selectedLessonId);
  const selectedPackId = selectedLesson?.pack_id;

  useEffect(() => {
    if (!selectedPackId || selectedLesson?.status === "missing") {
      Promise.resolve().then(() => setPack(null));
      return;
    }
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) setLoadingPack(true);
    });
    fetch(`/api/review-packs/${selectedPackId}?role=${role}`, { headers: { "x-vluoi-role": role } })
      .then(async (res) => {
        if (res.status === 404) return null;
        if (!res.ok) throw new Error("Cannot load pack");
        return (await res.json()) as { pack: ReviewPack };
      })
      .then((data) => {
        if (!cancelled) setPack(data?.pack || null);
      })
      .catch(() => {
        if (!cancelled) setNotice({ tone: "error", text: "Không tải được tài liệu tổng hợp." });
      })
      .finally(() => {
        if (!cancelled) setLoadingPack(false);
      });
    return () => {
      cancelled = true;
    };
  }, [role, selectedPackId, selectedLesson?.status]);

  const progress = useMemo(() => {
    if (!lessons.length) return 0;
    return Math.round((lessons.filter((lesson) => lesson.status !== "missing").length / lessons.length) * 100);
  }, [lessons]);

  const readySummary = pack?.summary.filter((item) => item.status === "ready") || [];
  const readyInsights = pack?.class_insights.filter((item) => item.status === "ready") || [];
  const readyQuestions = pack?.review_questions.filter((item) => item.status === "ready") || [];
  const needsReviewCount = pack
    ? [...pack.summary, ...pack.class_insights, ...pack.review_questions].filter((item) => item.status === "needs_review").length
    : 0;
  const sortedInsights = useMemo(
    () => [...(pack?.class_insights || [])].sort((a, b) => b.question_count - a.question_count),
    [pack],
  );

  const selectDay = (lessonId: string) => {
    setSelectedLessonId(lessonId);
    setOpenLessonId((prev) => (prev === lessonId ? "" : lessonId));
    setCoachAction("menu");
  };

  const openReader = (lessonId: string) => {
    setSelectedLessonId(lessonId);
    setScreen("reader");
    setCoachAction("menu");
  };

  const openCoachSummary = (lessonId: string) => {
    setSelectedLessonId(lessonId);
    setScreen("course");
    setCoachAction("summary");
  };

  const generatePack = async () => {
    if (!selectedLesson || role !== "labcoach") return;
    setProcessing(true);
    setNotice({ tone: "info", text: "Backend đang tổng hợp slide, transcript và các câu hỏi hay gặp." });
    try {
      const res = await fetch("/api/review-packs", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-vluoi-role": role },
        body: JSON.stringify({ lesson_id: selectedLesson.id, run_pipeline: true }),
      });
      if (!res.ok) throw new Error("create failed");
      const data = (await res.json()) as { pack: ReviewPack; job: { mode: string } };
      setPack(data.pack);
      setCatalogVersion((value) => value + 1);
      setCoachAction(data.pack.warnings.length ? "review" : "preview");
      setNotice({
        tone: data.job.mode === "ai_generated" ? "success" : "info",
        text: data.job.mode === "ai_generated" ? "Đã tạo bản tổng hợp. Các mục ngoài slide cần Lab Coach duyệt." : "Đã tạo bản fallback để Lab Coach kiểm tra.",
      });
    } catch {
      setNotice({ tone: "error", text: "Không tạo được tài liệu tổng hợp. Hãy kiểm tra FastAPI hoặc API key." });
    } finally {
      setProcessing(false);
    }
  };

  const updateItem = async (itemId: string, action: "approve" | "drop") => {
    if (!pack || role !== "labcoach") return;
    try {
      const res = await fetch(`/api/review-packs/${pack.pack_id}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-vluoi-role": role },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error("patch failed");
      const data = (await res.json()) as { pack: ReviewPack };
      setPack(data.pack);
      setNotice({ tone: "success", text: action === "approve" ? "Đã duyệt nội dung." : "Đã bỏ nội dung khỏi tài liệu." });
    } catch {
      setNotice({ tone: "error", text: "Không cập nhật được nội dung cần duyệt." });
    }
  };

  const downloadPdf = async () => {
    if (!pack) return;
    setDownloading(true);
    try {
      const res = await fetch(`/api/review-packs/${pack.pack_id}/export-pdf`, {
        method: "POST",
        headers: { "x-vluoi-role": role },
      });
      if (!res.ok) throw new Error("download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${pack.pack_id}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setNotice({ tone: "error", text: "Không xuất được PDF." });
    } finally {
      setDownloading(false);
    }
  };

  const uploadLesson = async (formData: FormData) => {
    setUploading(true);
    setNotice({ tone: "info", text: "Backend đang lưu file và tách text từng slide." });
    try {
      const res = await fetch("/api/lessons", {
        method: "POST",
        headers: { "x-vluoi-role": "labcoach" },
        body: formData,
      });
      if (!res.ok) throw new Error("upload failed");
      const data = (await res.json()) as { lesson: { id: string }; slideDeck?: { extraction?: { sourceType?: string; emptyPages?: number[] } } };
      setSelectedLessonId(data.lesson.id);
      setOpenLessonId(data.lesson.id);
      setCatalogVersion((value) => value + 1);
      setScreen("course");
      setNotice({ tone: "success", text: `Đã upload và ingest slide (${data.slideDeck?.extraction?.sourceType || "file"}).` });
    } catch {
      setNotice({ tone: "error", text: "Upload thất bại. Hãy dùng PDF/PPTX có text selectable." });
    } finally {
      setUploading(false);
    }
  };

  const currentSubtitle = selectedLesson ? `${selectedLesson.title} · ${selectedLesson.slide_count} slide` : "Đang tải lớp học";

  return (
    <div className={screen === "reader" ? "reader-shell" : "app-shell"}>
      {screen === "reader" ? (
        <ReaderTopbar
          role={role}
          title={role === "labcoach" ? "Không gian Lab Coach" : "Trình đọc học liệu VLười"}
          subtitle={currentSubtitle}
          onBack={() => setScreen("course")}
        />
      ) : (
        <TopNav
          role={role}
          screen={screen}
          onRoleChange={(nextRole) => {
            setRole(nextRole);
            setScreen("home");
            setCoachAction("menu");
          }}
          onNavigate={setScreen}
        />
      )}

      {screen === "reader" ? (
        <SlideTutor key={selectedLessonId} lesson={selectedLesson} lessonId={selectedLessonId} />
      ) : (
        <>
          <Hero
            role={role}
            lessonCount={lessons.length}
            progress={progress}
            onOpenCourse={() => setScreen("course")}
            onGenerate={() => {
              setScreen("course");
              setCoachAction("summary");
            }}
          />
          <main className="content">
            {notice && <div className={`notice ${notice.tone}`}>{notice.text}</div>}
            {loadingLessons ? (
              <SkeletonList />
            ) : screen === "home" ? (
              <HomeDashboard role={role} lessons={lessons} progress={progress} onOpenCourse={() => setScreen("course")} />
            ) : (
              <CourseWorkspace
                role={role}
                lessons={lessons}
                selectedLessonId={selectedLessonId}
                openLessonId={openLessonId}
                selectedLesson={selectedLesson}
                pack={pack}
                loadingPack={loadingPack}
                coachAction={coachAction}
                readySummary={readySummary}
                readyInsights={readyInsights}
                readyQuestions={readyQuestions}
                sortedInsights={sortedInsights}
                needsReviewCount={needsReviewCount}
                processing={processing}
                downloading={downloading}
                uploading={uploading}
                onSelectDay={selectDay}
                onOpenReader={openReader}
                onOpenCoachSummary={openCoachSummary}
                onCoachAction={setCoachAction}
                onGenerate={generatePack}
                onUpdate={updateItem}
                onDownload={downloadPdf}
                onUpload={uploadLesson}
              />
            )}
          </main>
        </>
      )}
    </div>
  );
}

function TopNav({
  role,
  screen,
  onRoleChange,
  onNavigate,
}: {
  role: AppRole;
  screen: Screen;
  onRoleChange: (role: AppRole) => void;
  onNavigate: (screen: Screen) => void;
}) {
  return (
    <header className="top-nav">
      <div className="brand-lockup" aria-label="VLười">
        <span className="brand-mark">V</span>
        <strong>VLười</strong>
      </div>
      <nav className="main-tabs" aria-label="Điều hướng chính">
        <button className={screen === "home" ? "active" : ""} type="button" onClick={() => onNavigate("home")}>Trang chủ</button>
        <button className={screen === "course" ? "active" : ""} type="button" onClick={() => onNavigate("course")}>Khóa học của tôi</button>
      </nav>
      <div className="nav-actions">
        <a className="utility-link" href="https://codelabs.developers.google.com/" target="_blank" rel="noreferrer">Mở Codelabs</a>
        <button className="icon-btn" type="button" title="Ngôn ngữ">VI</button>
        <div className="role-switch" role="group" aria-label="Chọn vai trò">
          <button className={role === "student" ? "active" : ""} type="button" onClick={() => onRoleChange("student")}>Học viên</button>
          <button className={role === "labcoach" ? "active" : ""} type="button" onClick={() => onRoleChange("labcoach")}>Lab Coach</button>
        </div>
      </div>
    </header>
  );
}

function ReaderTopbar({ title, subtitle, role, onBack }: { title: string; subtitle: string; role: AppRole; onBack: () => void }) {
  return (
    <header className="reader-topbar">
      <button className="icon-btn" type="button" onClick={onBack} title="Quay lại">‹</button>
      <div className="brand-lockup compact"><span className="brand-mark">V</span><strong>VLười</strong></div>
      <div className="reader-title"><strong>{title}</strong><span>{subtitle}</span></div>
      <div className="reader-tools"><span className="chip neutral">{role === "labcoach" ? "Lab Coach" : "Học viên"}</span><button className="icon-btn" type="button">VI</button></div>
    </header>
  );
}

function Hero({
  role,
  lessonCount,
  progress,
  onOpenCourse,
  onGenerate,
}: {
  role: AppRole;
  lessonCount: number;
  progress: number;
  onOpenCourse: () => void;
  onGenerate: () => void;
}) {
  return (
    <section className="hero-band">
      <div>
        <p className="eyebrow">VLƯỜI · VINUNI AI THỰC CHIẾN</p>
        <h1>{role === "labcoach" ? "Bảng điều phối học liệu VLười" : "Không gian học tập VLười"}</h1>
        <p className="hero-copy">
          {role === "labcoach"
            ? "Chọn ngày học, xem slide, tạo tài liệu ôn tập và duyệt các phần lấy từ chatlog trước khi phát hành."
            : "Theo dõi ngày học, mở slide ở giữa màn hình và hỏi trợ lý theo đúng ngữ cảnh bài giảng."}
        </p>
        <div className="hero-actions">
          <button className="btn primary" type="button" onClick={role === "labcoach" ? onGenerate : onOpenCourse}>
            {role === "labcoach" ? "Tạo tài liệu" : "Vào khóa học"}
          </button>
          <span className="soft-pill">{lessonCount} ngày học</span>
        </div>
      </div>
      <div className="progress-card">
        <span>Tiến độ tài liệu</span>
        <strong>{progress}%</strong>
        <div className="progress-track"><i style={{ width: `${progress}%` }} /></div>
      </div>
    </section>
  );
}

function HomeDashboard({ role, lessons, progress, onOpenCourse }: { role: AppRole; lessons: LessonOption[]; progress: number; onOpenCourse: () => void }) {
  return (
    <section className="dashboard-grid">
      <Stat value={lessons.length} label="ngày học" />
      <Stat value={lessons.reduce((sum, item) => sum + item.slide_count, 0)} label="slide" />
      <Stat value={lessons.filter((item) => item.status !== "missing").length} label="tài liệu có sẵn" />
      <Stat value={`${progress}%`} label="tiến độ" />
      <button className="course-entry" type="button" onClick={onOpenCourse}>
        <span className="entry-icon">▣</span>
        <span><strong>{role === "labcoach" ? "Quản lý khóa học" : "Xem khóa học của tôi"}</strong><small>Danh sách ngày học, slide và tài liệu tổng hợp.</small></span>
        <b>→</b>
      </button>
    </section>
  );
}

function CourseWorkspace({
  role,
  lessons,
  selectedLessonId,
  openLessonId,
  selectedLesson,
  pack,
  loadingPack,
  coachAction,
  readySummary,
  readyInsights,
  readyQuestions,
  sortedInsights,
  needsReviewCount,
  processing,
  downloading,
  uploading,
  onSelectDay,
  onOpenReader,
  onOpenCoachSummary,
  onCoachAction,
  onGenerate,
  onUpdate,
  onDownload,
  onUpload,
}: {
  role: AppRole;
  lessons: LessonOption[];
  selectedLessonId: string;
  openLessonId: string;
  selectedLesson?: LessonOption;
  pack: ReviewPack | null;
  loadingPack: boolean;
  coachAction: CoachAction;
  readySummary: SummaryItem[];
  readyInsights: ClassInsight[];
  readyQuestions: ReviewQuestion[];
  sortedInsights: ClassInsight[];
  needsReviewCount: number;
  processing: boolean;
  downloading: boolean;
  uploading: boolean;
  onSelectDay: (lessonId: string) => void;
  onOpenReader: (lessonId: string) => void;
  onOpenCoachSummary: (lessonId: string) => void;
  onCoachAction: (action: CoachAction) => void;
  onGenerate: () => void;
  onUpdate: (itemId: string, action: "approve" | "drop") => void;
  onDownload: () => void;
  onUpload: (formData: FormData) => void;
}) {
  return (
    <section className="course-layout">
      <div className="course-header">
        <div><p className="eyebrow">COMP2010 · Khóa 3 + 4 Phase 1</p><h2>{role === "labcoach" ? "Luồng Lab Coach" : "Khóa học của tôi"}</h2><span>{lessons.length} ngày học · {lessons.reduce((sum, item) => sum + item.slide_count, 0)} slide</span></div>
        <ProgressInline lessons={lessons} />
      </div>
      <div className="course-columns">
        <div className="day-list">
          {lessons.map((lesson, index) => (
            <DayAccordion
              key={lesson.id}
              lesson={lesson}
              index={index}
              active={lesson.id === selectedLessonId}
              open={lesson.id === openLessonId}
              role={role}
              onSelect={() => onSelectDay(lesson.id)}
              onOpenReader={() => onOpenReader(lesson.id)}
              onOpenCoachSummary={() => onOpenCoachSummary(lesson.id)}
            />
          ))}
        </div>
        <aside className="side-panel">
          {role === "student" ? (
            <StudentPackPanel pack={pack} lesson={selectedLesson} loading={loadingPack} summary={readySummary} insights={readyInsights} questions={readyQuestions} downloading={downloading} onDownload={onDownload} />
          ) : (
            <CoachPanel
              lesson={selectedLesson}
              pack={pack}
              action={coachAction}
              loading={loadingPack}
              processing={processing}
              downloading={downloading}
              uploading={uploading}
              sortedInsights={sortedInsights}
              needsReviewCount={needsReviewCount}
              onAction={onCoachAction}
              onGenerate={onGenerate}
              onUpdate={onUpdate}
              onDownload={onDownload}
              onUpload={onUpload}
            />
          )}
        </aside>
      </div>
    </section>
  );
}

function DayAccordion({
  lesson,
  index,
  active,
  open,
  role,
  onSelect,
  onOpenReader,
  onOpenCoachSummary,
}: {
  lesson: LessonOption;
  index: number;
  active: boolean;
  open: boolean;
  role: AppRole;
  onSelect: () => void;
  onOpenReader: () => void;
  onOpenCoachSummary: () => void;
}) {
  return (
    <article className={`day-card ${active ? "active" : ""}`}>
      <button className="day-button" type="button" onClick={onSelect}>
        <span className="day-badge"><small>DAY</small>{dayNumber(index)}</span>
        <span><strong>{lesson.title}</strong><small>{lesson.status === "missing" ? "Chưa hoàn thành tài liệu" : statusLabel(lesson.status)} · {lesson.slide_count} slide</small></span>
        <b>{open ? "⌃" : "⌄"}</b>
      </button>
      {open && (
        <div className="material-list">
          <button className="material-row" type="button" onClick={role === "student" ? onOpenReader : onOpenCoachSummary}>
            <span>▤</span>
            <span><strong>{lesson.title}.pdf</strong><small>{lesson.slide_count} trang · slide gốc</small></span>
          </button>
        </div>
      )}
    </article>
  );
}

function StudentPackPanel({
  pack,
  lesson,
  loading,
  summary,
  insights,
  questions,
  downloading,
  onDownload,
}: {
  pack: ReviewPack | null;
  lesson?: LessonOption;
  loading: boolean;
  summary: SummaryItem[];
  insights: ClassInsight[];
  questions: ReviewQuestion[];
  downloading: boolean;
  onDownload: () => void;
}) {
  if (loading) return <PanelLoading title="Đang tải tài liệu" />;
  if (!pack) return <EmptyState title="Chưa có tài liệu tổng hợp" text="Lab Coach sẽ phát hành sau khi tạo và duyệt nội dung." />;
  return (
    <>
      <PanelHead title="Tài liệu tổng hợp" text={lesson?.title || pack.lesson.title} action={<button className="btn ghost" type="button" disabled={downloading} onClick={onDownload}>{downloading ? "Đang xuất" : "Tải PDF"}</button>} />
      <MiniStats values={[["Ý chính", summary.length], ["Hay hỏi", insights.length], ["Câu ôn", questions.length]]} />
      <Section title="Kiến thức trọng tâm">{summary.slice(0, 4).map((item) => <StudySummary key={item.id} item={item} />)}</Section>
      <Section title="Câu hỏi hay gặp">{insights.slice(0, 3).map((item) => <StudyInsight key={item.id} item={item} />)}</Section>
    </>
  );
}

function CoachPanel({
  lesson,
  pack,
  action,
  loading,
  processing,
  downloading,
  uploading,
  sortedInsights,
  needsReviewCount,
  onAction,
  onGenerate,
  onUpdate,
  onDownload,
  onUpload,
}: {
  lesson?: LessonOption;
  pack: ReviewPack | null;
  action: CoachAction;
  loading: boolean;
  processing: boolean;
  downloading: boolean;
  uploading: boolean;
  sortedInsights: ClassInsight[];
  needsReviewCount: number;
  onAction: (action: CoachAction) => void;
  onGenerate: () => void;
  onUpdate: (itemId: string, action: "approve" | "drop") => void;
  onDownload: () => void;
  onUpload: (formData: FormData) => void;
}) {
  if (loading) return <PanelLoading title="Đang kiểm tra tài liệu" />;
  if (action === "summary") {
    return (
      <>
        <PanelHead title={pack ? "Tạo lại tài liệu tổng hợp" : "Tạo tài liệu tổng hợp"} text={lesson?.title || "Chọn một ngày học"} />
        <div className="summary-builder">
          <InfoLine label="Nguồn slide" value={`${lesson?.slide_count || 0} trang`} />
          <InfoLine label="Kiến thức chính" value={pack ? `${pack.summary.length} mục trong bản hiện tại` : "Sẽ lấy từ nội dung slide"} />
          <InfoLine label="Câu hỏi hay gặp" value={pack ? `${pack.class_insights.length} nhóm blindspot` : "Sẽ tổng hợp từ chatlog"} />
          <button className="btn primary wide" type="button" disabled={processing || !lesson} onClick={onGenerate}>{processing ? "Đang tạo..." : pack ? "Tạo lại tài liệu mới" : "Tạo tài liệu tổng hợp"}</button>
        </div>
        <UploadLessonPanel uploading={uploading} onUpload={onUpload} />
      </>
    );
  }
  if (action === "review" && pack) {
    return (
      <>
        <PanelHead title="Duyệt nội dung ngoài slide" text={`${needsReviewCount} mục đang chờ quyết định`} />
        <Section title="Blindspot từ chatlog">
          {sortedInsights.map((item) => <ReviewInsight key={item.id} item={item} onUpdate={onUpdate} />)}
        </Section>
        <Section title="Kiến thức cần duyệt">
          {pack.summary.filter((item) => item.status === "needs_review").map((item) => <ReviewSummary key={item.id} item={item} onUpdate={onUpdate} />)}
          {pack.review_questions.filter((item) => item.status === "needs_review").map((item) => <ReviewQuestionCard key={item.id} item={item} onUpdate={onUpdate} />)}
        </Section>
      </>
    );
  }
  if (action === "preview" && pack) {
    return (
      <>
        <PanelHead title="Xem tài liệu tổng hợp" text={pack.lesson.title} action={<button className="btn ghost" type="button" disabled={downloading} onClick={onDownload}>{downloading ? "Đang xuất" : "Tải PDF"}</button>} />
        <PdfPreview pack={pack} />
      </>
    );
  }
  return (
    <>
      <PanelHead title="Thao tác với slide" text={lesson?.title || "Chọn một ngày học"} />
      <div className="coach-menu">
        <button type="button" onClick={() => onAction("preview")} disabled={!pack}>Xem tài liệu tổng hợp<span>{pack ? "Có bản hiện tại" : "Chưa có"}</span></button>
        <button type="button" onClick={() => onAction("summary")}>{pack ? "Tạo lại tài liệu tổng hợp mới" : "Tạo file ôn tập cho học viên"}<span>Slide + câu hỏi hay gặp</span></button>
        <button type="button" onClick={() => onAction("review")} disabled={!pack}>Duyệt nội dung chatlog<span>{needsReviewCount} mục cần duyệt</span></button>
      </div>
    </>
  );
}

function SlideTutor({ lesson, lessonId }: { lesson?: LessonOption; lessonId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>(starterChat);
  const [message, setMessage] = useState("");
  const [scope, setScope] = useState("current");
  const [page, setPage] = useState(1);
  const [sending, setSending] = useState(false);
  const [slideLoading, setSlideLoading] = useState(true);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) return;
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setMessage("");
    setSending(true);
    const scopedMessage = scope === "all" ? `Theo toàn bộ deck: ${trimmed}` : `Theo slide ${page}: ${trimmed}`;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lesson_id: lessonId, message: scopedMessage, current_slide_page: page, selected_text: "" }),
      });
      const data = (await res.json()) as { reply?: string; citations?: string };
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: data.reply || "Backend chưa trả lời được câu hỏi này.", citations: data.citations }]);
    } catch {
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: "Không kết nối được chatbot." }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="reader-grid">
      <aside className="reader-sidebar">
        <PanelHead title="Học liệu môn học" text="Ngày học, slide và tài liệu đã upload" />
        <div className="day-mini active">
          <strong>{lesson?.title || "Đang tải slide"}</strong>
          <span>{lesson?.slide_count || 0} trang · published</span>
        </div>
      </aside>
      <section className="slide-stage">
        {slideLoading && <div className="slide-loader"><div /><span>Đang tải slide từ CDN...</span></div>}
        <iframe title={lesson?.title || "Slide"} src={`/api/lessons/${lessonId}/slide`} onLoad={() => setSlideLoading(false)} />
        <button className="pager left" type="button" onClick={() => setPage((value) => Math.max(1, value - 1))}>‹</button>
        <button className="pager right" type="button" onClick={() => setPage((value) => Math.min(lesson?.slide_count || 99, value + 1))}>›</button>
      </section>
      <aside className="chat-pane">
        <div className="chat-head">
          <span className="chat-icon">⌘</span>
          <div><h2>VLười Tutor</h2><p>Trợ lý học theo ngữ cảnh</p></div>
        </div>
        <div className="chat-controls">
          <select value={scope} onChange={(event) => setScope(event.target.value)}>
            <option value="current">Theo slide</option>
            <option value="all">Toàn bộ deck</option>
          </select>
          <input aria-label="Trang slide" min={1} max={lesson?.slide_count || 99} type="number" value={page} onChange={(event) => setPage(Number(event.target.value))} />
        </div>
        <div className="chat-log">
          {messages.map((item) => (
            <div key={item.id} className={`chat-bubble ${item.role}`}>
              <p>{item.content}</p>
              {item.citations && <small>{item.citations}</small>}
            </div>
          ))}
        </div>
        <form className="chat-form" onSubmit={submit}>
          <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Nhập câu hỏi hoặc bôi đen tài liệu..." />
          <button className="send-btn" disabled={sending} type="submit" title="Gửi">{sending ? "..." : "➤"}</button>
        </form>
      </aside>
    </main>
  );
}

function UploadLessonPanel({ uploading, onUpload }: { uploading: boolean; onUpload: (formData: FormData) => void }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    onUpload(formData);
    form.reset();
  };
  return (
    <form className="upload-panel" onSubmit={submit}>
      <input name="title" required placeholder="Tên ngày học mới" />
      <input name="file" required type="file" accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation" />
      <button className="btn ghost" disabled={uploading} type="submit">{uploading ? "Đang upload..." : "Upload slide"}</button>
    </form>
  );
}

function ProgressInline({ lessons }: { lessons: LessonOption[] }) {
  const done = lessons.filter((lesson) => lesson.status !== "missing").length;
  const total = lessons.length || 1;
  const pct = Math.round((done / total) * 100);
  return <div className="progress-inline"><span>Đã có tài liệu {done}/{lessons.length}</span><div className="progress-track"><i style={{ width: `${pct}%` }} /></div><strong>{pct}%</strong></div>;
}

function PanelHead({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <div className="panel-head"><div><h3>{title}</h3><p>{text}</p></div>{action}</div>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <><div className="section-label">{title}</div>{children}</>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="empty-state"><h2>{title}</h2><p>{text}</p></div>;
}

function PanelLoading({ title }: { title: string }) {
  return <div className="empty-state loading"><h2>{title}</h2><p>Đang đồng bộ dữ liệu mới nhất...</p></div>;
}

function SkeletonList() {
  return <div className="skeleton-list">{Array.from({ length: 5 }).map((_, index) => <span key={index} />)}</div>;
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return <div className="stat-card"><strong>{value}</strong><span>{label}</span></div>;
}

function MiniStats({ values }: { values: [string, number][] }) {
  return <div className="mini-stats">{values.map(([label, value]) => <span key={label}><strong>{value}</strong>{label}</span>)}</div>;
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return <div className="info-line"><span>{label}</span><strong>{value}</strong></div>;
}

function StudySummary({ item }: { item: SummaryItem }) {
  return <article className="study-card"><div><h3>{item.title}</h3><span>{sourceLabel(item.source_pages)}</span></div><p>{item.content}</p></article>;
}

function StudyInsight({ item }: { item: ClassInsight }) {
  return (
    <article className="study-card accent">
      <div><h3>{item.topic}</h3><span>{item.question_count} câu hỏi</span></div>
      <p><strong>Hay vướng:</strong> {item.common_confusion}</p>
      <p><strong>Cách hiểu đúng:</strong> {item.correct_understanding}</p>
      <div className="question-strip">{item.representative_questions.slice(0, 2).map((question) => <span key={question}>{question}</span>)}</div>
    </article>
  );
}

function ReviewSummary({ item, onUpdate }: { item: SummaryItem; onUpdate: (itemId: string, action: "approve" | "drop") => void }) {
  return <ReviewCard id={item.id} status={item.status} title={item.title} body={item.content} pages={item.source_pages} excerpt={item.source_excerpt} onUpdate={onUpdate} />;
}

function ReviewInsight({ item, onUpdate }: { item: ClassInsight; onUpdate: (itemId: string, action: "approve" | "drop") => void }) {
  return <ReviewCard id={item.id} status={item.status} title={item.topic} body={`${item.common_confusion}\n\nCách hiểu đúng: ${item.correct_understanding}`} pages={item.source_pages} excerpt={item.source_excerpt} onUpdate={onUpdate} />;
}

function ReviewQuestionCard({ item, onUpdate }: { item: ReviewQuestion; onUpdate: (itemId: string, action: "approve" | "drop") => void }) {
  return <ReviewCard id={item.id} status={item.status} title={item.question} body={`${item.answer}\n${item.explanation}`} pages={item.source_pages} excerpt={item.source_excerpt} onUpdate={onUpdate} />;
}

function ReviewCard({
  id,
  status,
  title,
  body,
  pages,
  excerpt,
  onUpdate,
}: {
  id: string;
  status: string;
  title: string;
  body: string;
  pages: number[];
  excerpt: string;
  onUpdate: (itemId: string, action: "approve" | "drop") => void;
}) {
  return (
    <article className={`review-card ${status === "needs_review" ? "needs-review" : ""}`}>
      <header><h3>{title}</h3><span className={`chip ${status === "ready" ? "ready" : "review"}`}>{statusLabel(status)}</span></header>
      {body.split("\n").filter(Boolean).map((line) => <p key={line}>{line}</p>)}
      <details className="evidence"><summary>{sourceLabel(pages)}</summary><p>{excerpt || "Không có trích dẫn slide trực tiếp."}</p></details>
      {status === "needs_review" ? <div className="actions"><button className="btn primary" onClick={() => onUpdate(id, "approve")}>Duyệt</button><button className="btn ghost" onClick={() => onUpdate(id, "drop")}>Bỏ khỏi PDF</button></div> : null}
    </article>
  );
}

function PdfPreview({ pack }: { pack: ReviewPack }) {
  const summary = pack.summary.filter((item) => item.status === "ready");
  const insights = pack.class_insights.filter((item) => item.status === "ready");
  const questions = pack.review_questions.filter((item) => item.status === "ready");
  return (
    <article className="pdf-preview">
      <header><strong>VLười - Tài liệu tổng hợp</strong><span>{pack.pack_id}</span></header>
      <h2>{pack.lesson.title}</h2>
      <p>{pack.lesson.slide_count} slide · {pack.analysis.unique_user_count} học viên · {pack.analysis.cluster_count} nhóm câu hỏi</p>
      <PdfBlock title="Kiến thức quan trọng" items={summary.map((item) => `${item.title}: ${item.content}`)} />
      <PdfBlock title="Học viên hay hỏi" items={insights.map((item) => `${item.topic}: ${item.correct_understanding}`)} />
      <PdfBlock title="Câu tự kiểm tra" items={questions.map((item, index) => `${index + 1}. ${item.question} Đáp án: ${item.answer}`)} />
    </article>
  );
}

function PdfBlock({ title, items }: { title: string; items: string[] }) {
  return <section><h3>{title}</h3>{items.length ? items.map((item) => <p key={item}>{item}</p>) : <p>Chưa có mục ready.</p>}</section>;
}
