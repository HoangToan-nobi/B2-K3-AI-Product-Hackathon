import type { ReviewPack } from "./types";

function stripMarkdownText(value: string): string {
  let text = String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  text = text.replace(/```(?:[a-zA-Z0-9_-]+)?\s*/g, "").replace(/```/g, "");
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  text = text.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  text = text.replace(/^\s{0,3}>\s?/gm, "");
  text = text.replace(/^\s{0,3}(?:[-*+]\s+|\d+[.)]\s+)/gm, "");
  text = text.replace(/^\s{0,3}[-*_]{3,}\s*$/gm, "");
  const emphasisPatterns = [
    /\*\*\*([\s\S]+?)\*\*\*/g,
    /___([\s\S]+?)___/g,
    /\*\*([\s\S]+?)\*\*/g,
    /__([\s\S]+?)__/g,
    /(?<!\w)\*(?!\s)([\s\S]+?)(?<!\s)\*(?!\w)/g,
    /(?<!\w)_(?!\s)([\s\S]+?)(?<!\s)_(?!\w)/g,
  ];
  let previous = "";
  while (previous !== text) {
    previous = text;
    emphasisPatterns.forEach((pattern) => {
      text = text.replace(pattern, "$1");
    });
  }
  text = text.replace(/`([^`]+)`/g, "$1");
  text = text.replace(/\\([\\`*_{}\[\]()#+\-.!>])/g, "$1");
  return text.replace(/[ \t]*\n[ \t]*/g, " ").replace(/\s+/g, " ").trim();
}

function sanitizePdfText(value: string): string {
  return stripMarkdownText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\n]/g, "")
    .replace(/[()\\]/g, "\\$&");
}

function wrapLine(text: string, max = 86): string[] {
  const words = sanitizePdfText(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > max) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = (current + " " + word).trim();
    }
  }
  if (current) lines.push(current);
  return lines;
}

function buildLines(pack: ReviewPack): string[] {
  const lines: string[] = [
    "VLuoi - Goi On Tap",
    pack.lesson.title,
    `${pack.lesson.slide_count} slides | ${pack.analysis.unique_user_count} hoc vien hoi | ${pack.analysis.cluster_count} chu de`,
    "",
    "Ly thuyet trong tam",
  ];

  for (const item of pack.summary) {
    lines.push(...wrapLine(`- ${item.title}. ${item.content} [trang ${item.source_pages.join(", ")}]`));
  }

  lines.push("", "Ca lop thuong hoi");
  for (const item of pack.class_insights.filter((it) => it.status === "ready")) {
    lines.push(
      ...wrapLine(
        `- ${item.topic}. ${item.correct_understanding} (${item.unique_user_count} hoc vien, trang ${item.source_pages.join(", ")})`,
      ),
    );
  }

  const flagged = pack.class_insights.some((it) => it.status === "needs_review")
    || pack.review_questions.some((it) => it.status === "needs_review");
  if (flagged) {
    lines.push("", "Luu y: mot so noi dung dang cho Lab Coach duyet va khong duoc dua vao ban phat hanh.");
  }

  lines.push("", "Cau tu kiem tra");
  pack.review_questions.forEach((item, index) => {
    if (item.status === "ready") {
      lines.push(...wrapLine(`${index + 1}. ${item.question}`));
      lines.push(...wrapLine(`   Dap an: ${item.answer}. [trang ${item.source_pages.join(", ")}]`));
    }
  });

  return lines;
}

function pdfObject(id: number, body: string): string {
  return `${id} 0 obj\n${body}\nendobj\n`;
}

export function generateReviewPackPdf(pack: ReviewPack): Buffer {
  const contentLines = buildLines(pack);
  const chunks: string[] = [];
  let y = 760;
  chunks.push("BT", "/F1 11 Tf", "50 760 Td");
  for (const line of contentLines) {
    if (y < 52) {
      chunks.push("ET");
      break;
    }
    chunks.push(`(${sanitizePdfText(line)}) Tj`, "0 -15 Td");
    y -= 15;
  }
  chunks.push("ET");

  const stream = chunks.join("\n");
  const objects = [
    pdfObject(1, "<< /Type /Catalog /Pages 2 0 R >>"),
    pdfObject(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    pdfObject(
      3,
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    ),
    pdfObject(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
    pdfObject(5, `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`),
  ];

  let offset = "%PDF-1.4\n".length;
  const xref = ["0000000000 65535 f "];
  for (const object of objects) {
    xref.push(`${String(offset).padStart(10, "0")} 00000 n `);
    offset += Buffer.byteLength(object, "ascii");
  }

  const body = objects.join("");
  const xrefOffset = Buffer.byteLength("%PDF-1.4\n" + body, "ascii");
  const pdf = [
    "%PDF-1.4",
    body,
    `xref\n0 ${objects.length + 1}`,
    xref.join("\n"),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
    "",
  ].join("\n");

  return Buffer.from(pdf, "ascii");
}
