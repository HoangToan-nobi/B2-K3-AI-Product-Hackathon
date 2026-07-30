import { proxyToFastApi } from "@/lib/api/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/lessons/[lessonId]">,
): Promise<Response> {
  const { lessonId } = await context.params;
  return proxyToFastApi(request, `/api/lessons/${encodeURIComponent(lessonId)}`);
}

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/lessons/[lessonId]">,
): Promise<Response> {
  const { lessonId } = await context.params;
  return proxyToFastApi(request, `/api/lessons/${encodeURIComponent(lessonId)}`);
}
