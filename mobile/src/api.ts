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

// created = new item; added = box unioned into an existing item; exists = the
// item was already in that box (no-op).
export type SaveAction = "created" | "added" | "exists";
export interface SaveResult {
  itemId: string;
  action: SaveAction;
}

export async function save(payload: SavePayload): Promise<SaveResult> {
  const res = await fetch(`${WORKER_URL}/save`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`save failed (${res.status})`);
  const data = (await res.json()) as { itemId?: string; action?: SaveAction };
  return { itemId: data.itemId ?? "", action: data.action ?? "created" };
}
