import { getRequestRole } from "@/lib/review-packs/auth";
import { filterPackForRole, readReviewPack } from "@/lib/review-packs/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext<"/api/review-packs/[packId]">): Promise<Response> {
  try {
    const role = getRequestRole(request);
    const { packId } = await context.params;
    const lessonId = packId.replace(/^pack-/, "").replace(/-\d+$/, "");
    const pack = await readReviewPack(lessonId);
    if (pack.pack_id !== packId) {
      return Response.json({ error: "Review pack not found" }, { status: 404 });
    }
    return Response.json({ pack: filterPackForRole(pack, role), role });
  } catch {
    return Response.json({ error: "Review pack not found" }, { status: 404 });
  }
}
