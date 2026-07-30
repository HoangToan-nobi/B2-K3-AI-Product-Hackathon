import { proxyToFastApi } from "@/lib/api/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: RouteContext<"/api/progress/[jobId]/events">,
): Promise<Response> {
  const { jobId } = await context.params;
  return proxyToFastApi(request, `/api/progress/${encodeURIComponent(jobId)}/events`);
}
