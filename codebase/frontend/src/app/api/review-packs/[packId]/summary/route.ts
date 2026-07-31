import { requireLabCoach } from "@/lib/review-packs/auth";
import { addSummaryItem } from "@/lib/review-packs/service";
import type { SummaryItem } from "@/lib/review-packs/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: RouteContext<"/api/review-packs/[packId]/summary">,
): Promise<Response> {
  const forbidden = requireLabCoach(request);
  if (forbidden) return forbidden;

  try {
    const { packId } = await context.params;
    const body = (await request.json()) as Partial<SummaryItem>;
    const pack = await addSummaryItem(packId, body);
    return Response.json({ pack });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cannot add summary";
    return Response.json({ error: message }, { status: 400 });
  }
}
