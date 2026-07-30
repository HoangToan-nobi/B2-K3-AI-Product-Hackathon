const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function backendBaseUrl(): string {
  return (process.env.FASTAPI_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
}

function copyRequestHeaders(request: Request): Headers {
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });
  return headers;
}

function copyResponseHeaders(response: Response): Headers {
  const headers = new Headers();
  response.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });
  return headers;
}

export async function proxyToFastApi(request: Request, pathname: string): Promise<Response> {
  const sourceUrl = new URL(request.url);
  const targetUrl = new URL(`${backendBaseUrl()}${pathname}`);
  targetUrl.search = sourceUrl.search;

  const init: RequestInit = {
    method: request.method,
    headers: copyRequestHeaders(request),
    cache: "no-store",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    const body = await request.arrayBuffer();
    if (body.byteLength > 0) {
      init.body = body;
    }
  }

  try {
    const backendResponse = await fetch(targetUrl, init);
    return new Response(backendResponse.body, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: copyResponseHeaders(backendResponse),
    });
  } catch {
    return Response.json({ error: "FastAPI backend unavailable" }, { status: 502 });
  }
}

