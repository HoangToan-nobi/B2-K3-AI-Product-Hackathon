// VLười — CP2 clickable flow. Mock data only, no AI call yet (AI thật vào CP3).
(function () {
  "use strict";

  const RAW = window.MOCK_REVIEW_PACK;
  // Working copy — "Duyệt/Bỏ" mutate this, never the mock source, so the flow can be replayed.
  const state = { pack: null };

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function clonePack() {
    return JSON.parse(JSON.stringify(RAW));
  }

  // ---- Screen 1: lesson info shown before generation ----
  function initScreen1() {
    $("#lesson-title").textContent = RAW.lesson.title;
    $("#lesson-slides").textContent = RAW.lesson.slide_count + " slide";
    $("#lesson-questions").textContent =
      RAW.analysis.student_question_count + " câu hỏi liên quan trong chatlog";

    $("#btn-generate").addEventListener("click", onGenerate);
  }

  function onGenerate() {
    const btn = $("#btn-generate");
    const box = $("#processing-box");
    btn.disabled = true;
    box.hidden = false;

    // Simulated processing — CP3 swaps this for a real pipeline call.
    setTimeout(() => {
      state.pack = clonePack();
      box.hidden = true;
      btn.disabled = false;
      renderAnalysis();
      renderReview();
      renderPdf();
      goToStep(2);
    }, 1100);
  }

  // ---- Stepper / panel navigation ----
  function goToStep(n) {
    $$(".panel").forEach((p) => p.classList.toggle("active", Number(p.dataset.panel) === n));
    $$(".step").forEach((s) => {
      const step = Number(s.dataset.step);
      s.classList.toggle("active", step === n);
      s.classList.toggle("done", step < n);
    });
    // Fade the new panel in — not on first paint, only on an explicit step change.
    const target = $(`.panel[data-panel="${n}"]`);
    target.classList.remove("enter");
    void target.offsetWidth; // force reflow so the animation restarts on repeat visits
    target.classList.add("enter");
  }

  function bindNav() {
    $$("[data-next]").forEach((btn) =>
      btn.addEventListener("click", () => goToStep(Number(btn.dataset.next)))
    );
    $$("[data-back]").forEach((btn) =>
      btn.addEventListener("click", () => goToStep(Number(btn.dataset.back)))
    );
  }

  // ---- Screen 2: kết quả phân tích ----
  function renderAnalysis() {
    const a = state.pack.analysis;
    $("#stat-row").innerHTML = [
      stat(a.unique_user_count, "học viên duy nhất đã hỏi"),
      stat(a.cluster_count, "chủ đề gom được"),
      stat(a.included_cluster_count, "chủ đề đưa vào PDF"),
      stat(a.excluded_noise_count, "tin nhiễu đã loại"),
    ].join("");

    $("#warning-slot").innerHTML = state.pack.warnings
      .map((w) => `<div class="warning-banner">⚠ ${escapeHtml(w.message)}</div>`)
      .join("");

    const topics = [...state.pack.class_insights].sort(
      (x, y) => y.question_count - x.question_count
    );
    $("#topic-list").innerHTML = topics
      .map(
        (t, i) => `
      <div class="topic-row">
        <div class="topic-rank">${i + 1}</div>
        <div class="topic-body">
          <div class="topic-title">${escapeHtml(t.topic)}
            ${statusTag(t.status)}
          </div>
          <div class="topic-meta">${t.unique_user_count} người hỏi · ${t.question_count} lượt · trang ${t.source_pages.join(", ")}</div>
          <p class="topic-quote">“${escapeHtml(t.representative_questions[0])}”</p>
        </div>
      </div>`
      )
      .join("");
  }

  function stat(value, label) {
    return `<div class="stat"><div class="stat-value">${value}</div><div class="stat-label">${label}</div></div>`;
  }

  function statusTag(status) {
    return status === "needs_review"
      ? `<span class="tag tag-flag">cần duyệt</span>`
      : `<span class="tag tag-ready">sẵn sàng</span>`;
  }

  // ---- Screen 3: review nội dung ----
  function renderReview() {
    $("#summary-list").innerHTML = state.pack.summary
      .map(
        (s) => `
      <div class="review-item">
        <div class="review-item-head">
          <div class="review-item-title">${escapeHtml(s.title)}</div>
          ${statusTag(s.status)}
        </div>
        <p class="review-item-body">${escapeHtml(s.content)}</p>
        <div class="review-item-source">Nguồn: trang ${s.source_pages.join(", ")}</div>
      </div>`
      )
      .join("");

    $("#insight-list").innerHTML = state.pack.class_insights
      .map((it) => reviewItemHtml(it.id, it.topic, it.correct_understanding, it.source_pages, it.status))
      .join("");

    $("#question-list").innerHTML = state.pack.review_questions
      .map((q) =>
        reviewItemHtml(q.id, q.question, `Đáp án: ${q.answer}`, q.source_pages, q.status)
      )
      .join("");

    bindReviewActions();
  }

  function reviewItemHtml(id, title, body, pages, status) {
    const flagged = status === "needs_review";
    return `
      <div class="review-item${flagged ? " is-flagged" : ""}" data-item="${id}">
        <div class="review-item-head">
          <div class="review-item-title">${escapeHtml(title)}</div>
          ${statusTag(status)}
        </div>
        <p class="review-item-body">${escapeHtml(body)}</p>
        <div class="review-item-source">Nguồn: trang ${pages.join(", ")}</div>
        ${flagged ? `
        <div class="review-actions">
          <button class="btn btn-primary btn-sm" data-approve="${id}">Duyệt</button>
          <button class="btn btn-ghost btn-sm" data-drop="${id}">Bỏ khỏi PDF</button>
        </div>` : ""}
      </div>`;
  }

  function findItem(id) {
    return (
      state.pack.class_insights.find((x) => x.id === id) ||
      state.pack.review_questions.find((x) => x.id === id)
    );
  }

  function bindReviewActions() {
    $$("[data-approve]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const item = findItem(btn.dataset.approve);
        if (item) item.status = "ready";
        renderAnalysis();
        renderReview();
        renderPdf();
      })
    );
    $$("[data-drop]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const id = btn.dataset.drop;
        state.pack.class_insights = state.pack.class_insights.filter((x) => x.id !== id);
        state.pack.review_questions = state.pack.review_questions.filter((x) => x.id !== id);
        state.pack.warnings.forEach((w) => {
          w.item_ids = w.item_ids.filter((x) => x !== id);
        });
        state.pack.warnings = state.pack.warnings.filter((w) => w.item_ids.length > 0);
        renderAnalysis();
        renderReview();
        renderPdf();
      })
    );
  }

  // ---- Screen 4: PDF preview ----
  function renderPdf() {
    const p = state.pack;
    const hasFlagged =
      p.class_insights.some((i) => i.status === "needs_review") ||
      p.review_questions.some((q) => q.status === "needs_review");

    $("#pdf-sheet").innerHTML = `
      <div class="pdf-meta">
        <strong>${escapeHtml(p.lesson.title)}</strong> · VLười Review Pack · ${formatDate(p.generated_at)}
      </div>

      <h2>Lý thuyết trọng tâm</h2>
      ${p.summary
        .map(
          (s) => `<p><strong>${escapeHtml(s.title)}.</strong> ${escapeHtml(s.content)}
          <span class="pdf-cite"> [trang ${s.source_pages.join(", ")}]</span></p>`
        )
        .join("")}

      <h2>Cả lớp thường hỏi</h2>
      ${p.class_insights
        .map(
          (i) => `<p><strong>${escapeHtml(i.topic)}.</strong> ${escapeHtml(i.correct_understanding)}
          <span class="pdf-cite"> [trang ${i.source_pages.join(", ")}]</span></p>`
        )
        .join("")}

      <h2>Câu tự kiểm tra</h2>
      ${p.review_questions
        .map(
          (q, i) => `<p><strong>${i + 1}. ${escapeHtml(q.question)}</strong><br/>${escapeHtml(q.answer)}
          <span class="pdf-cite"> [trang ${q.source_pages.join(", ")}]</span></p>`
        )
        .join("")}

      ${hasFlagged ? `<div class="disclaimer">Một số nội dung đang chờ Lab Coach duyệt — chưa phát hành như kiến thức chính thức.</div>` : ""}
    `;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function bindDownload() {
    $("#btn-download").addEventListener("click", () => window.print());
  }

  document.addEventListener("DOMContentLoaded", () => {
    initScreen1();
    bindNav();
    bindDownload();
  });
})();
