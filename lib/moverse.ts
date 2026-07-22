/**
 * Shared logic for the Moverse API routes (Vercel Edge Functions).
 *
 * Ported verbatim in behavior from the original Cloudflare Worker — same two
 * operations, same Anthropic + Airtable calls via raw fetch(). The only
 * difference is config now comes from process.env instead of a Worker `env`.
 *
 * Secrets (set in Vercel project settings):
 *   ANTHROPIC_API_KEY, AIRTABLE_TOKEN, AIRTABLE_BASE_ID, APP_SECRET (optional)
 * Non-secret config falls back to sensible defaults below, so you only need to
 * set the secrets in Vercel unless your table/field names differ.
 */

export interface Cfg {
  anthropicKey: string;
  anthropicModel: string;
  airtableToken: string;
  baseId: string;
  itemsTable: string;
  boxesTable: string;
  photoField: string;
  appSecret: string;
}

export function cfg(): Cfg {
  return {
    anthropicKey: process.env.ANTHROPIC_API_KEY ?? "",
    anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5",
    airtableToken: process.env.AIRTABLE_TOKEN ?? "",
    baseId: process.env.AIRTABLE_BASE_ID ?? "",
    itemsTable: process.env.AIRTABLE_ITEMS_TABLE ?? "Items",
    boxesTable: process.env.AIRTABLE_BOXES_TABLE ?? "Boxes",
    photoField: process.env.AIRTABLE_PHOTO_FIELD ?? "Photo",
    appSecret: process.env.APP_SECRET ?? "",
  };
}

const JSON_HEADERS = { "content-type": "application/json" };

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/**
 * Shared request gate: checks the HTTP method plus the optional shared-secret
 * header so the public URL isn't openly callable. Writes stay POST-only (the
 * default); read endpoints opt into GET via `{ methods: ["GET"] }`. Returns a
 * Response to short-circuit, or null to proceed.
 */
export function guard(
  req: Request,
  c: Cfg,
  opts?: { methods?: string[] },
): Response | null {
  const allowed = opts?.methods ?? ["POST"];
  if (!allowed.includes(req.method)) return json({ error: "method_not_allowed" }, 405);
  if (c.appSecret && req.headers.get("x-app-secret") !== c.appSecret) {
    return json({ error: "unauthorized" }, 401);
  }
  return null;
}

/* ---------------- /describe ---------------- */

export async function handleDescribe(req: Request, c: Cfg): Promise<Response> {
  const { imageBase64 } = (await req.json()) as { imageBase64?: string };
  if (!imageBase64) return json({ error: "missing_image" }, 400);

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": c.anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: c.anthropicModel,
      max_tokens: 150,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: imageBase64 },
            },
            {
              type: "text",
              text:
                "This is an item being packed for a move. In one short phrase " +
                "(max ~10 words), name what it is. No preamble, no punctuation at the end.",
            },
          ],
        },
      ],
    }),
  });

  if (!resp.ok) {
    console.error("anthropic_error", resp.status);
    return json({ error: "describe_failed" }, 502);
  }

  const data = (await resp.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const description =
    data.content?.find((b) => b.type === "text")?.text?.trim() ?? "";

  return json({ description });
}

/* ---------------- /save ---------------- */

export async function handleSave(req: Request, c: Cfg): Promise<Response> {
  const { itemCode, boxCode, newBox, description, imageBase64 } = (await req.json()) as {
    itemCode?: string;
    boxCode?: string;
    newBox?: boolean; // "none" mode: mint a fresh BOX-#### for this new box
    description?: string;
    imageBase64?: string;
  };

  // "No codes" mode can start a brand-new box with no code — mint one server-side.
  // Otherwise a box code is required.
  let effectiveBoxCode = (boxCode ?? "").trim();
  if (!effectiveBoxCode) {
    if (!newBox) return json({ error: "missing_box" }, 400);
    effectiveBoxCode = await nextBoxCode(c);
  }

  const boxId = await findOrCreateBox(c, effectiveBoxCode);
  const trimmedItem = (itemCode ?? "").trim();

  // "No codes" mode: the client sent no item code. Mint one server-side and
  // always create — mint+create is atomic here, so codeless items can't race.
  if (!trimmedItem) {
    const minted = await nextItemCode(c);
    const itemId = await createItem(c, { itemCode: minted, description: description ?? "", boxId });
    if (imageBase64) await uploadPhoto(c, itemId, imageBase64);
    return json({ ok: true, itemId, itemCode: minted, boxCode: effectiveBoxCode, action: "created" });
  }

  // Coded modes: one record per item code (no duplicate rows), but an item may
  // belong to more than one box — union the box in rather than duplicating.
  const existing = await findItemByCode(c, trimmedItem);
  if (existing) {
    if (existing.boxIds.includes(boxId)) {
      return json({ ok: true, itemId: existing.id, boxCode: effectiveBoxCode, action: "exists" });
    }
    await setItemBoxes(c, existing.id, [...existing.boxIds, boxId]);
    return json({ ok: true, itemId: existing.id, boxCode: effectiveBoxCode, action: "added" });
  }

  const itemId = await createItem(c, {
    itemCode: trimmedItem,
    description: description ?? "",
    boxId,
  });
  if (imageBase64) {
    await uploadPhoto(c, itemId, imageBase64);
  }

  return json({ ok: true, itemId, itemCode: trimmedItem, boxCode: effectiveBoxCode, action: "created" });
}

/* ---------------- /next-code ---------------- */

// The next item code as ITM-#### one above the highest numeric ITM code in
// Airtable. Non-numeric codes (e.g. ITM-DUPCHK-01) are ignored.
async function nextItemCode(c: Cfg): Promise<string> {
  let max = 0;
  let offset: string | undefined;
  do {
    const u = new URL(airtableApi(c, c.itemsTable));
    u.searchParams.set("pageSize", "100");
    u.searchParams.append("fields[]", "Item Code");
    if (offset) u.searchParams.set("offset", offset);

    const res = await fetch(u.toString(), { headers: authHeaders(c) });
    if (!res.ok) throw new Error(`next_code_query_${res.status}`);
    const data = (await res.json()) as {
      records?: Array<{ fields?: { "Item Code"?: string } }>;
      offset?: string;
    };
    for (const r of data.records ?? []) {
      const m = /^ITM-(\d+)$/.exec((r.fields?.["Item Code"] ?? "").trim());
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > max) max = n;
      }
    }
    offset = data.offset;
  } while (offset);

  return `ITM-${String(max + 1).padStart(4, "0")}`;
}

export async function handleNextCode(c: Cfg): Promise<Response> {
  return json({ nextCode: await nextItemCode(c) });
}

/* ---------------- /next-box-code ---------------- */

// The next box code as BOX-#### one above the highest numeric BOX code in
// Airtable. Non-numeric codes (e.g. named boxes like "Kitchen") are ignored.
async function nextBoxCode(c: Cfg): Promise<string> {
  let max = 0;
  let offset: string | undefined;
  do {
    const u = new URL(airtableApi(c, c.boxesTable));
    u.searchParams.set("pageSize", "100");
    u.searchParams.append("fields[]", "Box Code");
    if (offset) u.searchParams.set("offset", offset);

    const res = await fetch(u.toString(), { headers: authHeaders(c) });
    if (!res.ok) throw new Error(`next_box_code_query_${res.status}`);
    const data = (await res.json()) as {
      records?: Array<{ fields?: { "Box Code"?: string } }>;
      offset?: string;
    };
    for (const r of data.records ?? []) {
      const m = /^BOX-(\d+)$/.exec((r.fields?.["Box Code"] ?? "").trim());
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > max) max = n;
      }
    }
    offset = data.offset;
  } while (offset);

  // 2-digit zero padding: BOX-01 … BOX-99, then BOX-100+ naturally. (max is the
  // highest numeric code regardless of its stored padding.)
  return `BOX-${String(max + 1).padStart(2, "0")}`;
}

export async function handleNextBoxCode(c: Cfg): Promise<Response> {
  return json({ nextBoxCode: await nextBoxCode(c) });
}

/* ---------------- Airtable helpers ---------------- */

function airtableApi(c: Cfg, table: string): string {
  return `https://api.airtable.com/v0/${c.baseId}/${encodeURIComponent(table)}`;
}

function authHeaders(c: Cfg): Record<string, string> {
  return { authorization: `Bearer ${c.airtableToken}` };
}

// Returns an existing item with this code and its current box links, or null.
// A code = one physical QR sticker = one record; the boxes are unioned on save.
async function findItemByCode(
  c: Cfg,
  itemCode: string,
): Promise<{ id: string; boxIds: string[] } | null> {
  const safe = itemCode.replace(/'/g, "\\'");
  const filter = encodeURIComponent(`{Item Code}='${safe}'`);
  const findUrl = `${airtableApi(c, c.itemsTable)}?maxRecords=1&filterByFormula=${filter}`;

  const found = await fetch(findUrl, { headers: authHeaders(c) });
  if (found.ok) {
    const data = (await found.json()) as {
      records?: Array<{ id: string; fields?: { Box?: string[] } }>;
    };
    const rec = data.records?.[0];
    if (rec) return { id: rec.id, boxIds: rec.fields?.Box ?? [] };
  }
  return null;
}

// Replace an item's Box links with the given set (used to add another box).
async function setItemBoxes(c: Cfg, itemId: string, boxIds: string[]): Promise<void> {
  const resp = await fetch(`${airtableApi(c, c.itemsTable)}/${itemId}`, {
    method: "PATCH",
    headers: { ...authHeaders(c), "content-type": "application/json" },
    body: JSON.stringify({ fields: { Box: boxIds } }),
  });
  if (!resp.ok) throw new Error(`item_update_failed_${resp.status}`);
}

async function findOrCreateBox(c: Cfg, boxCode: string): Promise<string> {
  // Escape single quotes for the filterByFormula string literal.
  const safe = boxCode.replace(/'/g, "\\'");
  const filter = encodeURIComponent(`{Box Code}='${safe}'`);
  const findUrl = `${airtableApi(c, c.boxesTable)}?maxRecords=1&filterByFormula=${filter}`;

  const found = await fetch(findUrl, { headers: authHeaders(c) });
  if (found.ok) {
    const data = (await found.json()) as { records?: Array<{ id: string }> };
    if (data.records && data.records.length > 0) return data.records[0].id;
  }

  // Not found -> create a stub box.
  const created = await fetch(airtableApi(c, c.boxesTable), {
    method: "POST",
    headers: { ...authHeaders(c), "content-type": "application/json" },
    body: JSON.stringify({ fields: { "Box Code": boxCode } }),
  });
  if (!created.ok) throw new Error(`box_create_failed_${created.status}`);
  const box = (await created.json()) as { id: string };
  return box.id;
}

async function createItem(
  c: Cfg,
  args: { itemCode: string; description: string; boxId: string },
): Promise<string> {
  const created = await fetch(airtableApi(c, c.itemsTable), {
    method: "POST",
    headers: { ...authHeaders(c), "content-type": "application/json" },
    body: JSON.stringify({
      fields: {
        "Item Code": args.itemCode,
        Description: args.description,
        Box: [args.boxId],
      },
    }),
  });
  if (!created.ok) throw new Error(`item_create_failed_${created.status}`);
  const item = (await created.json()) as { id: string };
  return item.id;
}

async function uploadPhoto(
  c: Cfg,
  itemId: string,
  imageBase64: string,
): Promise<void> {
  const field = encodeURIComponent(c.photoField);
  const uploadUrl = `https://content.airtable.com/v0/${c.baseId}/${itemId}/${field}/uploadAttachment`;

  const resp = await fetch(uploadUrl, {
    method: "POST",
    headers: { ...authHeaders(c), "content-type": "application/json" },
    body: JSON.stringify({
      contentType: "image/jpeg",
      filename: `${itemId}.jpg`,
      file: imageBase64,
    }),
  });
  if (!resp.ok) throw new Error(`photo_upload_failed_${resp.status}`);
}

/* ---------------- Read endpoints (browse) ---------------- */

interface AirtableRecord {
  id: string;
  fields?: Record<string, unknown>;
}

// Fetch every record in a table, following Airtable's `offset` pagination.
// `fields` limits the payload to just what we render.
async function listAll(c: Cfg, table: string, fields: string[]): Promise<AirtableRecord[]> {
  const out: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const u = new URL(airtableApi(c, table));
    u.searchParams.set("pageSize", "100");
    for (const f of fields) u.searchParams.append("fields[]", f);
    if (offset) u.searchParams.set("offset", offset);

    const res = await fetch(u.toString(), { headers: authHeaders(c) });
    if (!res.ok) throw new Error(`list_${table}_${res.status}`);
    const data = (await res.json()) as { records?: AirtableRecord[]; offset?: string };
    if (data.records) out.push(...data.records);
    offset = data.offset;
  } while (offset);
  return out;
}

function str(v: unknown): string {
  if (typeof v === "string") return v;
  // Lookups return single-element arrays (e.g. Destination); take the first.
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") return v[0];
  return "";
}

// Sort item/box lists most-recent first: higher numeric code (ITM-####/BOX-####)
// on top; non-numeric (named) codes sort after, alphabetically.
function byCodeDesc<T>(getCode: (x: T) => string) {
  const num = (code: string): number | null => {
    const m = /-(\d+)$/.exec(code.trim());
    return m ? parseInt(m[1], 10) : null;
  };
  return (a: T, b: T): number => {
    const na = num(getCode(a));
    const nb = num(getCode(b));
    if (na !== null && nb !== null) return nb - na; // higher number first
    if (na !== null) return -1; // numeric codes before named ones
    if (nb !== null) return 1;
    return getCode(a).localeCompare(getCode(b));
  };
}

/* ---------------- /boxes ---------------- */

// All boxes with a link-count of the items in each. Reverse `Items` link on the
// Boxes table gives the membership without a second query.
export async function handleListBoxes(c: Cfg): Promise<Response> {
  const recs = await listAll(c, c.boxesTable, [
    "Box Code",
    "Type",
    "Destination",
    "Name / Notes",
    "Status",
    "Items",
  ]);
  const boxes = recs.map((r) => {
    const f = r.fields ?? {};
    return {
      boxCode: str(f["Box Code"]),
      name: str(f["Name / Notes"]),
      type: str(f["Type"]),
      destination: str(f["Destination"]),
      status: str(f["Status"]),
      itemCount: Array.isArray(f["Items"]) ? (f["Items"] as unknown[]).length : 0,
    };
  });
  boxes.sort(byCodeDesc((b) => b.boxCode));
  return json({ boxes });
}

/* ---------------- /items ---------------- */

interface AirtableAttachment {
  url?: string;
  thumbnails?: { large?: { url?: string }; small?: { url?: string } };
}

// All items (optionally scoped to one box code) flattened for the browse UI:
// box record ids are resolved to box codes, and the photo attachment to a
// thumbnail + full url. Airtable attachment urls are short-lived, so the app
// fetches these fresh each session.
export async function handleListItems(req: Request, c: Cfg): Promise<Response> {
  const boxFilter = new URL(req.url).searchParams.get("box")?.trim() || "";

  const boxRecs = await listAll(c, c.boxesTable, ["Box Code"]);
  const idToCode = new Map<string, string>();
  for (const b of boxRecs) idToCode.set(b.id, str(b.fields?.["Box Code"]));

  const itemRecs = await listAll(c, c.itemsTable, [
    "Item Code",
    "Description",
    "Box",
    "Destination",
    c.photoField,
  ]);

  let items = itemRecs.map((r) => {
    const f = r.fields ?? {};
    const boxIds = Array.isArray(f["Box"]) ? (f["Box"] as string[]) : [];
    const boxCodes = boxIds.map((id) => idToCode.get(id) ?? "").filter((code) => code !== "");
    const atts = Array.isArray(f[c.photoField]) ? (f[c.photoField] as AirtableAttachment[]) : [];
    const att = atts[0] ?? null;
    return {
      itemId: r.id,
      itemCode: str(f["Item Code"]),
      description: str(f["Description"]),
      photoUrl: att?.url ?? "", // first photo (row thumbnail)
      photoThumbUrl: att?.thumbnails?.large?.url ?? att?.url ?? "",
      photoUrls: atts.map((a) => a?.url ?? "").filter(Boolean), // all photos, full-res
      boxCodes,
      destination: str(f["Destination"]),
    };
  });

  if (boxFilter) items = items.filter((it) => it.boxCodes.includes(boxFilter));
  items.sort(byCodeDesc((it) => it.itemCode));
  return json({ items });
}

/* ---------------- /item-update ---------------- */

// Light edits from the browse detail screens: patch the description and/or set
// the item's box links to exactly the given codes (creating stub boxes as
// needed). Absent fields are left untouched.
export async function handleItemUpdate(req: Request, c: Cfg): Promise<Response> {
  const { itemId, description, boxCodes } = (await req.json()) as {
    itemId?: string;
    description?: string;
    boxCodes?: string[];
  };
  if (!itemId) return json({ error: "missing_item" }, 400);

  const fields: Record<string, unknown> = {};
  if (typeof description === "string") fields["Description"] = description;
  if (Array.isArray(boxCodes)) {
    const ids: string[] = [];
    for (const code of boxCodes) {
      const trimmed = code.trim();
      if (trimmed) ids.push(await findOrCreateBox(c, trimmed));
    }
    fields["Box"] = ids;
  }
  if (Object.keys(fields).length === 0) return json({ error: "nothing_to_update" }, 400);

  const resp = await fetch(`${airtableApi(c, c.itemsTable)}/${itemId}`, {
    method: "PATCH",
    headers: { ...authHeaders(c), "content-type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!resp.ok) throw new Error(`item_update_failed_${resp.status}`);
  return json({ ok: true });
}

/* ---------------- /item-add-photo ---------------- */

// Append a photo to an existing item's Photo attachment field (Airtable's upload
// API appends rather than replaces), so an item can carry more than one photo.
export async function handleItemAddPhoto(req: Request, c: Cfg): Promise<Response> {
  const { itemId, imageBase64 } = (await req.json()) as {
    itemId?: string;
    imageBase64?: string;
  };
  if (!itemId) return json({ error: "missing_item" }, 400);
  if (!imageBase64) return json({ error: "missing_image" }, 400);
  await uploadPhoto(c, itemId, imageBase64);
  return json({ ok: true });
}

/* ---------------- /box-update ---------------- */

// Edit a box's metadata from the box-detail screen. The box is identified by its
// code (created as a stub if somehow missing). Absent fields are left untouched.
export async function handleBoxUpdate(req: Request, c: Cfg): Promise<Response> {
  const { boxCode, name, type, destination, status } = (await req.json()) as {
    boxCode?: string;
    name?: string;
    type?: string;
    destination?: string;
    status?: string;
  };
  if (!boxCode || !boxCode.trim()) return json({ error: "missing_box" }, 400);

  const id = await findOrCreateBox(c, boxCode.trim());
  const fields: Record<string, unknown> = {};
  if (typeof name === "string") fields["Name / Notes"] = name;
  if (typeof type === "string") fields["Type"] = type;
  if (typeof destination === "string") fields["Destination"] = destination;
  if (typeof status === "string") fields["Status"] = status;
  if (Object.keys(fields).length === 0) return json({ error: "nothing_to_update" }, 400);

  const resp = await fetch(`${airtableApi(c, c.boxesTable)}/${id}`, {
    method: "PATCH",
    headers: { ...authHeaders(c), "content-type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!resp.ok) throw new Error(`box_update_failed_${resp.status}`);
  return json({ ok: true });
}

/* ---------------- /item-delete, /box-delete ---------------- */

// Delete an item record by its Airtable id.
export async function handleItemDelete(req: Request, c: Cfg): Promise<Response> {
  const { itemId } = (await req.json()) as { itemId?: string };
  if (!itemId) return json({ error: "missing_item" }, 400);
  const resp = await fetch(`${airtableApi(c, c.itemsTable)}/${itemId}`, {
    method: "DELETE",
    headers: authHeaders(c),
  });
  if (!resp.ok) throw new Error(`item_delete_failed_${resp.status}`);
  return json({ ok: true });
}

// Delete a box by its code. Items in it keep existing (they just lose the link).
export async function handleBoxDelete(req: Request, c: Cfg): Promise<Response> {
  const { boxCode } = (await req.json()) as { boxCode?: string };
  if (!boxCode || !boxCode.trim()) return json({ error: "missing_box" }, 400);

  const safe = boxCode.trim().replace(/'/g, "\\'");
  const filter = encodeURIComponent(`{Box Code}='${safe}'`);
  const found = await fetch(
    `${airtableApi(c, c.boxesTable)}?maxRecords=1&filterByFormula=${filter}`,
    { headers: authHeaders(c) },
  );
  if (!found.ok) throw new Error(`box_find_failed_${found.status}`);
  const data = (await found.json()) as { records?: Array<{ id: string }> };
  const rec = data.records?.[0];
  if (!rec) return json({ ok: true, deleted: false });

  const resp = await fetch(`${airtableApi(c, c.boxesTable)}/${rec.id}`, {
    method: "DELETE",
    headers: authHeaders(c),
  });
  if (!resp.ok) throw new Error(`box_delete_failed_${resp.status}`);
  return json({ ok: true, deleted: true });
}
