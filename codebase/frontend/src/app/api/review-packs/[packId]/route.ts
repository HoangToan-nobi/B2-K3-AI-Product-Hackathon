import { proxyToFastApi } from "@/lib/api/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: RouteContext<"/api/review-packs/[packId]">,
): Promise<Response> {
  const { packId } = await context.params;
  return proxyToFastApi(request, `/api/review-packs/${encodeURIComponent(packId)}`);
}

