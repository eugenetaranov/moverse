// Capture-flow calls: describe a photo, save an item. Codes come from the
// device pool (codes.ts); photos upload to R2 first (photos.ts).
import * as Crypto from "expo-crypto";
import { request } from "./apiClient";

export async function describe(imageBase64: string): Promise<string> {
  const data = await request<{ description?: string }>("/describe", { body: { imageBase64 } });
  return data.description ?? "";
}

export interface SavePayload {
  itemId?: string; // client UUID: retries of the same save are idempotent
  itemCode?: string; // omitted in "No codes" mode; the server mints one
  boxCode?: string; // omitted when starting a new codeless box (see newBox)
  newBox?: boolean; // "No codes" mode: mint a fresh BOX-nn for a new box
  description: string;
  photoIds: string[]; // already uploaded via photos.uploadPhoto
}

// created = new item; added = box unioned into an existing item; exists = the
// item was already in that box (no-op), or this save was a retry.
export type SaveAction = "created" | "added" | "exists";
export interface SaveResult {
  itemId: string;
  action: SaveAction;
  itemCode?: string; // the code the item ended up with (esp. a server-minted one)
  boxCode?: string; // the box the item ended up in (esp. a server-minted one)
}

export async function save(payload: SavePayload): Promise<SaveResult> {
  const data = await request<Partial<SaveResult>>("/save", {
    body: { ...payload, itemId: payload.itemId ?? Crypto.randomUUID() },
  });
  return {
    itemId: data.itemId ?? "",
    action: data.action ?? "created",
    itemCode: data.itemCode,
    boxCode: data.boxCode,
  };
}
