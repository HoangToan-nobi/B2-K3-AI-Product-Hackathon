"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ClassInsight, ReviewPack, ReviewQuestion, SummaryItem } from "@/lib/review-packs/types";

type AppRole = "student" | "labcoach";
type Screen = "home" | "course" | "reader" | "review-pack";
type CoachAction = "menu" | "summary" | "review" | "preview";
type Notice = { tone: "error" | "success" | "info"; text: string };
type ProgressKind = "review" | "upload" | "add-slide";

type ProgressState = {
  active: boolean;
  kind: ProgressKind;
  title: string;
  percent: number;
  step: string;
  message: string;
  detail?: string | null;
  logs: string[];
};

type ProgressEventPayload = {
  type: "progress" | "complete" | "error";
  title: string;
  percent: number;
  step: string;
  message: string;
  detail?: string | null;
  payload?: unknown;
};

type ProgressJobStart = {
  job_id: string;
  events_url: string;
};

type SlideDeckInfo = {
  id: string;
  lessonId: string;
  originalFilename: string;
  pageCount: number;
  status: string;
};

type LessonOption = {
  id: string;
  title: string;
  slide_count: number;
  pack_id: string;
  status: "ready" | "needs_review" | "missing" | string;
  slideDecks?: SlideDeckInfo[];
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
    content: "Xin chào! Mình là VLười Tutor. Bạn có thể bôi đen một đoạn trên slide để hỏi hoặc gửi câu hỏi tự do nhé!",
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
  const [selectedDeckId, setSelectedDeckId] = useState("");
  const [openLessonId, setOpenLessonId] = useState("");
  const [pack, setPack] = useState<ReviewPack | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loadingLessons, setLoadingLessons] = useState(true);
  const [loadingPack, setLoadingPack] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progressJob, setProgressJob] = useState<ProgressState | null>(null);
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
        const nextSelected =
          selectedLessonId && nextLessons.some((lesson) => lesson.id === selectedLessonId)
            ? selectedLessonId
            : nextLessons[0]?.id || "";
        setSelectedLessonId(nextSelected);
        setOpenLessonId((prev) => prev || nextSelected);
      })
      .catch(() => setNotice({ tone: "error", text: "Không tải được danh sách ngày học từ VLười." }))
      .finally(() => {
        if (!cancelled) setLoadingLessons(false);
      });
    return () => {
      cancelled = true;
    };
  }, [role, catalogVersion]);

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
  const needsReviewCount = pack ? pack.class_insights.filter((item) => item.status === "needs_review").length : 0;
  const sortedInsights = useMemo(
    () => [...(pack?.class_insights || [])].filter((item) => item.status === "needs_review").sort((a, b) => b.question_count - a.question_count),
    [pack],
  );

  const selectDay = (lessonId: string) => {
    setSelectedLessonId(lessonId);
    setOpenLessonId((prev) => (prev === lessonId ? "" : lessonId));
    setCoachAction("menu");
    setSelectedDeckId("");
  };

  const openSlideReader = (lessonId: string, deckId?: string) => {
    setSelectedLessonId(lessonId);
    if (deckId) setSelectedDeckId(deckId);
    setScreen("reader");
    setCoachAction("menu");
  };

  const runProgressJob = <T,>(
    kind: ProgressKind,
    fallbackTitle: string,
    startRequest: () => Promise<Response>,
  ): Promise<T> => (
    new Promise<T>(async (resolve, reject) => {
      let settled = false;
      let source: EventSource | null = null;

      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        source?.close();
        callback();
      };

      try {
        const startRes = await startRequest();
        if (!startRes.ok) throw new Error("Không bắt đầu được tiến trình.");
        const start = (await startRes.json()) as ProgressJobStart;
        setProgressJob({
          active: true,
          kind,
          title: fallbackTitle,
          percent: 0,
          step: "Bắt đầu",
          message: "VLười đã nhận yêu cầu và đang chuẩn bị xử lý.",
          logs: ["Bắt đầu: VLười đã nhận yêu cầu."],
        });
        source = new EventSource(start.events_url);
        source.onmessage = (event) => {
          const data = JSON.parse(event.data) as ProgressEventPayload;
          const line = `${data.step}: ${data.message}`;
          setProgressJob((current) => ({
            active: data.type === "progress",
            kind: current?.kind || kind,
            title: data.title || current?.title || fallbackTitle,
            percent: data.percent,
            step: data.step,
            message: data.message,
            detail: data.detail,
            logs: [...(current?.logs || []), line].slice(-6),
          }));
          if (data.type === "complete") {
            finish(() => resolve(data.payload as T));
          }
          if (data.type === "error") {
            finish(() => reject(new Error(data.message)));
          }
        };
        source.onerror = () => {
          finish(() => reject(new Error("Mất kết nối tiến trình từ VLười.")));
        };
      } catch (error) {
        finish(() => reject(error));
      }
    })
  );

  const generatePack = async () => {
    if (!selectedLesson || role !== "labcoach") return;
    setProcessing(true);
    setNotice(null);
    try {
      const data = await runProgressJob<{ pack: ReviewPack; job: { mode: string } }>(
        "review",
        "Tạo tài liệu ôn tập",
        () => fetch("/api/review-packs/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-vluoi-role": role },
          body: JSON.stringify({ lesson_id: selectedLesson.id, run_pipeline: true }),
        }),
      );
      setPack(data.pack);
      setCatalogVersion((value) => value + 1);
      setCoachAction(data.pack.warnings.length ? "review" : "preview");
      setNotice({
        tone: data.job.mode === "ai_generated" ? "success" : "info",
        text:
          data.job.mode === "ai_generated"
            ? "Đã tạo bản tổng hợp. Các mục ngoài slide cần Lab Coach duyệt."
            : "Đã tạo bản fallback để Lab Coach kiểm tra.",
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
    setNotice(null);
    try {
      const data = await runProgressJob<{
        lesson: { id: string };
        slideDeck?: { extraction?: { sourceType?: string; emptyPages?: number[] } };
      }>(
        "upload",
        "Tạo ngày học mới",
        () => fetch("/api/lessons/jobs", {
          method: "POST",
          headers: { "x-vluoi-role": "labcoach" },
          body: formData,
        }),
      );
      setSelectedLessonId(data.lesson.id);
      setOpenLessonId(data.lesson.id);
      setCatalogVersion((value) => value + 1);
      setScreen("course");
      setNotice({ tone: "success", text: `Đã thêm ngày học và đọc nội dung slide (${data.slideDeck?.extraction?.sourceType || "file"}).` });
    } catch {
      setNotice({ tone: "error", text: "Upload thất bại. Hãy dùng PDF/PPTX có text selectable." });
    } finally {
      setUploading(false);
    }
  };

  const deleteLesson = async (lessonId: string) => {
    try {
      const res = await fetch(`/api/lessons/${lessonId}`, {
        method: "DELETE",
        headers: { "x-vluoi-role": "labcoach" },
      });
      if (!res.ok) throw new Error("delete failed");
      setCatalogVersion((value) => value + 1);
      if (selectedLessonId === lessonId) {
        setSelectedLessonId("");
        setOpenLessonId("");
      }
      setNotice({ tone: "success", text: "Đã xóa ngày học." });
    } catch {
      setNotice({ tone: "error", text: "Không xóa được ngày học." });
    }
  };

  const addSlideToLesson = async (lessonId: string, formData: FormData) => {
    setUploading(true);
    setNotice(null);
    try {
      await runProgressJob<{ slideDeck: SlideDeckInfo }>(
        "add-slide",
        "Thêm slide vào ngày học",
        () => fetch(`/api/lessons/${lessonId}/slides/jobs`, {
          method: "POST",
          headers: { "x-vluoi-role": "labcoach" },
          body: formData,
        }),
      );
      setCatalogVersion((value) => value + 1);
      setNotice({ tone: "success", text: "Đã thêm slide vào ngày học." });
    } catch {
      setNotice({ tone: "error", text: "Không thêm được slide." });
    } finally {
      setUploading(false);
    }
  };

  const deleteSlide = async (lessonId: string, deckId: string) => {
    try {
      const res = await fetch(`/api/lessons/${lessonId}/slides/${deckId}`, {
        method: "DELETE",
        headers: { "x-vluoi-role": "labcoach" },
      });
      if (!res.ok) throw new Error("delete slide failed");
      setCatalogVersion((value) => value + 1);
      setNotice({ tone: "success", text: "Đã xóa slide." });
    } catch {
      setNotice({ tone: "error", text: "Không xóa được slide." });
    }
  };

  const currentSubtitle = selectedLesson ? `${selectedLesson.title} · ${selectedLesson.slide_count} slide` : "Đang tải lớp học";
  const readerDeckId = selectedDeckId || selectedLesson?.slideDecks?.[0]?.id || "";

  return (
    <div className={screen === "reader" || screen === "review-pack" ? "reader-shell" : "app-shell"}>
      {screen === "reader" ? (
        <ReaderTopbar
          role={role}
          title={role === "labcoach" ? "Lab Coach" : "VLười Tutor"}
          subtitle={currentSubtitle}
          onBack={() => setScreen("course")}
        />
      ) : screen === "review-pack" ? (
        <ReaderTopbar
          role={role}
          title="Tài liệu tổng hợp"
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
        <SlideTutor
          key={`${selectedLessonId}-${readerDeckId}`}
          lesson={selectedLesson}
          lessonId={selectedLessonId}
          deckId={readerDeckId}
          role={role}
          lessons={lessons}
          pack={pack}
          loadingPack={loadingPack}
          onSelectLesson={(id) => {
            setSelectedLessonId(id);
            setSelectedDeckId("");
          }}
        />
      ) : screen === "review-pack" ? (
        <ReviewPackPage
          pack={pack}
          lesson={selectedLesson}
          loading={loadingPack}
          downloading={downloading}
          onDownload={downloadPdf}
          onOpenReader={() => setScreen("reader")}
        />
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
            {notice && (
              <div className={`notice ${notice.tone}`}>
                <span>{notice.text}</span>
                <button type="button" className="notice-close" onClick={() => setNotice(null)}>
                  ×
                </button>
              </div>
            )}
            {progressJob && <ProgressPanel progress={progressJob} />}
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
                onOpenReader={openSlideReader}
                onCoachAction={setCoachAction}
                onGenerate={generatePack}
                onUpdate={updateItem}
                onDownload={downloadPdf}
                onUpload={uploadLesson}
                onDeleteLesson={deleteLesson}
                onAddSlide={addSlideToLesson}
                onDeleteSlide={deleteSlide}
                onOpenReviewPack={() => setScreen("review-pack")}
              />
            )}
          </main>
        </>
      )}
    </div>
  );
}

function ProgressPanel({ progress }: { progress: ProgressState }) {
  return (
    <section className={`progress-panel ${progress.active ? "running" : "done"}`} aria-live="polite">
      <div className="progress-panel-head">
        <div>
          <p>{progress.title}</p>
          <strong>{progress.step}</strong>
        </div>
        <span>{progress.percent}%</span>
      </div>
      <div className="progress-track" aria-label={`Tiến trình ${progress.percent}%`}>
        <div className="progress-fill" style={{ width: `${progress.percent}%` }} />
      </div>
      <p className="progress-message">{progress.message}</p>
      {progress.detail && <p className="progress-detail">{progress.detail}</p>}
      <div className="progress-log">
        {progress.logs.map((item, index) => (
          <span key={`${item}-${index}`}>{item}</span>
        ))}
      </div>
    </section>
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
        <button className={screen === "home" ? "active" : ""} type="button" onClick={() => onNavigate("home")}>
          Trang chủ
        </button>
        <button className={screen === "course" ? "active" : ""} type="button" onClick={() => onNavigate("course")}>
          Khóa học của tôi
        </button>
      </nav>
      <div className="nav-actions">
        <div className="role-switch" role="group" aria-label="Chọn vai trò">
          <button id="role-student" className={role === "student" ? "active" : ""} type="button" onClick={() => onRoleChange("student")}>
            Học viên
          </button>
          <button id="role-labcoach" className={role === "labcoach" ? "active" : ""} type="button" onClick={() => onRoleChange("labcoach")}>
            Lab Coach
          </button>
        </div>
      </div>
    </header>
  );
}

function ReaderTopbar({ title, subtitle, role, onBack }: { title: string; subtitle: string; role: AppRole; onBack: () => void }) {
  return (
    <header className="reader-topbar">
      <button className="back-btn" type="button" onClick={onBack} title="Quay lại">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <div className="brand-lockup compact">
        <span className="brand-mark">V</span>
        <strong>VLười</strong>
      </div>
      <div className="reader-title">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
      <div className="reader-tools">
        <span className={`chip ${role === "labcoach" ? "coach" : "student"}`}>{role === "labcoach" ? "Lab Coach" : "Học viên"}</span>
      </div>
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
      <div className="hero-content">
        <p className="eyebrow">VLƯỜI · VINUNI AI THỰC CHIẾN</p>
        <h1>{role === "labcoach" ? "Bảng điều phối học liệu" : "Không gian học tập VLười"}</h1>
        <p className="hero-copy">
          {role === "labcoach"
            ? "Chọn ngày học, xem slide, tạo tài liệu ôn tập và duyệt nội dung từ chatlog trước khi phát hành."
            : "Theo dõi tiến độ, học liệu và phần kiến thức cần củng cố. Hỏi trợ lý theo đúng ngữ cảnh bài giảng."}
        </p>
        <div className="hero-actions">
          <button className="btn primary" id="hero-cta" type="button" onClick={role === "labcoach" ? onGenerate : onOpenCourse}>
            {role === "labcoach" ? "Tạo tài liệu ôn tập" : "Vào khóa học"}
          </button>
          <span className="soft-pill">{lessonCount} ngày học</span>
        </div>
      </div>
      <div className="hero-card">
        <div className="hero-card-progress">
          <div className="hero-card-label">
            <span>Tiến độ tài liệu</span>
            <strong>{progress}%</strong>
          </div>
          <div className="progress-track">
            <i style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="hero-card-stats">
          <div>
            <strong>{lessonCount}</strong>
            <span>ngày học</span>
          </div>
          <div className="hero-card-divider" />
          <div>
            <strong>{progress}%</strong>
            <span>hoàn thành</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function HomeDashboard({
  role,
  lessons,
  progress,
  onOpenCourse,
}: {
  role: AppRole;
  lessons: LessonOption[];
  progress: number;
  onOpenCourse: () => void;
}) {
  const totalSlides = lessons.reduce((sum, item) => sum + item.slide_count, 0);
  const readyCount = lessons.filter((item) => item.status !== "missing").length;
  return (
    <section className="dashboard-wrap">
      <div className="dashboard-grid">
        <StatCard value={lessons.length} label="Khóa học" sub="ngày học đã tạo" />
        <StatCard value={totalSlides} label="Tổng slide" sub="tài liệu đã thêm" />
        <StatCard value={readyCount} label="Tài liệu sẵn" sub="đã tổng hợp kiến thức" />
        <StatCard value={`${progress}%`} label="Tiến độ" sub="hoàn thành khóa học" />
      </div>
      <button className="course-entry-card" id="open-course-btn" type="button" onClick={onOpenCourse}>
        <div className="entry-icon-wrap">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
        </div>
        <div className="entry-text">
          <strong>{role === "labcoach" ? "Quản lý khóa học" : "Xem khóa học của tôi"}</strong>
          <small>Mở danh sách đầy đủ các lớp bạn đang theo học.</small>
        </div>
        <svg className="entry-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
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
  onCoachAction,
  onGenerate,
  onUpdate,
  onDownload,
  onUpload,
  onDeleteLesson,
  onAddSlide,
  onDeleteSlide,
  onOpenReviewPack,
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
  onOpenReader: (lessonId: string, deckId?: string) => void;
  onCoachAction: (action: CoachAction) => void;
  onGenerate: () => void;
  onUpdate: (itemId: string, action: "approve" | "drop") => void;
  onDownload: () => void;
  onUpload: (formData: FormData) => void;
  onDeleteLesson: (lessonId: string) => void;
  onAddSlide: (lessonId: string, formData: FormData) => void;
  onDeleteSlide: (lessonId: string, deckId: string) => void;
  onOpenReviewPack: () => void;
}) {
  const totalSlides = lessons.reduce((sum, item) => sum + item.slide_count, 0);
  const ITEMS_PER_PAGE = 6;
  const [page, setPage] = useState(1);
  const totalPages = Math.ceil(lessons.length / ITEMS_PER_PAGE);
  const pagedLessons = lessons.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
  const [showAddLesson, setShowAddLesson] = useState(false);

  return (
    <section className="course-layout">
      <div className="course-header">
        <div className="course-header-info">
          <p className="eyebrow">COMP2010 · Khoá 3 + 4 Phase 1</p>
          <h2>{role === "labcoach" ? "Luồng Lab Coach" : "Khóa học của tôi"}</h2>
          <span className="course-meta">{lessons.length} ngày học · {totalSlides} slide</span>
        </div>
        <div className="course-header-actions">
          {role === "labcoach" && (
            <button
              className="btn primary"
              id="toggle-add-lesson-btn"
              type="button"
              onClick={() => setShowAddLesson((v) => !v)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {showAddLesson ? "Đóng tạo ngày học" : "Tạo ngày học mới"}
            </button>
          )}
          <ProgressBadge lessons={lessons} />
        </div>
      </div>

      {role === "labcoach" && showAddLesson && (
        <div className="create-lesson-top-bar">
          <UploadLessonPanel uploading={uploading} onUpload={(fd) => { onUpload(fd); setShowAddLesson(false); }} />
        </div>
      )}
      <div className="course-columns">
        <div className="day-list">
          {pagedLessons.map((lesson, index) => (
            <DayAccordion
              key={lesson.id}
              lesson={lesson}
              index={(page - 1) * ITEMS_PER_PAGE + index}
              active={lesson.id === selectedLessonId}
              open={lesson.id === openLessonId}
              role={role}
              pack={lesson.id === selectedLessonId ? pack : null}
              onSelect={() => onSelectDay(lesson.id)}
              onOpenReader={(deckId) => onOpenReader(lesson.id, deckId)}
              onDelete={() => onDeleteLesson(lesson.id)}
              onAddSlide={(formData) => onAddSlide(lesson.id, formData)}
              onDeleteSlide={(deckId) => onDeleteSlide(lesson.id, deckId)}
            />
          ))}
          {totalPages > 1 && (
            <div className="pagination">
              <button
                id="page-prev"
                className="page-btn"
                type="button"
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Trước
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  id={`page-${p}`}
                  className={`page-btn ${p === page ? "active" : ""}`}
                  type="button"
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              ))}
              <button
                id="page-next"
                className="page-btn"
                type="button"
                disabled={page === totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Sau
              </button>
            </div>
          )}
        </div>
        <aside className="side-panel">
          {role === "student" ? (
            <StudentPackPanel
              pack={pack}
              lesson={selectedLesson}
              loading={loadingPack}
              summary={readySummary}
              insights={readyInsights}
              questions={readyQuestions}
              downloading={downloading}
              onDownload={onDownload}
              onOpenReader={() => selectedLesson && onOpenReader(selectedLesson.id)}
              onOpenReviewPack={onOpenReviewPack}
            />
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
              onOpenReviewPack={onOpenReviewPack}
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
  pack,
  onSelect,
  onOpenReader,
  onDelete,
  onAddSlide,
  onDeleteSlide,
}: {
  lesson: LessonOption;
  index: number;
  active: boolean;
  open: boolean;
  role: AppRole;
  pack: ReviewPack | null;
  onSelect: () => void;
  onOpenReader: (deckId?: string) => void;
  onDelete: () => void;
  onAddSlide: (formData: FormData) => void;
  onDeleteSlide: (deckId: string) => void;
}) {
  const addSlideRef = useRef<HTMLInputElement>(null);
  const hasPackReady = !!pack || lesson.status === "ready";

  const handleAddSlide = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    onAddSlide(formData);
    e.target.value = "";
  };

  const statusBadge = lesson.status === "missing" ? "missing" : lesson.status === "needs_review" ? "review" : "ready";

  return (
    <article className={`day-card ${active ? "active" : ""} ${open ? "open" : ""}`}>
      <button className="day-button" type="button" onClick={onSelect} id={`day-btn-${lesson.id}`}>
        <span className="day-badge">
          <small>DAY</small>
          {dayNumber(index)}
        </span>
        <div className="day-info">
          <strong>{lesson.title}</strong>
          <small>
            <span className={`status-dot ${statusBadge}`} />
            {lesson.status === "missing" ? "Chưa có tài liệu" : statusLabel(lesson.status)} · {lesson.slide_count} slide
          </small>
        </div>
        <svg
          className={`chevron ${open ? "open" : ""}`}
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="material-list">
          {lesson.slideDecks && lesson.slideDecks.length > 0 ? (
            lesson.slideDecks.map((deck) => (
              <div key={deck.id} className="material-row-wrap">
                <button
                  className="material-row"
                  id={`deck-btn-${deck.id}`}
                  type="button"
                  onClick={() => onOpenReader(deck.id)}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <div>
                    <strong>{deck.originalFilename}</strong>
                    <small>{deck.pageCount} trang · slide gốc</small>
                  </div>
                  {hasPackReady && (
                    <span className="pack-badge">Có tài liệu tổng hợp</span>
                  )}
                </button>
                {role === "labcoach" && (
                  <button
                    className="deck-delete-btn"
                    id={`deck-delete-${deck.id}`}
                    type="button"
                    title="Xóa slide"
                    onClick={() => onDeleteSlide(deck.id)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                  </button>
                )}
              </div>
            ))
          ) : (
            <button
              className="material-row"
              id={`slide-fallback-${lesson.id}`}
              type="button"
              onClick={() => onOpenReader()}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <div>
                <strong>{lesson.title}.pdf</strong>
                <small>{lesson.slide_count} trang · slide gốc</small>
              </div>
              {hasPackReady && <span className="pack-badge">Có tài liệu tổng hợp</span>}
            </button>
          )}
          {role === "labcoach" && (
            <div className="coach-actions-row">
              <label className="add-slide-btn" id={`add-slide-${lesson.id}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Thêm slide
                <input
                  ref={addSlideRef}
                  type="file"
                  accept=".pdf,.pptx"
                  style={{ display: "none" }}
                  onChange={handleAddSlide}
                />
              </label>
              <button className="delete-lesson-btn" id={`delete-lesson-${lesson.id}`} type="button" onClick={onDelete}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
                Xóa ngày học
              </button>
            </div>
          )}
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
  onOpenReader,
  onOpenReviewPack,
}: {
  pack: ReviewPack | null;
  lesson?: LessonOption;
  loading: boolean;
  summary: SummaryItem[];
  insights: ClassInsight[];
  questions: ReviewQuestion[];
  downloading: boolean;
  onDownload: () => void;
  onOpenReader: () => void;
  onOpenReviewPack: () => void;
}) {
  if (loading) return <PanelLoading title="Đang tải tài liệu" />;
  if (!lesson) return <EmptyState title="Chọn một ngày học" text="Nhấn vào một ngày học ở danh sách bên trái để xem nội dung." />;

  return (
    <>
      <PanelHead title="Tài liệu học tập" text={lesson.title} />
      <div className="panel-quick-actions">
        <button className="btn primary" id="open-reader-btn" type="button" onClick={onOpenReader}>
          Xem slide + hỏi trợ lý
        </button>
        {pack && (
          <button className="btn accent" id="open-review-pack-btn" type="button" onClick={onOpenReviewPack}>
            Xem tài liệu tổng hợp
          </button>
        )}
        {pack && (
          <button className="btn ghost" id="download-pdf-btn" type="button" disabled={downloading} onClick={onDownload}>
            {downloading ? "Đang xuất..." : "Tải PDF tổng hợp"}
          </button>
        )}
      </div>
      {!pack ? (
        <EmptyState title="Chưa có tài liệu tổng hợp" text="Lab Coach sẽ phát hành sau khi tạo và duyệt nội dung." />
      ) : (
        <>
          <MiniStats values={[["Ý chính", summary.length], ["Hay hỏi", insights.length], ["Quiz", questions.length]]} />
          <Section title="Kiến thức trọng tâm">{summary.slice(0, 4).map((item) => <StudySummary key={item.id} item={item} />)}</Section>
          <Section title="Câu hỏi hay gặp">{insights.slice(0, 3).map((item) => <StudyInsight key={item.id} item={item} />)}</Section>
        </>
      )}
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
  onOpenReviewPack,
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
  onOpenReviewPack: () => void;
}) {
  if (loading) return <PanelLoading title="Đang kiểm tra tài liệu" />;
  if (action === "summary") {
    return (
      <>
        <PanelHead title={pack ? "Tạo lại tài liệu tổng hợp" : "Tạo tài liệu tổng hợp"} text={lesson?.title || "Chọn một ngày học"} />
        <div className="summary-builder">
          <InfoLine label="Nguồn slide" value={`${lesson?.slide_count || 0} trang`} />
          <InfoLine label="Kiến thức chính" value={pack ? `${pack.summary.length} mục trong bản hiện tại` : "Sẽ lấy từ nội dung slide"} />
          <InfoLine label="Câu hỏi hay gặp" value={pack ? `${pack.class_insights.length} câu hỏi từ chatlog` : "Sẽ tổng hợp từ chatlog"} />
          <button
            className="btn primary wide"
            id="generate-pack-btn"
            type="button"
            disabled={processing || !lesson}
            onClick={onGenerate}
          >
            {processing ? "Đang tạo..." : pack ? "Tạo lại tài liệu mới" : "Tạo tài liệu tổng hợp"}
          </button>
          <button className="btn ghost" type="button" onClick={() => onAction("menu")}>
            Quay lại
          </button>
        </div>
      </>
    );
  }
  if (action === "review" && pack) {
    return (
      <>
        <PanelHead title="Duyệt câu hỏi từ chatlog" text={`${needsReviewCount} câu hỏi đang chờ quyết định`} />
        <Section title="Câu hỏi học viên thường hỏi">
          {sortedInsights.length ? (
            sortedInsights.map((item) => <ReviewInsight key={item.id} item={item} onUpdate={onUpdate} />)
          ) : (
            <EmptyState title="Không có nội dung ngoài slide cần duyệt" text="Các câu hỏi chatlog cùng chủ đề sẽ được đưa thẳng vào tài liệu tổng hợp." />
          )}
        </Section>
        <button className="btn ghost wide" type="button" onClick={() => onAction("menu")}>
          Quay lại menu
        </button>
      </>
    );
  }
  if (action === "preview" && pack) {
    return (
      <>
        <PanelHead
          title="Xem tài liệu tổng hợp"
          text={pack.lesson.title}
          action={
            <button className="btn ghost" id="export-pdf-btn" type="button" disabled={downloading} onClick={onDownload}>
              {downloading ? "Đang xuất..." : "Tải PDF"}
            </button>
          }
        />
        <PdfPreview pack={pack} />
        <button className="btn ghost wide" type="button" onClick={() => onAction("menu")}>
          Quay lại menu
        </button>
      </>
    );
  }
  return (
    <>
      <PanelHead title="Thao tác với slide" text={lesson?.title || "Chọn một ngày học"} />
      <div className="coach-menu">
        <button id="coach-view-pack" type="button" onClick={onOpenReviewPack} disabled={!pack}>
          <div className="coach-menu-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </div>
          <div>
            Xem chi tiết tài liệu tổng hợp
            <span>{pack ? "Mở trang tài liệu riêng" : "Chưa có"}</span>
          </div>
        </button>
        <button id="coach-create-pack" type="button" onClick={() => onAction("summary")}>
          <div className="coach-menu-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </div>
          <div>
            {pack ? "Tạo lại tài liệu tổng hợp" : "Tạo file ôn tập cho học viên"}
            <span>Slide + câu hỏi hay gặp từ chatlog</span>
          </div>
        </button>
        <button id="coach-review-pack" type="button" onClick={() => onAction("review")} disabled={!pack}>
          <div className="coach-menu-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 11 12 14 22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          </div>
          <div>
            Duyệt nội dung chatlog
            <span>{needsReviewCount} mục cần duyệt</span>
          </div>
        </button>
      </div>
    </>
  );
}

function SlideTutor({
  lesson,
  lessonId,
  deckId,
  role,
  lessons,
  pack,
  loadingPack,
  onSelectLesson,
}: {
  lesson?: LessonOption;
  lessonId: string;
  deckId: string;
  role: AppRole;
  lessons: LessonOption[];
  pack: ReviewPack | null;
  loadingPack: boolean;
  onSelectLesson: (id: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(starterChat);
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(1);
  const [sending, setSending] = useState(false);
  const [slideLoading, setSlideLoading] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) return;
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setMessage("");
    setSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lesson_id: lessonId, message: trimmed, current_slide_page: page, selected_text: "" }),
      });
      const data = (await res.json()) as { reply?: string; citations?: string };
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.reply || "VLười chưa trả lời được câu hỏi này.",
          citations: data.citations,
        },
      ]);
    } catch {
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: "Không kết nối được chatbot." }]);
    } finally {
      setSending(false);
    }
  };

  const iframeRef = useRef<HTMLIFrameElement>(null);

  const changePage = (newPage: number) => {
    setPage(newPage);
    if (iframeRef.current) {
      try {
        iframeRef.current.contentWindow?.location.replace(`/api/lessons/${lessonId}/slide#page=${newPage}`);
      } catch {
        // Fallback for cross-origin or navigation
      }
    }
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && typeof event.data === "object") {
        if ((event.data.type === "pagechanging" || event.data.type === "pagechanged") && typeof event.data.pageNumber === "number") {
          setPage(event.data.pageNumber);
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <main className={`reader-grid ${role === "labcoach" ? "coach-reader" : ""}`}>
      <aside className="reader-sidebar">
        <div className="sidebar-header">
          <h3>Học liệu môn học</h3>
          <p>Ngày học và slide đã thêm</p>
        </div>
        <div className="sidebar-lessons">
          {lessons.map((l, index) => (
            <div key={l.id} className={`sidebar-day ${l.id === lessonId ? "active" : ""}`}>
              <button
                id={`sidebar-day-${l.id}`}
                type="button"
                className="sidebar-day-btn"
                onClick={() => onSelectLesson(l.id)}
              >
                <span className="sidebar-day-num">DAY {dayNumber(index)}</span>
                <span className="sidebar-day-title">{l.title}</span>
                <span className={`sidebar-day-status ${l.status !== "missing" ? "ready" : "missing"}`}>
                  {l.status !== "missing" ? "PUBLISHED" : "CHƯA CÓ"}
                </span>
              </button>
              {l.id === lessonId && l.slideDecks && l.slideDecks.length > 0 && (
                <div className="sidebar-decks">
                  {l.slideDecks.map((deck) => (
                    <div key={deck.id} className={`sidebar-deck ${deck.id === deckId ? "active" : ""}`}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      <span>{deck.originalFilename}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        {pack && (
          <div className="sidebar-pack-info">
            <p className="sidebar-pack-label">Tài liệu tổng hợp</p>
            <span className="chip ready">Đã có · {pack.summary.filter((i) => i.status === "ready").length} ý chính</span>
          </div>
        )}
        {loadingPack && !pack && (
          <div className="sidebar-pack-info">
            <p className="sidebar-pack-label">Đang kiểm tra tài liệu...</p>
          </div>
        )}
      </aside>

      <section className="slide-stage">
        {slideLoading && (
          <div className="slide-loader">
            <div />
            <span>Đang tải slide...</span>
          </div>
        )}
        <iframe
          ref={iframeRef}
          title={lesson?.title || "Slide"}
          src={`/api/lessons/${lessonId}/slide`}
          onLoad={() => setSlideLoading(false)}
        />
      </section>

      {role === "student" && (
        <aside className="chat-pane">
          <div className="chat-head">
            <div className="chat-avatar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div>
              <h2>VLười Tutor</h2>
              <p>Trợ lý học theo ngữ cảnh</p>
            </div>
            <div className="chat-scope-tag">Toàn bộ slide & chatlog</div>
          </div>
          <div className="chat-log">
            {messages.map((item) => (
              <div key={item.id} className={`chat-bubble ${item.role}`}>
                <FormattedMarkdown content={item.content} />
                {item.citations && <small>{item.citations}</small>}
              </div>
            ))}
            {sending && (
              <div className="chat-bubble assistant">
                <div className="chat-typing">
                  <span /><span /><span />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <form className="chat-form" onSubmit={submit}>
            <input
              id="chat-input"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Nhập câu hỏi hoặc bôi đen tài liệu..."
            />
            <button className="send-btn" id="chat-send-btn" disabled={sending} type="submit" title="Gửi">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </form>
        </aside>
      )}
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
    <form className="upload-panel top-styled" id="upload-lesson-form" onSubmit={submit}>
      <div className="upload-panel-header">
        <div>
          <h4>Tạo ngày học mới</h4>
          <p>Nhập tên buổi học và tải lên 1 hoặc nhiều tệp PDF / PPTX slide bài giảng</p>
        </div>
      </div>
      <div className="upload-panel-fields">
        <input name="title" required placeholder="Tên ngày học mới (VD: Day 07 — Multi-Agent Systems)" className="upload-title-input" />
        <input
          name="files"
          required
          multiple
          type="file"
          accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
          className="upload-file-input"
        />
        <button className="btn primary" id="upload-submit-btn" disabled={uploading} type="submit">
          {uploading ? "Đang đọc nội dung..." : "Tạo bài học & đọc slide"}
        </button>
      </div>
    </form>
  );
}

function parseInlineFormatting(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return <code key={index} className="chat-inline-code">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

function FormattedMarkdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: ReactNode[] = [];
  let currentList: ReactNode[] = [];

  const flushList = (keyPrefix: string) => {
    if (currentList.length > 0) {
      elements.push(<ul key={`ul-${keyPrefix}-${elements.length}`} className="chat-list">{currentList}</ul>);
      currentList = [];
    }
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList(`${idx}`);
      return;
    }

    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const itemText = trimmed.slice(2);
      currentList.push(<li key={`li-${idx}`}>{parseInlineFormatting(itemText)}</li>);
      return;
    }

    flushList(`${idx}`);

    if (trimmed.startsWith("### ")) {
      elements.push(<h4 key={`h-${idx}`} className="chat-heading">{parseInlineFormatting(trimmed.slice(4))}</h4>);
    } else if (trimmed.startsWith("## ") || trimmed.startsWith("# ")) {
      elements.push(<h3 key={`h-${idx}`} className="chat-heading">{parseInlineFormatting(trimmed.replace(/^#+\s*/, ""))}</h3>);
    } else {
      elements.push(<p key={`p-${idx}`}>{parseInlineFormatting(line)}</p>);
    }
  });

  flushList("end");

  return <div className="chat-formatted-body">{elements}</div>;
}

function ProgressBadge({ lessons }: { lessons: LessonOption[] }) {
  const done = lessons.filter((l) => l.status !== "missing").length;
  const total = lessons.length || 1;
  const pct = Math.round((done / total) * 100);
  return (
    <div className="progress-badge">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <span>Đã có tài liệu {done}/{total}</span>
      <div className="progress-track slim">
        <i style={{ width: `${pct}%` }} />
      </div>
      <strong>{pct}%</strong>
    </div>
  );
}

function PanelHead({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="panel-head">
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
      {action}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <div className="section-label">{title}</div>
      {children}
    </>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}

function PanelLoading({ title }: { title: string }) {
  return (
    <div className="empty-state loading">
      <div className="loading-spinner" />
      <h2>{title}</h2>
      <p>Đang đồng bộ dữ liệu mới nhất...</p>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="skeleton-list">
      {Array.from({ length: 5 }).map((_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}

function StatCard({ value, label, sub }: { value: number | string; label: string; sub: string }) {
  return (
    <div className="stat-card">
      <strong>{value}</strong>
      <span>{label}</span>
      <small>{sub}</small>
    </div>
  );
}

function MiniStats({ values }: { values: [string, number][] }) {
  return (
    <div className="mini-stats">
      {values.map(([label, value]) => (
        <span key={label}>
          <strong>{value}</strong>
          {label}
        </span>
      ))}
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StudySummary({ item }: { item: SummaryItem }) {
  return (
    <article className="study-card">
      <div>
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
      <div>
        <h3>{item.topic}</h3>
        <span>{item.question_count} câu hỏi</span>
      </div>
      <p>
        <strong>Câu hỏi:</strong> {item.common_confusion}
      </p>
      <p>
        <strong>Trả lời & giải thích:</strong> {item.correct_understanding}
      </p>
      <div className="question-strip">
        {item.representative_questions.slice(0, 2).map((q) => (
          <span key={q}>{q}</span>
        ))}
      </div>
    </article>
  );
}

function ReviewInsight({ item, onUpdate }: { item: ClassInsight; onUpdate: (itemId: string, action: "approve" | "drop") => void }) {
  return (
    <ReviewCard
      id={item.id}
      status={item.status}
      title={item.topic}
      body={`Câu hỏi học viên thường hỏi: ${item.common_confusion}\n\nTrả lời & giải thích: ${item.correct_understanding}`}
      pages={item.source_pages}
      excerpt={item.source_excerpt}
      onUpdate={onUpdate}
    />
  );
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
      <header>
        <h3>{title}</h3>
        <span className={`chip ${status === "ready" ? "ready" : "review"}`}>{statusLabel(status)}</span>
      </header>
      {body.split("\n").filter(Boolean).map((line) => (
        <p key={line}>{line}</p>
      ))}
      <details className="evidence">
        <summary>{sourceLabel(pages)}</summary>
        <p>{excerpt || "Không có trích dẫn slide trực tiếp."}</p>
      </details>
      {status === "needs_review" ? (
        <div className="actions">
          <button className="btn primary" id={`approve-${id}`} onClick={() => onUpdate(id, "approve")}>
            Duyệt
          </button>
          <button className="btn ghost" id={`drop-${id}`} onClick={() => onUpdate(id, "drop")}>
            Bỏ khỏi PDF
          </button>
        </div>
      ) : null}
    </article>
  );
}

function PdfPreview({ pack }: { pack: ReviewPack }) {
  const summary = pack.summary.filter((item) => item.status === "ready");
  const insights = pack.class_insights.filter((item) => item.status === "ready");
  const questions = pack.review_questions.filter((item) => item.status === "ready");
  return (
    <article className="pdf-preview">
      <header>
        <strong>VLười - Tài liệu tổng hợp</strong>
        <span>{pack.pack_id}</span>
      </header>
      <h2>{pack.lesson.title}</h2>
      <p>{pack.lesson.slide_count} slide · {pack.analysis.unique_user_count} học viên · {pack.analysis.cluster_count} nhóm câu hỏi</p>
      <PdfBlock title="Kiến thức quan trọng" items={summary.map((item) => `${item.title}: ${item.content}`)} />
      <PdfBlock title="Học viên hay hỏi" items={insights.map((item) => `${item.topic}: ${item.correct_understanding}`)} />
      <PdfBlock title="Quiz nhanh" items={questions.map((item, i) => `${i + 1}. ${item.question} Đáp án: ${item.answer}`)} />
    </article>
  );
}

function PdfBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h3>{title}</h3>
      {items.length ? items.map((item) => <p key={item}>{item}</p>) : <p>Chưa có mục ready.</p>}
    </section>
  );
}

function ReviewPackPage({
  pack,
  lesson,
  loading,
  downloading,
  onDownload,
  onOpenReader,
}: {
  pack: ReviewPack | null;
  lesson?: LessonOption;
  loading: boolean;
  downloading: boolean;
  onDownload: () => void;
  onOpenReader: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"summary" | "insights" | "quiz">("summary");
  const [quizState, setQuizState] = useState<{ packId?: string; answers: Record<string, number> }>({ answers: {} });

  if (loading) {
    return (
      <div className="rp-loading">
        <div className="loading-spinner" />
        <p>Đang tải tài liệu tổng hợp...</p>
      </div>
    );
  }

  if (!pack) {
    return (
      <div className="rp-loading">
        <p>Chưa có tài liệu tổng hợp cho ngày học này.</p>
      </div>
    );
  }

  const summary = pack.summary.filter((i) => i.status === "ready");
  const insights = pack.class_insights.filter((i) => i.status === "ready");
  const questions = pack.review_questions.filter((i) => i.status === "ready");
  const selectedAnswers = quizState.packId === pack.pack_id ? quizState.answers : {};
  const answeredCount = questions.filter((item) => selectedAnswers[item.id] !== undefined).length;
  const correctCount = questions.filter((item) => selectedAnswers[item.id] === item.correct_option).length;

  const tabCounts = { summary: summary.length, insights: insights.length, quiz: questions.length };

  return (
    <div className="rp-shell">
      <div className="rp-hero">
        <div className="rp-hero-inner">
          <div className="rp-hero-badge">Tài liệu tổng hợp</div>
          <h1 className="rp-title">{pack.lesson.title}</h1>
          <p className="rp-subtitle">
            {pack.lesson.slide_count} slide đã phân tích · {summary.length} kiến thức trọng tâm · {insights.length} câu hỏi hay gặp · {questions.length} câu quiz nhanh
          </p>
          <div className="rp-hero-actions">
            <button className="btn primary" id="rp-reader-btn" type="button" onClick={onOpenReader}>
              Xem slide gốc
            </button>
            <button className="btn ghost" id="rp-pdf-btn" type="button" disabled={downloading} onClick={onDownload}>
              {downloading ? "Đang xuất..." : "Tải PDF"}
            </button>
          </div>
        </div>
        <div className="rp-stats-row">
          <div className="rp-stat"><strong>{summary.length}</strong><span>Ý chính từ slide</span></div>
          <div className="rp-stat-divider" />
          <div className="rp-stat"><strong>{insights.length}</strong><span>Điểm hay bị nhầm</span></div>
          <div className="rp-stat-divider" />
          <div className="rp-stat"><strong>{questions.length}</strong><span>Quiz nhanh</span></div>
        </div>
      </div>

      <div className="rp-body">
        <div className="rp-tabs">
          <button id="rp-tab-summary" className={`rp-tab ${activeTab === "summary" ? "active" : ""}`} type="button" onClick={() => setActiveTab("summary")}>
            Kiến thức trọng tâm<span className="rp-tab-count">{tabCounts.summary}</span>
          </button>
          <button id="rp-tab-insights" className={`rp-tab ${activeTab === "insights" ? "active" : ""}`} type="button" onClick={() => setActiveTab("insights")}>
            Học viên hay hỏi<span className="rp-tab-count">{tabCounts.insights}</span>
          </button>
          <button id="rp-tab-quiz" className={`rp-tab ${activeTab === "quiz" ? "active" : ""}`} type="button" onClick={() => setActiveTab("quiz")}>
            Quiz nhanh<span className="rp-tab-count">{tabCounts.quiz}</span>
          </button>
        </div>

        <div className="rp-content">
          {activeTab === "summary" && (
            <div className="rp-section">
              {summary.length === 0 && <div className="rp-empty">Chưa có kiến thức trọng tâm nào được phát hành.</div>}
              {summary.map((item, idx) => (
                <div key={item.id} className="rp-knowledge-card">
                  <div className="rp-knowledge-index">{String(idx + 1).padStart(2, "0")}</div>
                  <div className="rp-knowledge-body">
                    <div className="rp-knowledge-header">
                      <h3>{item.title}</h3>
                      {item.source_pages.length > 0 && (
                        <span className="rp-slide-ref">Slide {item.source_pages.join(", ")}</span>
                      )}
                    </div>
                    <p>{item.content}</p>
                    {item.source_excerpt && <blockquote className="rp-excerpt">{item.source_excerpt}</blockquote>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "insights" && (
            <div className="rp-section">
              {insights.length === 0 && <div className="rp-empty">Chưa có câu hỏi chatlog nào được phát hành.</div>}
              {insights.map((item) => (
                <div key={item.id} className="rp-insight-card">
                  <div className="rp-insight-header">
                    <div>
                      <h3>{item.topic}</h3>
                      <span className="rp-question-count">{item.question_count} học viên đã hỏi về điều này</span>
                    </div>
                    {item.source_pages.length > 0 && (
                      <span className="rp-slide-ref">Slide {item.source_pages.join(", ")}</span>
                    )}
                  </div>
                  <div className="rp-insight-blocks">
                    <div className="rp-insight-block wrong">
                      <div className="rp-block-label">Câu hỏi học viên thường hỏi</div>
                      <p>{item.common_confusion}</p>
                    </div>
                    <div className="rp-insight-arrow">→</div>
                    <div className="rp-insight-block correct">
                      <div className="rp-block-label">Trả lời & giải thích</div>
                      <p>{item.correct_understanding}</p>
                    </div>
                  </div>
                  {item.representative_questions.length > 0 && (
                    <div className="rp-sample-questions">
                      <p className="rp-sample-label">Câu hỏi ví dụ từ học viên</p>
                      <ul>{item.representative_questions.slice(0, 3).map((q) => <li key={q}>{q}</li>)}</ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeTab === "quiz" && (
            <div className="rp-section">
              {questions.length === 0 && <div className="rp-empty">Chưa có quiz nhanh nào được phát hành.</div>}
              {questions.length > 0 && (
                <div className="rp-quiz-score">
                  <strong>{answeredCount}/{questions.length}</strong>
                  <span>câu đã chọn · đúng {correctCount}</span>
                </div>
              )}
              {questions.map((item, idx) => {
                const selected = selectedAnswers[item.id];
                const answered = selected !== undefined;
                const isCorrect = selected === item.correct_option;
                return (
                <div key={item.id} className={`rp-quiz-card ${answered ? "revealed" : ""}`}>
                  <div className="rp-quiz-question">
                    <span className="rp-quiz-num">{idx + 1}</span>
                    <span className="rp-quiz-text">{item.question}</span>
                    {answered && <span className={`rp-quiz-result ${isCorrect ? "correct" : "wrong"}`}>{isCorrect ? "Đúng" : "Chưa đúng"}</span>}
                  </div>
                  {item.options.length > 0 && (
                    <div className="rp-quiz-options">
                      {item.options.map((opt, i) => (
                        <button
                          key={opt}
                          type="button"
                          className={`rp-quiz-option ${answered && i === item.correct_option ? "correct" : ""} ${answered && selected === i && i !== item.correct_option ? "wrong" : ""} ${selected === i ? "selected" : ""}`}
                          onClick={() => setQuizState((current) => ({
                            packId: pack.pack_id,
                            answers: {
                              ...(current.packId === pack.pack_id ? current.answers : {}),
                              [item.id]: i,
                            },
                          }))}
                        >
                          <span className="rp-option-letter">{String.fromCharCode(65 + i)}</span>
                          <span>{opt}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {answered && (
                    <div className="rp-quiz-answer">
                      <div className="rp-answer-label">{isCorrect ? "Kết quả đúng" : "Đáp án đúng"}</div>
                      <p><strong>{item.answer}</strong></p>
                      <p>{item.explanation || "Xem lại phần kiến thức trọng tâm và câu hỏi hay gặp liên quan."}</p>
                      {item.source_pages.length > 0 && (
                        <span className="rp-slide-ref">Slide {item.source_pages.join(", ")}</span>
                      )}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
