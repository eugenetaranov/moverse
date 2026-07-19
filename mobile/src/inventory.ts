// Read/light-edit client for the browse feature. Talks to the same backend as
// ./api (WORKER_URL + optional x-app-secret); the Airtable token never leaves
// the server. A tiny in-memory cache backs the browse session so switching
// screens is instant; pull-to-refresh forces a reload.
import { WORKER_URL, APP_SECRET } from "./config";

export interface Box {
  boxCode: string;
  name: string;
  type: string;
  destination: string;
  status: string;
  itemCount: number;
}

export interface Item {
  itemId: string;
  itemCode: string;
  description: string;
  photoUrl: string;
  photoThumbUrl: string;
  boxCodes: string[];
  destination: string;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (APP_SECRET) h["x-app-secret"] = APP_SECRET;
  return h;
}

export async function listBoxes(): Promise<Box[]> {
  const res = await fetch(`${WORKER_URL}/boxes`, { headers: headers() });
  if (!res.ok) throw new Error(`Couldn't load boxes (${res.status})`);
  const data = (await res.json()) as { boxes?: Box[] };
  return data.boxes ?? [];
}

export async function listItems(boxCode?: string): Promise<Item[]> {
  const url = boxCode
    ? `${WORKER_URL}/items?box=${encodeURIComponent(boxCode)}`
    : `${WORKER_URL}/items`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`Couldn't load items (${res.status})`);
  const data = (await res.json()) as { items?: Item[] };
  return data.items ?? [];
}

export async function updateItem(payload: {
  itemId: string;
  description?: string;
  boxCodes?: string[];
}): Promise<void> {
  const res = await fetch(`${WORKER_URL}/item-update`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Update failed (${res.status})`);
}

export async function updateBox(payload: {
  boxCode: string;
  name?: string;
  type?: string;
  destination?: string;
  status?: string;
}): Promise<void> {
  const res = await fetch(`${WORKER_URL}/box-update`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Update failed (${res.status})`);
}

export async function deleteItem(itemId: string): Promise<void> {
  const res = await fetch(`${WORKER_URL}/item-delete`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ itemId }),
  });
  if (!res.ok) throw new Error(`Delete failed (${res.status})`);
}

export async function deleteBox(boxCode: string): Promise<void> {
  const res = await fetch(`${WORKER_URL}/box-delete`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ boxCode }),
  });
  if (!res.ok) throw new Error(`Delete failed (${res.status})`);
}

// ---- session cache ----
export interface Inventory {
  boxes: Box[];
  items: Item[];
}

let cache: Inventory | null = null;

// Load the whole inventory once per session; `force` re-fetches (pull-to-refresh
// or after an edit). Boxes and items are fetched in parallel.
export async function loadInventory(force = false): Promise<Inventory> {
  if (cache && !force) return cache;
  const [boxes, items] = await Promise.all([listBoxes(), listItems()]);
  cache = { boxes, items };
  return cache;
}

export function clearInventoryCache(): void {
  cache = null;
}
