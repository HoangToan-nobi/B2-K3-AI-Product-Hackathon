import { requireLabCoach } from "@/lib/review-packs/auth";
import { deleteUploadedLesson, renameUploadedLesson } from "@/lib/review-packs/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/lessons/[lessonId]">,
): Promise<Response> {
  const forbidden = requireLabCoach(request);
  if (forbidden) return forbidden;

  try {
    const { lessonId } = await context.params;
    const body = (await request.json()) as { title?: string; max_page?: number };
    const lesson = await renameUploadedLesson(lessonId, body.title || "", body.max_page);
    return Response.json({ lesson });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cannot update lesson";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/lessons/[lessonId]">,
): Promise<Response> {
  const forbidden = requireLabCoach(request);
  if (forbidden) return forbidden;

  try {
    const { lessonId } = await context.params;
    await deleteUploadedLesson(lessonId);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cannot delete lesson";
    return Response.json({ error: message }, { status: 400 });
  }
}
