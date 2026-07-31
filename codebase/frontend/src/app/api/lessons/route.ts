import { requireLabCoach } from "@/lib/review-packs/auth";
import { uploadLessonFromForm } from "@/lib/review-packs/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const forbidden = requireLabCoach(request);
  if (forbidden) return forbidden;

  try {
    const form = await request.formData();
    const result = await uploadLessonFromForm(form);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cannot upload lesson";
    return Response.json({ error: message }, { status: 400 });
  }
}
