import { getRequestRole } from "@/lib/review-packs/auth";
import { callDeepSeekJson } from "@/lib/deepseek";
import { filterPackForRole, readReviewPack } from "@/lib/review-packs/service";
import type { ClassInsight, ReviewPack, SummaryItem } from "@/lib/review-packs/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Evidence = { title: string; text: string; pages: number[] };

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function retrieve(question: string, pack: ReviewPack): Evidence[] {
  const terms = normalize(question).split(/\s+/).filter((term) => term.length >= 3);
  const items: Evidence[] = [
    ...pack.summary.map((item: SummaryItem) => ({ title: item.title, text: item.content, pages: item.source_pages })),
    ...pack.class_insights.map((item: ClassInsight) => ({ title: item.topic, text: item.correct_understanding, pages: item.source_pages })),
  ];
  return items
    .map((item) => ({ ...item, score: terms.filter((term) => normalize(`${item.title} ${item.text}`).includes(term)).length }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ score: _score, ...item }) => item);
}

function fallbackAnswer(evidence: Evidence[]): { answer: string; citations: number[] } {
  if (!evidence.length) {
    return {
      answer: "Mình chưa tìm thấy câu trả lời chắc chắn trong phần nội dung đã được Lab Coach duyệt. Bạn thử hỏi lại bằng tên một khái niệm trong bài học nhé.",
      citations: [],
    };
  }
  return {
    answer: `${evidence[0].text} Mình chỉ sử dụng nội dung đã được duyệt trong review pack này.`,
    citations: evidence[0].pages,
  };
}

export async function POST(request: Request, context: RouteContext<"/api/review-packs/[packId]/qa">): Promise<Response> {
  if (getRequestRole(request) !== "student") {
    return Response.json({ error: "Student role required" }, { status: 403 });
  }

  try {
    const { packId } = await context.params;
    const body = (await request.json()) as { question?: string };
    const question = body.question?.trim() || "";
    if (question.length < 3 || question.length > 500) {
      return Response.json({ error: "Question must be between 3 and 500 characters" }, { status: 400 });
    }
    const lessonId = packId.replace(/^pack-/, "").replace(/-\d+$/, "");
    const pack = filterPackForRole(await readReviewPack(lessonId), "student");
    if (pack.pack_id !== packId) return Response.json({ error: "Review pack not found" }, { status: 404 });

    const evidence = retrieve(question, pack);
    const fallback = fallbackAnswer(evidence);
    if (!process.env.DEEPSEEK_API_KEY || !evidence.length) {
      return Response.json({ ...fallback, grounded: evidence.length > 0, mode: "safe_fallback" });
    }

    const result = (await callDeepSeekJson(
      "Bạn là trợ giảng sau buổi học. Chỉ được trả lời bằng EVIDENCE đã duyệt. Nếu evidence không đủ, nói rõ chưa đủ thông tin và không suy đoán. Trả JSON duy nhất: {answer:string,citations:number[]}. Không nhắc hoặc suy luận danh tính học viên.",
      JSON.stringify({ question, evidence }),
      900,
    )) as { answer?: string; citations?: number[] };
    const citations = Array.isArray(result.citations) ? result.citations.filter((page) => evidence.some((item) => item.pages.includes(page))) : fallback.citations;
    return Response.json({
      answer: result.answer?.trim() || fallback.answer,
      citations,
      grounded: true,
      mode: "ai_grounded",
    });
  } catch {
    return Response.json({ error: "Cannot answer from the approved review pack" }, { status: 500 });
  }
}
