import { WORKER_URL, APP_SECRET } from "./config";

function headers(): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (APP_SECRET) h["x-app-secret"] = APP_SECRET;
  return h;
}

export async function describe(imageBase64: string): Promise<string> {
  const res = await fetch(`${WORKER_URL}/describe`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ imageBase64 }),
  });
  if (!res.ok) throw new Error(`describe failed (${res.status})`);
  const data = (await res.json()) as { description?: string };
  return data.description ?? "";
}

export interface SavePayload {
  itemCode: string;
  boxCode: string;
  description: string;
  imageBase64: string;
}

// Thrown when the backend rejects a save because the item code already exists.
export class DuplicateItemError extends Error {
  constructor() {
    super("duplicate_item");
    this.name = "DuplicateItemError";
  }
}

export async function save(payload: SavePayload): Promise<void> {
  const res = await fetch(`${WORKER_URL}/save`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload),
  });
  if (res.ok) return;
  let code = "";
  try {
    code = ((await res.json()) as { error?: string }).error ?? "";
  } catch {
    // non-JSON error body; fall through to the generic error
  }
  if (res.status === 409 || code === "duplicate_item") throw new DuplicateItemError();
  throw new Error(`save failed (${res.status})`);
}
