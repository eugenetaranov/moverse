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
 * Shared request gate: POST-only, plus the optional shared-secret header so the
 * public URL isn't openly callable. Returns a Response to short-circuit, or null
 * to proceed.
 */
export function guard(req: Request, c: Cfg): Response | null {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
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
  const { itemCode, boxCode, description, imageBase64 } = (await req.json()) as {
    itemCode?: string;
    boxCode?: string;
    description?: string;
    imageBase64?: string;
  };

  if (!itemCode || !boxCode) return json({ error: "missing_codes" }, 400);

  const boxId = await findOrCreateBox(c, boxCode);
  const itemId = await createItem(c, {
    itemCode,
    description: description ?? "",
    boxId,
  });

  if (imageBase64) {
    await uploadPhoto(c, itemId, imageBase64);
  }

  return json({ ok: true, itemId });
}

/* ---------------- Airtable helpers ---------------- */

function airtableApi(c: Cfg, table: string): string {
  return `https://api.airtable.com/v0/${c.baseId}/${encodeURIComponent(table)}`;
}

function authHeaders(c: Cfg): Record<string, string> {
  return { authorization: `Bearer ${c.airtableToken}` };
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
