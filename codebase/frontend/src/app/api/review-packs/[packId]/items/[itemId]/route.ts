import { proxyToFastApi } from "@/lib/api/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/review-packs/[packId]/items/[itemId]">,
): Promise<Response> {
  const { packId, itemId } = await context.params;
  return proxyToFastApi(
    request,
    `/api/review-packs/${encodeURIComponent(packId)}/items/${encodeURIComponent(itemId)}`,
  );
}

