import { proxyToFastApi } from "@/lib/api/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return proxyToFastApi(request, "/api/lessons");
}

export async function POST(request: Request): Promise<Response> {
  const backendUrl = `${(process.env.FASTAPI_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "")}/api/lessons`;
  const headers = new Headers();
  const role = request.headers.get("x-vluoi-role");
  if (role) headers.set("x-vluoi-role", role);

  try {
    const backendResponse = await fetch(backendUrl, {
      method: "POST",
      headers,
      body: await request.formData(),
      cache: "no-store",
    });
    return new Response(backendResponse.body, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: backendResponse.headers,
    });
  } catch {
    return Response.json({ error: "FastAPI backend unavailable" }, { status: 502 });
  }
}
