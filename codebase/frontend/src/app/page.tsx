"use client";

import { useState, useEffect } from "react";

const DB = {
  lesson: {
    title: "Buổi 7 — Lan truyền ngược & Optimizer (Backpropagation, SGD, Adam)",
    slides: 42,
    questionsRaw: 57
  },
  stats: [
    { value: "42", label: "Slide đã quét" },
    { value: "57", label: "Câu hỏi trong chatlog" },
    { value: "23", label: "Học viên tham gia hỏi" },
    { value: "68%", label: "Câu hỏi khớp nguồn slide" }
  ],
  warning: "5 câu hỏi không khớp với slide nào trong buổi — có thể giảng viên giải đáp ngoài giáo trình. Trợ giảng nên xem lại trước khi phát hành.",
  topics: [
    { name: "Vanishing / Exploding Gradient", students: 14, messages: 38, pct: 100 },
    { name: "Vì sao dùng Adam thay vì SGD thuần", students: 11, messages: 29, pct: 79 },
    { name: "Chain rule cho mạng nhiều lớp", students: 9, messages: 52, pct: 64, note: "Nhiều tin nhắn nhưng ít học viên — 1 luồng thảo luận dài" },
    { name: "Learning rate warmup / decay", students: 6, messages: 14, pct: 43 },
    { name: "BatchNorm vs LayerNorm ảnh hưởng gradient", students: 4, messages: 9, pct: 29 }
  ],
  summaries: [
    {
      title: "Vanishing Gradient là gì và vì sao xảy ra",
      body: "Khi đạo hàm được nhân dồn qua nhiều lớp, nếu các giá trị đều nhỏ hơn 1 thì gradient tiến dần về 0 ở các lớp đầu — khiến chúng gần như không được cập nhật.",
      source: "Slide tr. 8", students: 14, status: "ready"
    },
    {
      title: "Vì sao Adam hội tụ nhanh hơn SGD thuần",
      body: "Adam kết hợp momentum và learning rate thích ứng theo từng tham số, giúp ổn định hướng cập nhật hơn khi bề mặt loss gồ ghề.",
      source: "Slide tr. 15", students: 11, status: "ready"
    },
    {
      title: "Chain rule áp dụng cho mạng nhiều lớp",
      body: "Đạo hàm loss theo trọng số ở lớp đầu được tính bằng tích các đạo hàm cục bộ qua từng lớp trung gian, theo đúng thứ tự lan truyền ngược.",
      source: "Slide tr. 5 + chatlog", students: 9, status: "review"
    }
  ],
  insights: [
    { title: "Nhầm learning rate decay với weight decay", body: "Nhiều học viên dùng lẫn hai khái niệm — decay đầu điều chỉnh tốc độ học, decay sau là regularization lên trọng số.", source: "9 tin nhắn chatlog" },
    { title: "Nghĩ Adam luôn tốt hơn SGD trong mọi trường hợp", body: "Thực tế SGD + momentum vẫn tổng quát hoá tốt hơn ở một số bài toán thị giác máy tính, dù hội tụ chậm hơn.", source: "6 tin nhắn chatlog" }
  ],
  questions: [
    { q: "Vì sao gradient có xu hướng biến mất ở các lớp đầu mạng sâu?", a: "Vì đạo hàm bị nhân dồn qua nhiều lớp có giá trị < 1, tích số càng về lớp đầu càng tiến gần 0." },
    { q: "Adam cải thiện điều gì so với SGD thuần?", a: "Adam thêm momentum bậc 1 và chuẩn hoá bằng bình phương gradient trung bình (bậc 2), giúp learning rate thích ứng theo từng tham số." },
    { q: "Chain rule được dùng ở bước nào trong backprop?", a: "Ở bước tính gradient loss theo từng trọng số — nhân liên tiếp đạo hàm cục bộ từ lớp output ngược về lớp input." }
  ]
};

export default function Home() {
  const [theme, setTheme] = useState("dark");
  const [step, setStep] = useState(1);
  const [generated, setGenerated] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [openQA, setOpenQA] = useState<number[]>([]);

  useEffect(() => {
    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    const t = prefersLight ? 'light' : 'dark';
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
  }, []);

  const changeTheme = (t: string) => {
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
  };

  const goToStep = (n: number) => {
    if (n > 1 && !generated) return;
    setStep(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleGenerate = () => {
    setProcessing(true);
    setTimeout(() => {
      setProcessing(false);
      setGenerated(true);
      goToStep(2);
    }, 1400);
  };

  const handleDownload = () => {
    setDownloading(true);
    setTimeout(() => {
      setDownloading(false);
    }, 1800);
  };

  const toggleQA = (idx: number) => {
    setOpenQA(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]);
  };

  const pct = ((step - 1) / 3) * 100;

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <div className="brand">VL<span>ười</span></div>
          <div className="brand-tagline">Lười đọc dài. Không lười hiểu.</div>
        </div>
        <div className="theme-toggle" role="group" aria-label="Chuyển giao diện sáng / tối">
          <button
            type="button"
            className={theme === 'light' ? 'active' : ''}
            onClick={() => changeTheme('light')}
            aria-label="Giao diện sáng"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
          </button>
          <button
            type="button"
            className={theme === 'dark' ? 'active' : ''}
            onClick={() => changeTheme('dark')}
            aria-label="Giao diện tối"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
          </button>
        </div>
      </header>

      <nav className="stepper" id="stepper">
        <div className="rail" style={{ width: `${pct}%` }}></div>
        {[1, 2, 3, 4].map(n => (
          <div key={n} className={`step ${step === n ? 'active' : ''} ${step > n ? 'done' : ''}`} onClick={() => goToStep(n)}>
            <span className="step-num">{n}</span>
            <span className="step-label">
              {n === 1 && "Chọn buổi học"}
              {n === 2 && "Kết quả phân tích"}
              {n === 3 && "Review nội dung"}
              {n === 4 && "Preview PDF"}
            </span>
          </div>
        ))}
      </nav>

      {/* Screen 1 */}
      <section className={`panel ${step === 1 ? 'active' : ''}`}>
        <h1 className="panel-title">Chọn buổi học</h1>
        <p className="panel-sub">Chọn một buổi để VLười kết hợp slide và chatlog đã ẩn danh, tạo bản ôn tập có nguồn trích dẫn rõ ràng.</p>

        <div className="lesson-row">
          <div className="lesson-info">
            <div className="lesson-eyebrow">Buổi học gần nhất</div>
            <h3>{DB.lesson.title}</h3>
            <div className="lesson-meta">
              <span>{DB.lesson.slides} slide</span>
              <span>{DB.lesson.questionsRaw} câu hỏi liên quan</span>
            </div>
          </div>
          <button
            className="btn btn-primary"
            disabled={processing}
            onClick={handleGenerate}
          >
            Tạo VLười Pack
          </button>
        </div>

        {processing && (
          <div className="processing-box">
            <span className="spinner"></span>
            <span>Đang đối chiếu chatlog với slide…</span>
          </div>
        )}
      </section>

      {/* Screen 2 */}
      <section className={`panel ${step === 2 ? 'active' : ''}`}>
        <h1 className="panel-title">Kết quả phân tích</h1>
        <p className="panel-sub">Chủ đề được xếp hạng theo số học viên hỏi thật, không theo số tin nhắn.</p>

        <div className="stat-row">
          {DB.stats.map((s, i) => (
            <div key={i} className="stat-card">
              <div className="stat-value">{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="warning-banner">
          <span className="ic">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          </span>
          <p><strong>Cần chú ý.</strong> {DB.warning}</p>
        </div>

        <div className="section-label">Cả lớp thường hỏi</div>
        <div>
          {DB.topics.map((t, i) => (
            <div key={i} className="topic-item">
              <div className="topic-top">
                <div className="topic-name">{t.name}</div>
                <div className="topic-count">{t.students} học viên hỏi</div>
              </div>
              <div className="topic-bar-track">
                <div className="topic-bar-fill" style={{ width: `${t.pct}%` }}></div>
              </div>
              <div className="topic-foot">
                <span>{t.messages} tin nhắn chatlog</span>
                <span>{t.note || ''}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="footer-actions">
          <button className="btn btn-ghost" onClick={() => goToStep(1)}>Quay lại</button>
          <button className="btn btn-primary" onClick={() => goToStep(3)}>Xem nội dung ôn tập</button>
        </div>
      </section>

      {/* Screen 3 */}
      <section className={`panel ${step === 3 ? 'active' : ''}`}>
        <h1 className="panel-title">Review nội dung</h1>
        <p className="panel-sub">Mục có nguồn rõ hiển thị sẵn sàng phát hành. Mục chưa chắc chắn cần trợ giảng duyệt trước khi gửi cả lớp.</p>

        <div className="section-label">Lý thuyết trọng tâm</div>
        <div>
          {DB.summaries.map((s, i) => (
            <div key={i} className="content-card">
              <div className="content-card-head">
                <h4>{s.title}</h4>
              </div>
              <p>{s.body}</p>
              <div className="content-card-foot">
                <span className="chip chip-evidence">📎 {s.source} · {s.students} học viên hỏi</span>
                {s.status === 'ready'
                  ? <span className="chip chip-ready">✓ Sẵn sàng phát hành</span>
                  : <span className="chip chip-review">⚑ Cần trợ giảng duyệt</span>}
              </div>
            </div>
          ))}
        </div>

        <div className="section-label">Điểm cả lớp thường nhầm</div>
        <div>
          {DB.insights.map((insight, i) => (
            <div key={i} className="content-card insight-card">
              <div className="content-card-head"><h4>{insight.title}</h4></div>
              <p>{insight.body}</p>
              <div className="content-card-foot">
                <span className="chip chip-evidence">📎 {insight.source}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="section-label">Câu hỏi tự kiểm tra</div>
        <div>
          {DB.questions.map((q, i) => (
            <div key={i} className={`qa-item ${openQA.includes(i) ? 'open' : ''}`}>
              <button type="button" className="qa-question" onClick={() => toggleQA(i)}>
                <span>{q.q}</span>
                <span className="arrow">▾</span>
              </button>
              <div className="qa-answer">
                <div className="qa-answer-inner">{q.a}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="footer-actions">
          <button className="btn btn-ghost" onClick={() => goToStep(2)}>Quay lại</button>
          <button className="btn btn-primary" onClick={() => goToStep(4)}>Xem trước PDF</button>
        </div>
      </section>

      {/* Screen 4 */}
      <section className={`panel ${step === 4 ? 'active' : ''}`}>
        <h1 className="panel-title">Xem trước PDF</h1>
        <p className="panel-sub">Bản ôn tập cho buổi học, kèm nguồn trích dẫn về trang slide gốc.</p>

        <article className="pdf-sheet">
          <div className="pdf-header">
            <div className="mark">VLười — Gói Ôn Tập</div>
            <div className="meta">Xuất ngày {new Date().toLocaleDateString('vi-VN')}<br />Nguồn: slide + chatlog ẩn danh</div>
          </div>
          <div className="pdf-h1">{DB.lesson.title}</div>
          <div className="pdf-sub">{DB.lesson.slides} slide · {DB.stats[2].value} học viên tham gia thảo luận</div>

          <div className="pdf-block">
            <h5>Lý thuyết trọng tâm</h5>
            {DB.summaries.map((s, i) => (
              <p key={i}><strong>{s.title}.</strong> {s.body}</p>
            ))}
          </div>

          <div className="pdf-block">
            <h5>Điểm cả lớp thường nhầm</h5>
            {DB.insights.map((insight, i) => (
              <p key={i}><strong>{insight.title}.</strong> {insight.body}</p>
            ))}
          </div>

          <div className="pdf-block">
            <h5>Câu hỏi tự kiểm tra</h5>
            {DB.questions.map((q, i) => (
              <p key={i}>{i + 1}. {q.q}</p>
            ))}
            <p className="pdf-note">Đáp án đầy đủ ở trang sau.</p>
          </div>

          <div className="pdf-footnotes">
            {DB.summaries.map((s, i) => (
              <div key={i}>📎 {s.source} — {s.students} học viên hỏi liên quan</div>
            ))}
          </div>
          <div className="pdf-page-foot">Trang 1 / 3 — VLười Gói Ôn Tập</div>
        </article>

        <div className="footer-actions">
          <button className="btn btn-ghost" onClick={() => goToStep(3)}>Quay lại</button>
          <button className="btn btn-primary" disabled={downloading} onClick={handleDownload}>
            {downloading ? 'Đã tải xuống ✓' : 'Tải PDF'}
          </button>
        </div>
      </section>
    </div>
  );
}
