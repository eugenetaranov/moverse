// Read/light-edit client for the browse feature, on the authenticated API
// client (Bearer JWT + current job). A small in-memory cache per job backs the
// browse session so switching screens is instant; pull-to-refresh reloads.
import { request } from "./apiClient";
import { uploadPhoto } from "./photos";
import { getScope } from "./scope";

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
  photoUrls?: string[]; // all photos (full-res); optional for older backends
  boxCodes: string[];
  destination: string;
}

export async function listBoxes(): Promise<Box[]> {
  const data = await request<{ boxes?: Box[] }>("/boxes");
  return data.boxes ?? [];
}

export async function listItems(boxCode?: string): Promise<Item[]> {
  const data = await request<{ items?: Item[] }>("/items", { query: { box: boxCode } });
  return data.items ?? [];
}

export async function updateItem(payload: {
  itemId: string;
  description?: string;
  boxCodes?: string[];
}): Promise<void> {
  await request("/item-update", { body: payload });
}

export async function updateBox(payload: {
  boxCode: string;
  name?: string;
  type?: string;
  destination?: string;
  status?: string;
}): Promise<void> {
  await request("/box-update", { body: payload });
}

export async function deleteItem(itemId: string): Promise<void> {
  await request("/item-delete", { body: { itemId } });
}

export async function deleteItems(itemIds: string[]): Promise<void> {
  await request("/item-delete", { body: { itemIds } });
}

export async function deleteBox(boxCode: string): Promise<void> {
  await request("/box-delete", { body: { boxCode } });
}

// Append a photo to an existing item (items can hold more than one): upload to
// R2, then attach.
export async function addItemPhoto(itemId: string, photoUri: string): Promise<void> {
  const photoId = await uploadPhoto(photoUri);
  await request("/item-add-photo", { body: { itemId, photoIds: [photoId] } });
}

// ---- session cache ----
export interface Inventory {
  boxes: Box[];
  items: Item[];
}

// Keyed by job: switching jobs (or users) never shows another job's inventory.
const cache = new Map<string, Inventory>();

function cacheKey(): string {
  const sc = getScope();
  return sc ? `${sc.userId}:${sc.jobId}` : "";
}

// Load the whole inventory once per session; `force` re-fetches (pull-to-refresh
// or after an edit). Boxes and items are fetched in parallel.
export async function loadInventory(force = false): Promise<Inventory> {
  const key = cacheKey();
  const hit = cache.get(key);
  if (hit && !force) return hit;
  const [boxes, items] = await Promise.all([listBoxes(), listItems()]);
  const inv = { boxes, items };
  cache.set(key, inv);
  return inv;
}

/** The cached inventory for the current job, if any (offline fallbacks). */
export function cachedInventory(): Inventory | null {
  return cache.get(cacheKey()) ?? null;
}

export function clearInventoryCache(): void {
  cache.delete(cacheKey());
}

/** Sign-out / user switch: drop every job's cache. */
export function clearAllInventoryCaches(): void {
  cache.clear();
}
