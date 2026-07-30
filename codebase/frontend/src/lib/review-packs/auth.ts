import type { AppRole } from "./types";

export function getRequestRole(request: Request): AppRole {
  const url = new URL(request.url);
  const role = request.headers.get("x-vluoi-role") || url.searchParams.get("role");
  return role === "labcoach" ? "labcoach" : "student";
}

export function requireLabCoach(request: Request): Response | null {
  return getRequestRole(request) === "labcoach"
    ? null
    : Response.json({ error: "Lab Coach role required" }, { status: 403 });
}
