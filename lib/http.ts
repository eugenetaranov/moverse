/**
 * Small HTTP helpers shared by every route: JSON responses, a typed API error
 * that maps straight to { error: <code> }, and body parsing.
 */

const JSON_HEADERS = { "content-type": "application/json" };

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/** Thrown anywhere in a handler; withAuth turns it into { error, ...extra }. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public extra?: Record<string, unknown>,
  ) {
    super(code);
  }
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError(400, "invalid_json");
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export function requireUuid(v: unknown, code: string): string {
  if (!isUuid(v)) throw new ApiError(400, code);
  return v;
}
