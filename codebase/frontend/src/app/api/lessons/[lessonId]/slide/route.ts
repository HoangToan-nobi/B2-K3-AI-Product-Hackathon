import { readFile } from "node:fs/promises";
import { getLessonMapping } from "@/lib/review-packs/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext<"/api/lessons/[lessonId]/slide">): Promise<Response> {
  try {
    const { lessonId } = await context.params;
    const lesson = getLessonMapping(lessonId);
    const bytes = await readFile(lesson.slide_pdf);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${lesson.lesson_id}.pdf"`,
      },
    });
  } catch {
    return Response.json({ error: "Slide not found" }, { status: 404 });
  }
}
