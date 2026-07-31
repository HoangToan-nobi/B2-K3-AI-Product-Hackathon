"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { ClassInsight, ReviewPack, ReviewQuestion, SummaryItem } from "@/lib/review-packs/types";

type AppRole = "student" | "labcoach";
type AppTheme = "light" | "dark";

type LessonOption = {
  id: string;
  title: string;
  slide_count: number;
  pack_id: string;
  status: string;
  source_type?: "demo" | "uploaded";
  slide_source_label?: string;
  chatlog_source_label?: string;
  day_code_label?: string;
};

type Notice = { tone: "error" | "success" | "info"; text: string };
type Severity = "high" | "medium" | "low";
type StudentChatMessage = { role: "student" | "assistant"; text: string; source?: string };

function sourceLabel(pages: number[]): string {
  return `Trang ${pages.join(", ")}`;
}

function shuffleQuestions(questions: ReviewQuestion[]): ReviewQuestion[] {
  const next = [...questions];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function statusLabel(status: string): string {
  return status === "needs_review" ? "Cần duyệt" : "Sẵn sàng";
}

function insightScore(topic: ClassInsight, maxUsers: number): number {
  const userWeight = (topic.unique_user_count / Math.max(1, maxUsers)) * 55;
  const questionWeight = Math.min(35, topic.question_count * 7);
  return Math.min(100, Math.round(userWeight + questionWeight));
}

function severityOf(topic: ClassInsight, maxUsers: number): Severity {
  const score = insightScore(topic, maxUsers);
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function severityLabel(level: Severity): string {
  if (level === "high") return "Ưu tiên cao";
  if (level === "medium") return "Theo dõi";
  return "Ổn định";
}

function issueType(topic: ClassInsight): string {
  const text = `${topic.topic} ${topic.common_confusion} ${topic.correct_understanding}`.toLowerCase();
  if (
    text.includes("tóm tắt")
    || text.includes("tom tat")
    || text.includes("tong quan")
    || text.includes("tổng quan")
    || text.includes("nội dung chính")
    || text.includes("noi dung chinh")
    || text.includes("giải thích nội dung")
    || text.includes("giai thich noi dung")
    || text.includes("slide này")
    || text.includes("slide nay")
  ) return "Yêu cầu đọc hiểu slide";
  if (text.includes("không đề cập") || text.includes("không liên quan") || text.includes("logistics")) return "Ngoài phạm vi / cần lọc";
  if (text.includes("nhầm trang") || text.includes("slide 18") || text.includes("chưa rõ")) return "Slide dễ gây nhầm";
  if (text.includes("giải thích") || text.includes("khái niệm") || text.includes("phân biệt")) return "Chưa hiểu khái niệm";
  return "Cần thêm ví dụ";
}

function teacherAction(topic: ClassInsight): string {
  const type = issueType(topic);
  if (type === "Yêu cầu đọc hiểu slide") return "Không tự động đưa vào phần ôn kỹ. Dùng tín hiệu này để cải thiện học liệu toàn bài nếu nhiều học viên hỏi.";
  if (type === "Slide dễ gây nhầm") return "Trao đổi giảng viên để làm rõ slide hoặc thêm note dẫn đường.";
  if (type === "Ngoài phạm vi / cần lọc") return "Không đưa vào bài giảng chính; dùng để chỉnh hướng dẫn đặt câu hỏi.";
  if (type === "Chưa hiểu khái niệm") return "Nên giảng lại bằng ví dụ ngắn và kiểm tra hiểu ngay sau phần này.";
  return "Nên bổ sung ví dụ thực tế hoặc bài tập nhỏ cho khoá sau.";
}

function shouldSuggestForStudentPack(topic: ClassInsight): boolean {
  const type = issueType(topic);
  return topic.status === "ready" && type !== "Yêu cầu đọc hiểu slide" && type !== "Ngoài phạm vi / cần lọc";
}

function shouldCountAsClassBlindspot(topic: ClassInsight): boolean {
  const type = issueType(topic);
  return type !== "Yêu cầu đọc hiểu slide" && type !== "Ngoài phạm vi / cần lọc";
}

function explainPipelineError(job: { error?: string; stdout?: string; stderr?: string }): string {
  const detail = `${job.error || ""}\n${job.stdout || ""}\n${job.stderr || ""}`;
  if (detail.includes("pdftotext")) return "Thiếu pdftotext/Poppler trong PATH.";
  if (detail.includes("DEEPSEEK_API_KEY")) return "Thiếu DEEPSEEK_API_KEY trong codebase/pipeline/.env.";
  if (detail.includes("DeepSeek API")) return "DeepSeek API trả lỗi hoặc network không gọi được.";
  return "Pipeline thật lỗi, backend dùng artifact có sẵn.";
}

export default function Home() {
  const [role, setRole] = useState<AppRole>("labcoach");
  const [theme, setTheme] = useState<AppTheme>("dark");
  const [view, setView] = useState("lessons");
  const [lessons, setLessons] = useState<LessonOption[]>([]);
  const [selectedLessonId, setSelectedLessonId] = useState("day1-foundation");
  const [pack, setPack] = useState<ReviewPack | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [processing, setProcessing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [expandedInsights, setExpandedInsights] = useState<string[]>([]);
  const [openQA, setOpenQA] = useState<string[]>([]);
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [uploadingLesson, setUploadingLesson] = useState(false);
  const [publishedPacks, setPublishedPacks] = useState<Record<string, ReviewPack>>({});

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("vluoi-theme");
    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
      return;
    }
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(prefersDark ? "dark" : "light");
  }, []);

  useEffect(() => {
    try {
      const savedPublished = window.localStorage.getItem("vluoi-published-packs");
      if (savedPublished) setPublishedPacks(JSON.parse(savedPublished) as Record<string, ReviewPack>);
    } catch {
      setPublishedPacks({});
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("vluoi-theme", theme);
  }, [theme]);

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
  }, [role, selectedLessonId, catalogVersion]);

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

  useEffect(() => {
    if (role !== "student") return;
    const releasedLessons = lessons.filter((lesson) => publishedPacks[lesson.id]);
    if (releasedLessons.length && !publishedPacks[selectedLessonId]) {
      setSelectedLessonId(releasedLessons[0].id);
    }
  }, [lessons, publishedPacks, role, selectedLessonId]);

  const selectedLesson = lessons.find((lesson) => lesson.id === selectedLessonId);
  const publishedPack = publishedPacks[selectedLessonId] || null;
  const visibleStatusPack = role === "student" ? publishedPack : pack;
  const studentLessons = lessons.filter((lesson) => publishedPacks[lesson.id]);
  const topics = useMemo(() => {
    return [...(pack?.class_insights || [])].sort(
      (a, b) => b.unique_user_count - a.unique_user_count || b.question_count - a.question_count,
    );
  }, [pack]);
  const maxUsers = Math.max(1, ...topics.map((topic) => topic.unique_user_count));
  const coachReadySummary = pack?.summary.filter((item) => item.status === "ready") || [];
  const coachReadyInsights = pack?.class_insights.filter((item) => shouldSuggestForStudentPack(item)) || [];
  const coachReadyQuestions = pack?.review_questions.filter((item) => item.status === "ready") || [];
  const studentReadySummary = publishedPack?.summary.filter((item) => item.status === "ready") || [];
  const studentReadyInsights = publishedPack?.class_insights.filter((item) => shouldSuggestForStudentPack(item)) || [];
  const studentReadyQuestions = publishedPack?.review_questions.filter((item) => item.status === "ready") || [];
  const needsReviewCount = pack
    ? [...pack.summary, ...pack.class_insights, ...pack.review_questions].filter((item) => item.status === "needs_review").length
    : 0;

  const changeRole = (nextRole: AppRole) => {
    setRole(nextRole);
    setView(nextRole === "student" ? "review" : "lessons");
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
      const data = (await res.json()) as { pack?: ReviewPack; job?: { mode: string; note?: string; error?: string; stdout?: string; stderr?: string }; error?: string };
      if (!res.ok || !data.pack || !data.job) throw new Error(data.error || "create failed");
      setPack(data.pack);
      setNotice({
        tone: "success",
        text: data.job.mode === "pipeline"
          ? "Pipeline đã chạy lại và tạo review pack mới."
          : data.job.note
            ? data.job.note
          : data.job.mode === "pipeline_failed_fallback"
            ? `${explainPipelineError(data.job)} Backend dùng artifact có sẵn để demo tiếp.`
            : selectedLesson?.source_type === "uploaded"
              ? "Đã tải pack hiện có của buổi đang chọn."
              : "Đã tải pack demo từ artifact local.",
      });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Không tạo được review pack. Kiểm tra API key hoặc artifact pipeline." });
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
      setNotice({ tone: "success", text: action === "approve" ? "Đã chọn đưa mục này vào pack học viên." : "Đã bỏ mục này khỏi phần gửi học viên." });
    } catch {
      setNotice({ tone: "error", text: "Không cập nhật được mục review." });
    }
  };

  const publishToStudents = () => {
    if (!pack || role !== "labcoach") return;
    const publishedSnapshot = JSON.parse(JSON.stringify(pack)) as ReviewPack;
    setPublishedPacks((prev) => {
      const next = { ...prev, [selectedLessonId]: publishedSnapshot };
      window.localStorage.setItem("vluoi-published-packs", JSON.stringify(next));
      return next;
    });
    setNotice({ tone: "success", text: "Đã xác nhận và đồng bộ gói ôn tập này sang giao diện học viên." });
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

        {role === "student" && (
          <>
            <div className="sb-section-label">Buổi ôn tập</div>
            <select
              className="lesson-select"
              value={publishedPack ? selectedLessonId : ""}
              onChange={(event) => {
                setSelectedLessonId(event.target.value);
                setView("review");
              }}
            >
              {!studentLessons.length && <option value="">Chưa có buổi nào được gửi</option>}
              {studentLessons.length > 0 && !publishedPack && <option value="">Chọn buổi đã được gửi</option>}
              {studentLessons.map((lesson) => (
                <option key={lesson.id} value={lesson.id}>{lesson.title}</option>
              ))}
            </select>
          </>
        )}

        <div className="sb-section-label">{role === "student" ? "Không gian" : "Điều hướng"}</div>
        <nav className="sb-nav" aria-label="Điều hướng chức năng">
          {role === "student" ? (
            <>
              <NavButton id="review" view={view} setView={setView} label="Học liệu ôn tập" count={studentReadySummary.length + studentReadyInsights.length} />
              <NavButton id="slides" view={view} setView={setView} label="Xem slide" count={publishedPack?.lesson.slide_count || 0} />
              <NavButton id="chatbot" view={view} setView={setView} label="Chatbot ôn tập" />
              <NavButton id="quiz" view={view} setView={setView} label="Làm quiz" count={studentReadyQuestions.length} />
            </>
          ) : (
            <>
              <NavButton id="lessons" view={view} setView={setView} label="1. Upload/Sửa/Xoá buổi học" count={lessons.length} />
              <NavButton id="generate" view={view} setView={setView} label="2. Dữ liệu vào" count={selectedLesson?.slide_count || 0} />
              <NavButton id="dashboard" view={view} setView={setView} label="3. Phân tích lớp" count={pack?.analysis.cluster_count || 0} />
              <NavButton id="blindspot" view={view} setView={setView} label="4. Duyệt nội dung" count={needsReviewCount} />
              <NavButton id="release" view={view} setView={setView} label="5. Gửi học viên" count={coachReadyQuestions.length} />
            </>
          )}
        </nav>

        <div className="sb-spacer" />
        <div className="sb-user">
          <div className="avatar">{role === "student" ? "HV" : "LC"}</div>
          <div>
            <div className="name">{role === "student" ? "Học viên demo" : "Lab Coach demo"}</div>
            <div className="role">{role === "student" ? "Ôn tập sau buổi học" : "Theo dõi lớp sau buổi học"}</div>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>{role === "student" ? "Không gian ôn tập" : "VLười cho Lab Coach"}</h1>
            <p>{selectedLesson?.title || "Đang tải buổi học"}</p>
          </div>
          <div className="topbar-actions">
            <button
              type="button"
              className="theme-toggle"
              aria-label={theme === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
              aria-pressed={theme === "dark"}
              onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}
            >
              <span className="theme-toggle-icon">{theme === "dark" ? "☾" : "☀"}</span>
              <span>{theme === "dark" ? "Dark" : "Light"}</span>
            </button>
            <div className={`status-pill ${visibleStatusPack?.status === "needs_review" || !visibleStatusPack ? "review" : "ready"}`}>
              {visibleStatusPack ? statusLabel(visibleStatusPack.status) : role === "student" ? "Chưa gửi" : "Đang tải"}
            </div>
          </div>
        </header>

        <div className="content">
          {notice && <div className={`notice notice-${notice.tone}`}>{notice.text}</div>}
          {role === "student" ? (
            <StudentWorkspace
              view={view}
              pack={publishedPack}
              lesson={selectedLesson}
              readySummary={studentReadySummary}
              readyInsights={studentReadyInsights}
              readyQuestions={studentReadyQuestions}
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
              publishToStudents={publishToStudents}
              updateItem={updateItem}
              publishedPack={publishedPack}
              selectedLesson={selectedLesson}
              setSelectedLessonId={setSelectedLessonId}
              refreshCatalog={() => setCatalogVersion((version) => version + 1)}
              setNotice={setNotice}
              setPack={setPack}
              lessons={lessons}
              uploadingLesson={uploadingLesson}
              setUploadingLesson={setUploadingLesson}
              setView={setView}
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
  count?: number;
}) {
  return (
    <button type="button" className={`sb-item ${view === id ? "active" : ""}`} onClick={() => setView(id)}>
      <span>{label}</span>
      {typeof count === "number" && <span className="count">{count}</span>}
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
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizStarted, setQuizStarted] = useState(false);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizOrder, setQuizOrder] = useState<ReviewQuestion[]>([]);
  const [chatMessages, setChatMessages] = useState<StudentChatMessage[]>([
    {
      role: "assistant",
      text: `Bạn có thể hỏi lại các phần trong ${lesson?.title || "buổi học này"}. Mình sẽ trả lời dựa trên review pack đã duyệt và luôn kèm trang nguồn nếu tìm thấy.`,
    },
  ]);

  useEffect(() => {
    setChatInput("");
    setQuizAnswers({});
    setQuizStarted(false);
    setQuizSubmitted(false);
    setQuizOrder([]);
    setChatMessages([
      {
        role: "assistant",
        text: `Bạn có thể hỏi lại các phần trong ${lesson?.title || "buổi học này"}. Mình sẽ trả lời dựa trên review pack đã duyệt và luôn kèm trang nguồn nếu tìm thấy.`,
      },
    ]);
  }, [lesson?.title, pack?.pack_id]);

  if (!pack) return <EmptyState title="Chưa có gói ôn tập được gửi" text="Lab Coach cần vào bước cuối cùng, kiểm tra toàn bộ tài liệu và bấm xác nhận gửi thì học viên mới nhìn thấy nội dung của buổi này." />;

  const startQuizAttempt = () => {
    setQuizAnswers({});
    setQuizSubmitted(false);
    setQuizStarted(true);
    setQuizOrder(shuffleQuestions(readyQuestions));
  };

  const askGroundedTutor = async () => {
    const question = chatInput.trim();
    if (!question || chatBusy) return;
    setChatBusy(true);
    setChatMessages((prev) => [...prev, { role: "student", text: question }]);
    setChatInput("");
    try {
      const res = await fetch(`/api/review-packs/${pack.pack_id}/qa`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-vluoi-role": "student" },
        body: JSON.stringify({ question }),
      });
      const data = (await res.json()) as { answer?: string; citations?: number[]; error?: string };
      if (!res.ok) throw new Error(data.error || "QA failed");
      setChatMessages((prev) => [...prev, {
        role: "assistant",
        text: data.answer || "Mình chưa có câu trả lời.",
        source: data.citations?.length ? sourceLabel(data.citations) : undefined,
      }]);
    } catch {
      setChatMessages((prev) => [...prev, { role: "assistant", text: "Mình chưa thể trả lời lúc này. Bạn thử lại sau hoặc hỏi Lab Coach để được hỗ trợ." }]);
    } finally {
      setChatBusy(false);
    }
  };

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

  if (view === "chatbot") {
    return (
      <section className="workspace">
        <PageHead
          title="Chatbot ôn tập"
          text="Hỏi lại mọi kiến thức liên quan trong buổi học. Chatbot trả lời dựa trên học liệu đã duyệt, nội dung slide và dẫn nguồn khi tìm thấy."
        />
        <div className="chatbot-intro">
          <div>
            <h3>Muốn hỏi lại phần nào cũng được.</h3>
            <p>Gợi ý: hỏi theo khái niệm, theo trang slide, hoặc theo chỗ bạn vừa làm quiz sai. Mình sẽ trả lời bằng ngôn ngữ dễ hiểu trước, rồi nối lại với kiến thức gốc.</p>
          </div>
          <div className="chatbot-suggestions" aria-label="Gợi ý câu hỏi ôn tập">
            {[
              "Tóm lại các ý quan trọng nhất của buổi này",
              "Giải thích phần dễ nhầm bằng ví dụ đơn giản",
              "Nếu em chỉ có 10 phút ôn thì nên học gì trước?",
            ].map((prompt) => (
              <button key={prompt} type="button" onClick={() => setChatInput(prompt)}>{prompt}</button>
            ))}
          </div>
        </div>
        <StudentGroundedChat
          messages={chatMessages}
          value={chatInput}
          setValue={setChatInput}
          onAsk={askGroundedTutor}
          busy={chatBusy}
        />
      </section>
    );
  }

  if (view === "quiz") {
    return (
      <section className="workspace">
        <PageHead
          title="Quiz ôn tập"
          text="Bắt đầu khi bạn sẵn sàng. Mỗi lần vào làm lại, hệ thống sẽ đảo thứ tự câu hỏi để việc ôn tập giống một lượt kiểm tra mới."
        />
        <StudentQuiz
          questions={quizOrder}
          totalQuestions={readyQuestions.length}
          started={quizStarted}
          submitted={quizSubmitted}
          answers={quizAnswers}
          setAnswers={setQuizAnswers}
          onStart={startQuizAttempt}
          onRestart={startQuizAttempt}
          onSubmit={() => setQuizSubmitted(true)}
        />
      </section>
    );
  }

  return (
    <section className="workspace">
      <PageHead
        title="Hôm nay cần ôn gì?"
        text="VLười tạo học liệu trọng tâm đầy đủ từ slide và chỉ đưa vào phần ôn kỹ những câu hỏi/điểm vướng đã được Lab Coach chọn sau khi rà soát."
      />
      <div className="stat-row">
        <Stat value={pack.lesson.slide_count} label="slide nguồn" />
        <Stat value={readySummary.length} label="mục học liệu" />
        <Stat value={readyInsights.length} label="mục coach chọn ôn kỹ" />
        <Stat value={readyQuestions.length} label="câu tự kiểm tra" />
      </div>

      <StudentLearningMap summary={readySummary} insights={readyInsights} />

      <div className="section-label">1. Học liệu trọng tâm đầy đủ từ slide</div>
      {readySummary.map((item) => <StudySummary key={item.id} item={item} />)}

      <div className="section-label">2. Câu hỏi/điểm vướng được Coach chọn để ôn kỹ</div>
      {readyInsights.map((item) => <StudyInsight key={item.id} item={item} />)}
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
  publishToStudents,
  updateItem,
  publishedPack,
  selectedLesson,
  setSelectedLessonId,
  refreshCatalog,
  setNotice,
  setPack,
  lessons,
  uploadingLesson,
  setUploadingLesson,
  setView,
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
  publishToStudents: () => void;
  updateItem: (itemId: string, action: "approve" | "drop") => void;
  publishedPack: ReviewPack | null;
  selectedLesson?: LessonOption;
  setSelectedLessonId: (lessonId: string) => void;
  refreshCatalog: () => void;
  setNotice: (notice: Notice | null) => void;
  setPack: (pack: ReviewPack) => void;
  lessons: LessonOption[];
  uploadingLesson: boolean;
  setUploadingLesson: (value: boolean) => void;
  setView: (view: string) => void;
}) {
  if (!pack) return <EmptyState title="Chưa có dữ liệu" text="Tải review pack từ artifact hoặc chạy lại pipeline." />;
  const releaseSummary = pack.summary.filter((item) => item.status === "ready");
  const releaseInsights = pack.class_insights.filter((item) => shouldSuggestForStudentPack(item));
  const releaseQuestions = pack.review_questions.filter((item) => item.status === "ready");
  const hasPublishedVersion = Boolean(publishedPack);
  const draftChangedAfterPublish = hasPublishedVersion && JSON.stringify(publishedPack) !== JSON.stringify(pack);

  const addSummary = async () => {
    const title = window.prompt("Tên nội dung trọng tâm mới:");
    if (!title) return;
    const content = window.prompt("Nội dung học liệu/giải thích:");
    if (!content) return;
    const pagesRaw = window.prompt("Trang nguồn, ví dụ: 3 hoặc 3,4:", "1") || "1";
    const source_pages = pagesRaw.split(",").map((item) => Number(item.trim())).filter((page) => Number.isFinite(page) && page > 0);
    const res = await fetch(`/api/review-packs/${pack.pack_id}/summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-vluoi-role": "labcoach" },
      body: JSON.stringify({ title, content, source_pages, source_excerpt: "Lab Coach thêm thủ công từ slide.", status: "needs_review" }),
    });
    if (!res.ok) {
      setNotice({ tone: "error", text: "Không thêm được nội dung trọng tâm." });
      return;
    }
    const data = (await res.json()) as { pack: ReviewPack };
    setPack(data.pack);
    setNotice({ tone: "success", text: "Đã thêm nội dung trọng tâm. Hãy duyệt trước khi gửi học viên." });
    refreshCatalog();
  };

  const editSummary = async (item: SummaryItem) => {
    const title = window.prompt("Sửa tiêu đề:", item.title);
    if (title === null) return;
    const content = window.prompt("Sửa nội dung:", item.content);
    if (content === null) return;
    const pagesRaw = window.prompt("Sửa trang nguồn:", item.source_pages.join(",")) || item.source_pages.join(",");
    const source_pages = pagesRaw.split(",").map((entry) => Number(entry.trim())).filter((page) => Number.isFinite(page) && page > 0);
    const res = await fetch(`/api/review-packs/${pack.pack_id}/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-vluoi-role": "labcoach" },
      body: JSON.stringify({ action: "edit", title, content, source_pages, source_excerpt: item.source_excerpt, status: "needs_review" }),
    });
    if (!res.ok) {
      setNotice({ tone: "error", text: "Không sửa được nội dung trọng tâm." });
      return;
    }
    const data = (await res.json()) as { pack: ReviewPack };
    setPack(data.pack);
    setNotice({ tone: "success", text: "Đã sửa nội dung trọng tâm. Mục này cần duyệt lại trước khi gửi." });
    refreshCatalog();
  };

  const bulkUpdateInsights = async (action: "approve" | "drop") => {
    const message = action === "approve"
      ? "Duyệt tất cả điểm cả lớp thường vướng để đưa vào pack học viên?"
      : "Không gửi toàn bộ điểm cả lớp thường vướng cho học viên?";
    if (!window.confirm(message)) return;

    let latestPack = pack;
    for (const insight of pack.class_insights.filter((item) => shouldCountAsClassBlindspot(item))) {
      const res = await fetch(`/api/review-packs/${pack.pack_id}/items/${insight.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-vluoi-role": "labcoach" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        setNotice({ tone: "error", text: "Không cập nhật được toàn bộ mục cả lớp thường vướng." });
        return;
      }
      const data = (await res.json()) as { pack: ReviewPack };
      latestPack = data.pack;
    }
    setPack(latestPack);
    refreshCatalog();
    setNotice({
      tone: "success",
      text: action === "approve"
        ? "Đã duyệt tất cả điểm cả lớp thường vướng vào pack học viên."
        : "Đã chuyển toàn bộ điểm cả lớp thường vướng sang trạng thái không gửi học viên.",
    });
  };

  if (view === "lessons") {
    return (
      <section className="workspace">
        <LessonManager
          lessons={lessons}
          selectedLesson={selectedLesson}
          setSelectedLessonId={setSelectedLessonId}
          refreshCatalog={refreshCatalog}
          setNotice={setNotice}
          uploadingLesson={uploadingLesson}
          setUploadingLesson={setUploadingLesson}
        />
      </section>
    );
  }

  if (view === "generate") {
    const isUploadedLesson = selectedLesson?.source_type === "uploaded";
    return (
      <section className="workspace">
        <PageHead title="Dữ liệu đầu vào của buổi đang chọn" text="Xem đúng slide, chatlog và cách VLười map dữ liệu của riêng buổi học đang được chọn. Muốn upload/sửa/xoá buổi học, vào bước 1." />
        <div className="action-panel">
          <div>
            <h3>{pack.lesson.title}</h3>
            <p>{pack.lesson.slide_count} slide, {pack.analysis.student_question_count} tin nhắn liên quan, {pack.analysis.unique_user_count} học viên đã ẩn danh.</p>
          </div>
          <div className="action-row">
            <button className="btn btn-primary" disabled={processing} onClick={() => handleGenerate(false)}>
              {processing ? "Đang tải..." : isUploadedLesson ? "Tải pack của buổi này" : "Tải pack demo"}
            </button>
            <button className="btn btn-ghost" disabled={processing} onClick={() => handleGenerate(true)}>
              Chạy lại AI
            </button>
          </div>
        </div>
        {processing && <div className="processing-box"><span className="spinner" />Backend đang chạy AI live và kiểm tra grounding. Lần chạy chuẩn có thể mất 1–2 phút; nếu API vẫn quá chậm, hệ thống mới tự tạo bản fallback từ slide.</div>}

        <InputDemo pack={pack} topics={topics} selectedLesson={selectedLesson} />
      </section>
    );
  }

  if (view === "tutor") {
    return (
      <section className="workspace">
        <PageHead title="Các câu hỏi đã được gom nhóm" text="Màn chi tiết cho Lab Coach kiểm tra từng nhóm câu hỏi nếu muốn xem sâu hơn." />
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
        <PageHead title="Duyệt trước khi gửi" text="Các mục chưa chắc chắn sẽ không tự động gửi cho học viên. Lab Coach duyệt hoặc bỏ khỏi bản phát hành." />
        <div className="stat-row compact">
          <Stat value={needsReviewCount} label="mục cần duyệt" />
          <Stat value={pack.warnings.length} label="cảnh báo" />
          <Stat value={pack.analysis.excluded_noise_count} label="tin nhiễu đã loại" />
        </div>

        <div className="section-label">Nội dung trọng tâm đầy đủ từ slide</div>
        <SummaryCoverage pack={pack} />
        <div className="coach-edit-note">
          <div>
            <strong>Lab Coach rà soát trước khi gửi</strong>
            <p>AI viết học liệu theo toàn bộ bài học, nhưng Lab Coach có quyền thêm, sửa hoặc xoá từng mục để đảm bảo đầy đủ và dễ hiểu cho học viên.</p>
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={addSummary}>Thêm mục trọng tâm</button>
        </div>
        {pack.summary.map((item) => <SummaryCard key={item.id} item={item} onUpdate={updateItem} onEdit={editSummary} />)}

        <div className="section-label">Điểm cả lớp thường vướng</div>
        <div className="coach-edit-note">
          <div>
            <strong>Lab Coach quyết định phần nào được đưa cho học viên</strong>
            <p>Không phải câu hỏi nào nhiều lượt cũng là trọng tâm. Có thể duyệt hàng loạt, sau đó sửa/bỏ từng mục nếu cần.</p>
          </div>
          <div className="action-row">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => bulkUpdateInsights("approve")}>Duyệt tất cả</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => bulkUpdateInsights("drop")}>Không gửi tất cả</button>
          </div>
        </div>
        {pack.class_insights.filter((item) => shouldCountAsClassBlindspot(item)).map((item) => <InsightCard key={item.id} item={item} onUpdate={updateItem} />)}

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
        <PageHead title="Xác nhận gói gửi học viên" text="Đây là bước chốt cuối cùng. Lab Coach kiểm tra toàn bộ học liệu, điểm vướng và quiz; chỉ sau khi bấm xác nhận thì bên học viên mới đồng bộ bản này." />
        <div className="release-confirm">
          <div>
            <span>Trạng thái đồng bộ</span>
            <h3>{!hasPublishedVersion ? "Chưa gửi buổi này cho học viên" : draftChangedAfterPublish ? "Bản nháp đã thay đổi, cần gửi lại" : "Bản nháp đang khớp với học viên"}</h3>
            <p>
              Bản nháp hiện có {releaseSummary.length} mục học liệu, {releaseInsights.length} điểm ôn kỹ và {releaseQuestions.length} câu quiz sẵn sàng gửi.
              Nếu Lab Coach sửa/duyệt thêm, học viên chỉ thấy thay đổi sau khi xác nhận gửi lại.
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={publishToStudents}>
            Xác nhận gửi & đồng bộ học viên
          </button>
        </div>
        <ReleaseChecklist summary={releaseSummary} insights={releaseInsights} questions={releaseQuestions} />
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
      <LearningIntelligenceDashboard
        pack={pack}
        topics={topics}
        maxUsers={maxUsers}
        needsReviewCount={needsReviewCount}
      />
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

function LearningIntelligenceDashboard({
  pack,
  topics,
  maxUsers,
  needsReviewCount,
}: {
  pack: ReviewPack;
  topics: ClassInsight[];
  maxUsers: number;
  needsReviewCount: number;
}) {
  const blindspotTopics = topics.filter((topic) => shouldCountAsClassBlindspot(topic));
  const severeTopics = blindspotTopics
    .map((topic) => ({ topic, score: insightScore(topic, maxUsers), severity: severityOf(topic, maxUsers) }))
    .sort((a, b) => b.score - a.score);
  const topTopics = severeTopics.slice(0, 5);
  const hotSlides = Array.from({ length: pack.lesson.slide_count }, (_, index) => {
    const page = index + 1;
    const count = blindspotTopics
      .filter((topic) => topic.source_pages.includes(page))
      .reduce((total, topic) => total + topic.question_count, 0);
    const users = blindspotTopics
      .filter((topic) => topic.source_pages.includes(page))
      .reduce((total, topic) => total + topic.unique_user_count, 0);
    return { page, count, users };
  });
  const maxSlideCount = Math.max(1, ...hotSlides.map((slide) => slide.count));
  const primaryBrief = topTopics.slice(0, 3);
  const highCount = severeTopics.filter((item) => item.severity === "high").length;
  const firstTopic = primaryBrief[0]?.topic;
  const noStudentLogs = pack.analysis.student_question_count === 0;
  const needsAiRun = pack.analysis.student_question_count > 0 && pack.analysis.cluster_count === 0;

  return (
    <>
      <PageHead
        title="Hôm nay lớp chưa hiểu gì?"
        text="Sau buổi học, VLười đọc slide và chatlog để chỉ ra phần nhiều học viên đang vướng, slide cần chú ý và nội dung nên gửi lại cho học viên."
      />
      <div className="stat-row">
        <Stat value={pack.lesson.slide_count} label="slide trong bài" />
        <Stat value={pack.analysis.student_question_count} label="câu hỏi đã đọc" />
        <Stat value={pack.analysis.unique_user_count} label="học viên có hỏi" />
        <Stat value={highCount} label="điểm cần chú ý" />
      </div>

      {noStudentLogs && (
        <div className="notice notice-error">
          Chưa có log học viên nào được nhận cho buổi này. Thường là do nhập sai day_codes so với cột day_code trong CSV, hoặc CSV không đúng schema. Hãy upload lại và để trống day_codes nếu muốn nhận toàn bộ CSV.
        </div>
      )}

      {needsAiRun && (
        <div className="notice notice-info">
          Chatlog đã được nhận, nhưng chưa có cluster phân tích lớp. Vào mục Dữ liệu vào và bấm Chạy lại AI để tạo các chủ đề học viên đang vướng.
        </div>
      )}

      <div className="simple-actions">
        <div className="simple-action primary">
          <span>Chỗ cần xử lý trước</span>
          <strong>{firstTopic?.topic || "Chưa có dữ liệu"}</strong>
          <p>{firstTopic ? `${firstTopic.unique_user_count} học viên hỏi · ${sourceLabel(firstTopic.source_pages)}` : noStudentLogs ? "Chưa nhận được log học viên từ CSV." : "Chạy lại AI để xem phân tích."}</p>
        </div>
        <div className="simple-action">
          <span>Gửi cho học viên</span>
          <strong>{pack.summary.filter((item) => item.status === "ready").length} mục học liệu + {pack.review_questions.filter((item) => item.status === "ready").length} câu tự kiểm tra</strong>
          <p>Chỉ gửi nội dung đã có nguồn từ slide và đã sẵn sàng.</p>
        </div>
        <div className="simple-action">
          <span>Bỏ qua khi tính vướng mắc</span>
          <strong>{topics.length - blindspotTopics.length} cụm đọc hiểu/tóm tắt slide</strong>
          <p>Các câu kiểu “giải thích/tóm tắt slide này” không được tính là misconception của lớp.</p>
        </div>
      </div>

      <div className="brief-banner">
        <div>
          <div className="brief-kicker">Tóm tắt cho Lab Coach</div>
          <h3>Cần trao đổi với giảng viên về {firstTopic?.topic || "các điểm học viên đang vướng"}</h3>
          <p>
            VLười phát hiện {pack.analysis.cluster_count} cụm câu hỏi, trong đó {needsReviewCount} mục cần Lab Coach duyệt trước khi phát hành.
            Các chủ đề ưu tiên cao nên được đưa vào phần ôn kỹ hoặc trao đổi thêm nếu Lab Coach thấy cần.
          </p>
        </div>
        <div className="brief-score">
          <span>{Math.round((pack.analysis.included_cluster_count / Math.max(1, pack.analysis.cluster_count)) * 100)}%</span>
          <small>nội dung dùng được</small>
        </div>
      </div>

      <div className="operational-note">
        <strong>Đọc đúng mức độ:</strong> đây là điểm ưu tiên tương đối trong các học viên có dữ liệu hỏi, không phải tỷ lệ của toàn lớp.
        Muốn báo cáo tỷ lệ toàn lớp, cần bổ sung sĩ số/roster của buổi học; hiện hệ thống không suy đoán phần đó.
      </div>

      <div className="section-label">Độ phủ học liệu toàn bài</div>
      <SummaryCoverage pack={pack} />

      <div className="section-label">1. Các phần nhiều bạn hỏi nhất</div>
      <div className="intelligence-grid">
        <div className="rank-panel wide">
          {topTopics.map(({ topic, score, severity }) => (
            <div key={topic.id} className={`rank-item sev-${severity}`}>
              <div className="rank-main">
                <div>
                  <div className="rank-title">{topic.topic}</div>
                  <div className="rank-sub">{issueType(topic)} · {sourceLabel(topic.source_pages)}</div>
                </div>
                <div className="rank-score">{score}</div>
              </div>
              <div className="topic-bar-track">
                <div className="topic-bar-fill" style={{ width: `${score}%` }} />
              </div>
              <div className="rank-meta">
                <span>{topic.unique_user_count} học viên · {topic.question_count} lượt hỏi</span>
                <span>{shouldSuggestForStudentPack(topic) ? "Đưa vào pack nếu Coach đồng ý" : "Chỉ dùng làm tín hiệu"}</span>
              </div>
            </div>
          ))}
        </div>

      </div>

      <div className="section-label">3. Slide nào cần chú ý?</div>
      <div className="slide-heatmap">
        {hotSlides.map((slide) => {
          const intensity = slide.count / maxSlideCount;
          const level = intensity > 0.66 ? "hot" : intensity > 0.33 ? "warm" : slide.count > 0 ? "mild" : "cold";
          return (
            <div key={slide.page} className={`slide-tile ${level}`}>
              <span>Trang {slide.page}</span>
              <strong>{slide.count}</strong>
              <small>{slide.users} tín hiệu</small>
            </div>
          );
        })}
      </div>

    </>
  );
}

function LessonManager({
  lessons,
  selectedLesson,
  setSelectedLessonId,
  refreshCatalog,
  setNotice,
  uploadingLesson,
  setUploadingLesson,
}: {
  lessons: LessonOption[];
  selectedLesson?: LessonOption;
  setSelectedLessonId: (lessonId: string) => void;
  refreshCatalog: () => void;
  setNotice: (notice: Notice | null) => void;
  uploadingLesson: boolean;
  setUploadingLesson: (value: boolean) => void;
}) {
  const isUploadedLesson = selectedLesson?.source_type === "uploaded";
  const canDeleteLesson = Boolean(selectedLesson && selectedLesson.id !== "day1-foundation");

  const uploadLesson = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    setUploadingLesson(true);
    setNotice(null);
    try {
      const form = new FormData(formElement);
      const res = await fetch("/api/lessons", {
        method: "POST",
        headers: { "x-vluoi-role": "labcoach" },
        body: form,
      });
      if (!res.ok) {
        const error = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(error.error || "upload failed");
      }
      const data = (await res.json()) as { lesson: { lesson_id: string } };
      setSelectedLessonId(data.lesson.lesson_id);
      refreshCatalog();
      setView("generate");
      setNotice({ tone: "success", text: "Đã upload buổi học thật. Hệ thống đã tự đọc số trang slide; bạn có thể chạy AI hoặc thêm/sửa nội dung trọng tâm trước khi gửi học viên." });
      formElement.reset();
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error
          ? `Không upload được: ${error.message}`
          : "Không upload được. Kiểm tra file slide PDF và chatlog CSV.",
      });
    } finally {
      setUploadingLesson(false);
    }
  };

  const renameLesson = async () => {
    if (!selectedLesson || !isUploadedLesson) return;
    const title = window.prompt("Tên mới cho buổi học:", selectedLesson.title);
    if (!title) return;
    const maxPage = Number(window.prompt("Số trang slide:", String(selectedLesson.slide_count)) || selectedLesson.slide_count);
    const res = await fetch(`/api/lessons/${selectedLesson.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-vluoi-role": "labcoach" },
      body: JSON.stringify({ title, max_page: maxPage }),
    });
    if (!res.ok) {
      setNotice({ tone: "error", text: "Không sửa được buổi học đã upload." });
      return;
    }
    refreshCatalog();
    setNotice({ tone: "success", text: "Đã cập nhật buổi học đã upload." });
  };

  const deleteLesson = async () => {
    if (!selectedLesson || !canDeleteLesson) return;
    if (!window.confirm(`Xoá buổi "${selectedLesson.title}" khỏi danh sách demo?`)) return;
    const res = await fetch(`/api/lessons/${selectedLesson.id}`, {
      method: "DELETE",
      headers: { "x-vluoi-role": "labcoach" },
    });
    if (!res.ok) {
      const error = (await res.json().catch(() => ({}))) as { error?: string };
      setNotice({ tone: "error", text: error.error || "Không xoá được buổi học." });
      return;
    }
    setSelectedLessonId("day1-foundation");
    refreshCatalog();
    setNotice({ tone: "success", text: "Đã xoá buổi học khỏi danh sách." });
  };

  return (
    <>
      <PageHead
        title="Quản lý buổi học"
        text="Lab Coach upload dữ liệu thật, chọn buổi cần phân tích, đổi tên hoặc xoá những buổi đã upload."
      />
      <div className="section-label">Upload buổi học thật</div>
      <form className="upload-panel" onSubmit={uploadLesson}>
        <div>
          <label>Tên buổi học</label>
          <input name="title" placeholder="Ví dụ: Day 2 - Prompt Engineering" required />
        </div>
        <div>
          <label>Slide PDF</label>
          <input name="slide_pdf" type="file" accept="application/pdf" required />
        </div>
        <div>
          <label>Chatlog CSV</label>
          <input name="chatlog_csv" type="file" accept=".csv,text/csv" required />
        </div>
        <div>
          <label>Day codes nếu cần lọc</label>
          <input name="day_codes" placeholder="Để trống = nhận toàn bộ CSV, hoặc Day 1,Day1-C302" />
        </div>
        <button type="submit" className="btn btn-primary" disabled={uploadingLesson}>
          {uploadingLesson ? "Đang upload..." : "Upload buổi học"}
        </button>
      </form>

      <div className="lesson-manage">
        <div>
          <strong>{selectedLesson?.title || "Chưa chọn buổi học"}</strong>
          <p>
            {selectedLesson?.id === "day1-foundation"
              ? "Buổi demo mặc định. Không xoá để giữ đường demo ổn định."
              : isUploadedLesson
                ? "Buổi học do Lab Coach upload. Có thể đổi tên hoặc xoá."
                : "Buổi demo phụ. Có thể xoá khỏi danh sách nếu không dùng nữa."}
          </p>
        </div>
        <div className="action-row">
          <button type="button" className="btn btn-ghost btn-sm" disabled={!isUploadedLesson} onClick={renameLesson}>Sửa buổi upload</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={!canDeleteLesson} onClick={deleteLesson}>Xoá buổi học</button>
        </div>
      </div>

      <div className="section-label">Danh sách buổi học</div>
      <div className="lesson-list">
        {lessons.map((lesson) => (
          <button
            key={lesson.id}
            type="button"
            className={`lesson-row ${selectedLesson?.id === lesson.id ? "active" : ""}`}
            onClick={() => setSelectedLessonId(lesson.id)}
          >
            <div>
              <strong>{lesson.title}</strong>
              <span>{lesson.slide_count} trang · {lesson.source_type === "uploaded" ? "Upload thật" : "Demo mặc định"}</span>
            </div>
            <small>{statusLabel(lesson.status)}</small>
          </button>
        ))}
      </div>
    </>
  );
}

function InputDemo({ pack, topics, selectedLesson }: { pack: ReviewPack; topics: ClassInsight[]; selectedLesson?: LessonOption }) {
  const sampleTopics = topics.slice(0, 3);
  const sampleQuestions = sampleTopics.flatMap((topic) =>
    topic.representative_questions.slice(0, 2).map((question) => ({
      question,
      topic: topic.topic,
      pages: topic.source_pages,
      status: topic.status,
    })),
  ).slice(0, 5);
  const isUploadedLesson = selectedLesson?.source_type === "uploaded";
  const slideSourceLabel = selectedLesson?.slide_source_label || (isUploadedLesson ? `uploads/${selectedLesson?.id}/slide.pdf` : "data/vlearn-pack/slides/d1-slide-hackathon.pdf");
  const chatlogSourceLabel = selectedLesson?.chatlog_source_label || (isUploadedLesson ? `uploads/${selectedLesson?.id}/chatlog.csv` : "data/vlearn-pack/chatlog/chat_history_anonymized_for_hackathon.csv");
  const dayCodeLabel = selectedLesson?.day_code_label || (isUploadedLesson ? "Theo file CSV đã upload" : "Day 1, Day1-C302");

  return (
    <>
      <div className="section-label">Dữ liệu đầu vào</div>
      <div className="input-grid">
        <div className="input-card">
          <div className="input-card-head">
            <span className="input-kicker">Slide PDF</span>
            <span className="chip chip-evidence">{pack.lesson.slide_count} trang</span>
          </div>
          <h3>{pack.lesson.title}</h3>
          <p>Slide là nguồn sự thật. Mọi kiến thức trong review pack phải truy ngược được về trang gốc.</p>
          <div className="input-path">{slideSourceLabel}</div>
        </div>

        <div className="input-card">
          <div className="input-card-head">
            <span className="input-kicker">Chatlog AI Tutor</span>
            <span className="chip chip-evidence">{pack.analysis.unique_user_count} user ẩn danh</span>
          </div>
          <h3>{pack.analysis.student_question_count} tin nhắn liên quan</h3>
          <p>Chatlog không dùng làm nguồn kiến thức; nó chỉ cho biết học viên thật đang vướng ở đâu.</p>
          <div className="input-path">{chatlogSourceLabel}</div>
        </div>
      </div>

      <div className="source-console">
        <div>
          <div className="input-kicker">Data source control</div>
          <h3>Nguồn của buổi đang chọn</h3>
          <p>
            {isUploadedLesson
              ? "Pipeline sẽ dùng đúng slide PDF và chatlog CSV của buổi upload này."
              : "Buổi demo dùng source Day 1 trong repo. Khi chọn buổi upload, pipeline sẽ chuyển sang đúng PDF/CSV của buổi đó."}
          </p>
        </div>
        <div className="source-status-grid">
          <SourceStatus label="Slide mapping" value={`${selectedLesson?.title || pack.lesson.title} · ${pack.lesson.slide_count} trang`} tone="ready" />
          <SourceStatus label="Chatlog filter" value={dayCodeLabel} tone="ready" />
          <SourceStatus label="Privacy" value="ID đã ẩn danh" tone="ready" />
          <SourceStatus label="Grounding" value={`${pack.warnings.length} cảnh báo`} tone={pack.warnings.length ? "review" : "ready"} />
        </div>
      </div>

      <div className="section-label">{isUploadedLesson ? "Chatlog buổi upload đã ẩn danh" : "Chatlog mẫu đã ẩn danh"}</div>
      <div className="chatlog-panel">
        {sampleQuestions.map((item, index) => (
          <div key={`${item.topic}-${index}`} className="chat-row">
            <div className="chat-avatar">U{String(index + 1).padStart(2, "0")}</div>
            <div className="chat-bubble">
              <div className="chat-meta">Học viên ẩn danh · {sourceLabel(item.pages)}</div>
              <p>{item.question}</p>
              <div className="chat-result">
                <span>Gom vào cluster: {item.topic}</span>
                <span className={`mini-status ${item.status === "needs_review" ? "review" : "ready"}`}>{statusLabel(item.status)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="section-label">Evidence matrix</div>
      <div className="evidence-table">
        <div className="evidence-head">
          <span>Câu hỏi thật</span>
          <span>AI hiểu là</span>
          <span>Nguồn slide</span>
          <span>Quyết định</span>
        </div>
        {sampleTopics.map((topic) => (
          <div key={`matrix-${topic.id}`} className="evidence-row">
            <span>{topic.representative_questions[0]}</span>
            <span>{topic.topic}<small>{issueType(topic)}</small></span>
            <span>{sourceLabel(topic.source_pages)}</span>
            <span className={`mini-status ${topic.status === "needs_review" ? "review" : "ready"}`}>{statusLabel(topic.status)}</span>
          </div>
        ))}
      </div>

      <div className="section-label">{isUploadedLesson ? "Pipeline của buổi upload" : "Pipeline demo"}</div>
      <div className="pipeline-strip">
        <PipelineStep index="1" title="Lọc noise" text={`${pack.analysis.excluded_noise_count} tin nhiễu/ngoài phạm vi bị loại trước khi sinh nội dung.`} />
        <PipelineStep index="2" title="Cluster" text={`${pack.analysis.cluster_count} chủ đề được gom theo ý định hỏi, không theo template câu.`} />
        <PipelineStep index="3" title="Grounding" text="Mỗi claim phải có source excerpt từ slide; thiếu chắc chắn thì chuyển Lab Coach duyệt." />
        <PipelineStep index="4" title="Phát hành" text="Học viên chỉ thấy summary, insight và câu hỏi đã ở trạng thái sẵn sàng." />
      </div>
    </>
  );
}

function SourceStatus({ label, value, tone }: { label: string; value: string; tone: "ready" | "review" }) {
  return (
    <div className={`source-status ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ReleaseChecklist({
  summary,
  insights,
  questions,
}: {
  summary: SummaryItem[];
  insights: ClassInsight[];
  questions: ReviewQuestion[];
}) {
  const totalItems = summary.length + insights.length + questions.length;
  return (
    <div className="release-checklist">
      <div className="release-checklist-head">
        <div>
          <span>Bản sẽ đồng bộ</span>
          <h3>{totalItems} mục học viên sẽ nhận</h3>
        </div>
        <div className="release-metrics">
          <strong>{summary.length}</strong><span>học liệu</span>
          <strong>{insights.length}</strong><span>điểm ôn kỹ</span>
          <strong>{questions.length}</strong><span>quiz</span>
        </div>
      </div>
      <div className="release-columns">
        <ReleaseColumn title="Học liệu trọng tâm" items={summary.map((item) => `${item.title} · ${sourceLabel(item.source_pages)}`)} />
        <ReleaseColumn title="Điểm lớp hay vướng" items={insights.map((item) => `${item.topic} · ${item.unique_user_count} học viên`)} />
        <ReleaseColumn title="Quiz ôn tập" items={questions.map((item, index) => `${index + 1}. ${item.question}`)} />
      </div>
    </div>
  );
}

function ReleaseColumn({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="release-column">
      <h4>{title}</h4>
      {items.length ? items.slice(0, 6).map((item) => <p key={item}>{item}</p>) : <p>Chưa có mục nào sẵn sàng gửi.</p>}
      {items.length > 6 && <small>+{items.length - 6} mục khác</small>}
    </div>
  );
}

function SummaryCoverage({ pack }: { pack: ReviewPack }) {
  const covered = new Set(pack.summary.flatMap((item) => item.source_pages));
  const pages = Array.from({ length: pack.lesson.slide_count }, (_, index) => index + 1);
  const coveredCount = pages.filter((page) => covered.has(page)).length;
  return (
    <div className="coverage-panel">
      <div>
        <strong>Độ phủ nội dung trọng tâm: {coveredCount}/{pack.lesson.slide_count} trang có dẫn chiếu</strong>
        <p>Lab Coach dùng phần này để kiểm tra học liệu đã bao quát bài học chưa. Trang chưa phủ không nhất thiết sai, nhưng nên soát lại trước khi gửi học viên.</p>
      </div>
      <div className="coverage-grid">
        {pages.map((page) => (
          <span key={page} className={covered.has(page) ? "covered" : ""}>{page}</span>
        ))}
      </div>
    </div>
  );
}

function PipelineStep({ index, title, text }: { index: string; title: string; text: string }) {
  return (
    <div className="pipeline-step">
      <div className="step-index">{index}</div>
      <h4>{title}</h4>
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

function StudentLearningMap({ summary, insights }: { summary: SummaryItem[]; insights: ClassInsight[] }) {
  const topInsights = [...insights].sort((a, b) => b.unique_user_count - a.unique_user_count || b.question_count - a.question_count).slice(0, 3);
  return (
    <div className="student-map">
      <div className="map-column">
        <div className="input-kicker">Toàn bộ bài học</div>
        <h3>Learning map</h3>
        <div className="map-rail">
          {summary.map((item, index) => (
            <div key={item.id} className="map-node">
              <span>{index + 1}</span>
              <div>
                <strong>{item.title}</strong>
                <small>{sourceLabel(item.source_pages)}</small>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="map-column highlight">
        <div className="input-kicker">Coach chọn</div>
        <h3>Phần nên ôn kỹ</h3>
        {topInsights.map((item) => (
          <div key={`student-hot-${item.id}`} className="interest-pill">
            <strong>{item.topic}</strong>
            <span>{sourceLabel(item.source_pages)} · đã duyệt đưa vào pack</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StudentGroundedChat({
  messages,
  value,
  setValue,
  onAsk,
  busy,
}: {
  messages: StudentChatMessage[];
  value: string;
  setValue: (value: string) => void;
  onAsk: () => void;
  busy: boolean;
}) {
  const quickPrompts = [
    "Tóm tắt buổi học này theo thứ tự dễ học",
    "Giải thích lại phần khó nhất bằng ví dụ đời thường",
    "Cho mình 5 ý cần nhớ trước khi làm quiz",
    "Mình sai câu quiz thì nên ôn lại phần nào?",
  ];
  return (
    <>
      <div className="section-label">Hỏi lại sau buổi học</div>
      <div className="student-chat">
        <div className="student-chat-sidebar">
          <div className="chat-brand">
            <span>✦</span>
            <div>
              <strong>Study Chat</strong>
              <small>Ôn lại bằng ngôn ngữ dễ hiểu</small>
            </div>
          </div>
          <div className="chat-thread-list">
            {quickPrompts.map((prompt) => (
              <button key={prompt} type="button" onClick={() => setValue(prompt)}>
                {prompt}
              </button>
            ))}
          </div>
        </div>
        <div className="student-chat-main">
          <div className="student-chat-top">
            <div>
              <strong>Chat AI</strong>
              <span>Dựa trên học liệu đã duyệt</span>
            </div>
            <small>Online</small>
          </div>
          <div className="student-chat-log">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`student-msg ${message.role}`}>
                <p>{message.text}</p>
                {message.source && <span>{message.source}</span>}
              </div>
            ))}
          </div>
          <div className="student-chat-input">
            <input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onAsk();
              }}
              placeholder="Hỏi lại phần bạn chưa hiểu..."
            />
            <button type="button" className="btn btn-primary" disabled={busy} onClick={onAsk}>{busy ? "Đang tìm..." : "Gửi"}</button>
          </div>
        </div>
      </div>
    </>
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
      <Evidence pages={item.source_pages} excerpt={item.source_excerpt} />
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
      <Evidence pages={item.source_pages} excerpt={item.source_excerpt} />
      <div className="study-questions">
        {item.representative_questions.slice(0, 2).map((question, index) => (
          <span key={`${item.id}-${index}`}>{question}</span>
        ))}
      </div>
    </article>
  );
}

function StudentQuiz({
  questions,
  totalQuestions,
  started,
  submitted,
  answers,
  setAnswers,
  onStart,
  onRestart,
  onSubmit,
}: {
  questions: ReviewQuestion[];
  totalQuestions: number;
  started: boolean;
  submitted: boolean;
  answers: Record<string, number>;
  setAnswers: (answers: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => void;
  onStart: () => void;
  onRestart: () => void;
  onSubmit: () => void;
}) {
  const answeredCount = questions.filter((question) => answers[question.id] !== undefined).length;
  const correctCount = questions.filter((question) => answers[question.id] === question.correct_option).length;
  const percent = questions.length ? Math.round((correctCount / questions.length) * 100) : 0;
  const canSubmit = started && questions.length > 0;
  const reviewQuestions = questions.filter((question) => answers[question.id] !== question.correct_option);

  if (!totalQuestions) {
    return (
      <div className="quiz-empty">
        <h3>Chưa có câu quiz cho buổi học này</h3>
        <p>Lab Coach cần duyệt hoặc tạo thêm câu hỏi trước khi học viên bắt đầu ôn tập bằng quiz.</p>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="quiz-start">
        <div>
          <span>Không gian ôn tập</span>
          <h3>Sẵn sàng kiểm tra lại kiến thức?</h3>
          <p>Buổi này có {totalQuestions} câu hỏi. Khi bắt đầu, câu hỏi sẽ được đảo ngẫu nhiên để mỗi lượt ôn là một lần luyện mới.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={onStart}>Bắt đầu ôn tập</button>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="quiz-result">
        <div className="quiz-result-hero">
          <div>
            <span>Kết quả ôn tập</span>
            <h3>{correctCount}/{questions.length} câu đúng</h3>
            <p>Bạn đã trả lời {answeredCount}/{questions.length} câu · {percent}% tổng điểm.</p>
          </div>
          <div className="quiz-result-score">{percent}%</div>
        </div>
        <div className="quiz-result-actions">
          <button type="button" className="btn btn-primary" onClick={onRestart}>Làm lại với thứ tự mới</button>
        </div>

        <div className="section-label">Câu cần xem lại</div>
        {reviewQuestions.length ? (
          <div className="quiz-review-list">
            {reviewQuestions.map((item, index) => (
              <StudyQuestion
                key={item.id}
                item={item}
                index={index}
                selected={answers[item.id]}
                submitted={submitted}
                onSelect={(option) => setAnswers((prev) => ({ ...prev, [item.id]: option }))}
                onRetry={onRestart}
              />
            ))}
          </div>
        ) : (
          <div className="quiz-empty">
            <h3>Làm tốt lắm, không có câu sai.</h3>
            <p>Bạn có thể làm lại để luyện với thứ tự câu hỏi mới hoặc chuyển sang chatbot để hỏi sâu hơn.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="quiz-summary">
        <div>
          <strong>Đã làm {answeredCount}/{questions.length} câu</strong>
          <p>Có thể nộp bài bất cứ lúc nào; câu chưa trả lời sẽ tính là chưa đúng.</p>
        </div>
      </div>
      <div className="quiz-list">
        {questions.map((item, index) => (
          <StudyQuestion
            key={item.id}
            item={item}
            index={index}
            selected={answers[item.id]}
            submitted={submitted}
            onSelect={(option) => setAnswers((prev) => ({ ...prev, [item.id]: option }))}
            onRetry={onRestart}
          />
        ))}
      </div>
      <div className="quiz-submitbar">
        <div>
          <strong>Sẵn sàng nộp?</strong>
          <p>Bạn không cần làm hết câu hỏi mới được nộp bài.</p>
        </div>
        <div className="quiz-actions">
          <button type="button" className="btn btn-primary" disabled={!canSubmit} onClick={onSubmit}>Nộp bài</button>
        </div>
      </div>
    </>
  );
}

function StudyQuestion({
  item,
  index,
  selected,
  submitted,
  onRetry,
  onSelect,
}: {
  item: ReviewQuestion;
  index: number;
  selected?: number;
  submitted: boolean;
  onRetry: () => void;
  onSelect: (option: number) => void;
}) {
  const answered = selected !== undefined;
  const correct = selected === item.correct_option;
  const stateClass = submitted ? (correct ? "correct" : "wrong") : "";
  return (
    <article className={`quiz-card ${stateClass}`}>
      <div className="quiz-question-head">
        <span>Câu {index + 1}</span>
        {submitted && <strong>{answered ? (correct ? "Đúng" : "Chưa đúng") : "Chưa trả lời"}</strong>}
      </div>
      <h3>{item.question}</h3>
      <div className="quiz-options">
        {item.options.map((option, optionIndex) => {
          const isSelected = selected === optionIndex;
          const isCorrect = item.correct_option === optionIndex;
          return (
            <button
              key={`${item.id}-${optionIndex}`}
              type="button"
              className={`quiz-option ${isSelected ? "selected" : ""} ${submitted && isCorrect ? "answer" : ""}`}
              disabled={submitted}
              onClick={() => onSelect(optionIndex)}
            >
              <span>{String.fromCharCode(65 + optionIndex)}</span>
              {option}
            </button>
          );
        })}
      </div>
      {submitted && (
        <div className="quiz-explanation">
          <p><strong>Đáp án:</strong> {item.answer}</p>
          <p>{item.explanation}</p>
          <Evidence pages={item.source_pages} excerpt={item.source_excerpt} />
          {!correct && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>Làm lại phần câu sai</button>
          )}
        </div>
      )}
    </article>
  );
}

function ReviewActions({ item, onUpdate }: { item: { id: string; status: string }; onUpdate: (itemId: string, action: "approve" | "drop") => void }) {
  if (item.status !== "needs_review") {
    return (
      <div className="review-actions">
        <span className="chip chip-ready">Đang gửi cho học viên</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onUpdate(item.id, "drop")}>Không gửi học viên</button>
      </div>
    );
  }
  return (
    <div className="review-actions">
      <button type="button" className="btn btn-primary btn-sm" onClick={() => onUpdate(item.id, "approve")}>Duyệt đưa vào pack</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onUpdate(item.id, "drop")}>Không gửi học viên</button>
    </div>
  );
}

function SummaryCard({
  item,
  onUpdate,
  onEdit,
}: {
  item: SummaryItem;
  onUpdate: (itemId: string, action: "approve" | "drop") => void;
  onEdit: (item: SummaryItem) => void;
}) {
  return (
    <div className={`content-card ${item.status === "needs_review" ? "needs-review" : ""}`}>
      <div className="content-card-head">
        <h4>{item.title}</h4>
        <span className={`chip ${item.status === "ready" ? "chip-ready" : "chip-review"}`}>{statusLabel(item.status)}</span>
      </div>
      <p>{item.content}</p>
      <Evidence pages={item.source_pages} excerpt={item.source_excerpt} />
      <div className="review-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEdit(item)}>Sửa nội dung</button>
      </div>
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
      <p><strong>Cách hiểu đúng theo slide:</strong> {item.correct_understanding}</p>
      <div className="content-card-foot">
        <span className="chip chip-evidence">{item.unique_user_count} học viên · {item.question_count} lượt</span>
        <span className={`chip ${shouldSuggestForStudentPack(item) ? "chip-ready" : "chip-review"}`}>
          {shouldSuggestForStudentPack(item) ? "Đang gửi cho học viên" : "Chỉ dùng làm tín hiệu"}
        </span>
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
