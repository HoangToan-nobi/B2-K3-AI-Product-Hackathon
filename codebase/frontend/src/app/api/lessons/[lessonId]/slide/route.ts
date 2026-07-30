import { proxyToFastApi } from "@/lib/api/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: RouteContext<"/api/lessons/[lessonId]/slide">,
): Promise<Response> {
  const { lessonId } = await context.params;
  return proxyToFastApi(request, `/api/lessons/${encodeURIComponent(lessonId)}/slide`);
}

