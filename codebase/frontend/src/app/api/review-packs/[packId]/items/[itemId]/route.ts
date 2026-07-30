import { requireLabCoach } from "@/lib/review-packs/auth";
import { updateReviewPackItem } from "@/lib/review-packs/service";
import type { UpdateReviewItemInput } from "@/lib/review-packs/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/review-packs/[packId]/items/[itemId]">,
): Promise<Response> {
  const forbidden = requireLabCoach(request);
  if (forbidden) return forbidden;

  try {
    const { packId, itemId } = await context.params;
    const body = (await request.json()) as UpdateReviewItemInput;
    if (body.action !== "approve" && body.action !== "drop") {
      return Response.json({ error: "Invalid action" }, { status: 400 });
    }
    const pack = await updateReviewPackItem(packId, itemId, body);
    return Response.json({ pack });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("Unknown item_id")
      ? error.message
      : "Cannot update review item";
    return Response.json({ error: message }, { status: message.startsWith("Unknown") ? 404 : 500 });
  }
}
