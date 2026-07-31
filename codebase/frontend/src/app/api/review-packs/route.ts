import { getRequestRole, requireLabCoach } from "@/lib/review-packs/auth";
import { createReviewPack, listArtifacts, listLessonCatalog } from "@/lib/review-packs/service";
import type { CreateReviewPackInput } from "@/lib/review-packs/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}

export async function GET(request: Request): Promise<Response> {
  try {
    const role = getRequestRole(request);
    return Response.json({
      role,
      lessons: await listLessonCatalog(role),
    });
  } catch {
    return jsonError("Cannot load review pack catalog", 500);
  }
}

export async function POST(request: Request): Promise<Response> {
  const forbidden = requireLabCoach(request);
  if (forbidden) return forbidden;

  try {
    const body = (await request.json().catch(() => ({}))) as CreateReviewPackInput;
    const result = await createReviewPack(body);
    const artifacts = await listArtifacts(result.pack.lesson.id);
    return Response.json({ ...result, artifacts });
  } catch (error) {
    const message = error instanceof Error && error.message.startsWith("Unknown lesson_id")
      ? error.message
      : error instanceof Error && error.message.includes("ENOENT")
        ? "Cannot create review pack: missing pipeline artifact. Run codebase/pipeline/run_all.sh once or use the committed shared artifacts."
        : error instanceof Error
          ? error.message
          : "Cannot create review pack";
    return jsonError(message, message.startsWith("Unknown") ? 404 : 500);
  }
}
