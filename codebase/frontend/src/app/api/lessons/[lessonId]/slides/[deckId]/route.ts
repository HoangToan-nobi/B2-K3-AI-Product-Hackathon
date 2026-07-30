import { proxyToFastApi } from "@/lib/api/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/lessons/[lessonId]/slides/[deckId]">,
): Promise<Response> {
  const { lessonId, deckId } = await context.params;
  return proxyToFastApi(
    request,
    `/api/lessons/${encodeURIComponent(lessonId)}/slides/${encodeURIComponent(deckId)}`,
  );
}
