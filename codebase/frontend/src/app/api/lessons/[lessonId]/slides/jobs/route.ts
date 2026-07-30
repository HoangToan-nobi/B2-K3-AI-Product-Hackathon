import { proxyToFastApi } from "@/lib/api/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: RouteContext<"/api/lessons/[lessonId]/slides/jobs">,
): Promise<Response> {
  const { lessonId } = await context.params;
  return proxyToFastApi(request, `/api/lessons/${encodeURIComponent(lessonId)}/slides/jobs`);
}
