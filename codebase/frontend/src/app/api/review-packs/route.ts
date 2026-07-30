import { getRequestRole, requireLabCoach } from "@/lib/review-packs/auth";
import { createReviewPack, filterPackForRole, listArtifacts, readLocalDb } from "@/lib/review-packs/service";
import type { CreateReviewPackInput } from "@/lib/review-packs/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}

export async function GET(request: Request): Promise<Response> {
  try {
    const role = getRequestRole(request);
    const db = await readLocalDb();
    const { pack, lesson_mapping } = await createReviewPack({ lesson_id: db.active_lesson_id });
    const visiblePack = filterPackForRole(pack, role);
    return Response.json({
      role,
      users: db.users,
      lessons: [
        {
          id: lesson_mapping.lesson_id,
          title: lesson_mapping.title,
          slide_count: lesson_mapping.max_page,
          pack_id: visiblePack.pack_id,
          status: visiblePack.status,
        },
      ],
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
        : "Cannot create review pack";
    return jsonError(message, message.startsWith("Unknown") ? 404 : 500);
  }
}
