import { requireLabCoach } from "@/lib/review-packs/auth";
import { exportReviewPackPdf } from "@/lib/review-packs/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: RouteContext<"/api/review-packs/[packId]/export-pdf">,
): Promise<Response> {
  const forbidden = requireLabCoach(request);
  if (forbidden) return forbidden;

  try {
    const { packId } = await context.params;
    const exported = await exportReviewPackPdf(packId);
    return new Response(new Uint8Array(exported.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${exported.filename}"`,
        "X-Artifact-Path": exported.path,
      },
    });
  } catch {
    return Response.json({ error: "Cannot export PDF" }, { status: 500 });
  }
}
