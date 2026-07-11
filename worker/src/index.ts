/**
 * Moverse proxy Worker.
 *
 * Holds the Anthropic + Airtable secrets so they never ship on the device.
 * Two endpoints, both POST JSON:
 *   /describe { imageBase64 }                                  -> { description }
 *   /save     { itemCode, boxCode, description, imageBase64 }  -> { ok, itemId }
 *
 * Uses raw fetch() to both upstreams (no SDK) to keep the Worker bundle-free.
 */

export interface Env {
  // secrets (wrangler secret put ...)
  ANTHROPIC_API_KEY: string;
  AIRTABLE_TOKEN: string;
  AIRTABLE_BASE_ID: string;
  APP_SECRET?: string; // optional shared header
  // vars (wrangler.toml [vars])
  ANTHROPIC_MODEL: string;
  AIRTABLE_ITEMS_TABLE: string;
  AIRTABLE_BOXES_TABLE: string;
  AIRTABLE_PHOTO_FIELD: string;
}

const JSON_HEADERS = { "content-type": "application/json" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }

    // Optional shared-secret gate so the public URL isn't openly callable.
    if (env.APP_SECRET && request.headers.get("x-app-secret") !== env.APP_SECRET) {
      return json({ error: "unauthorized" }, 401);
    }

    try {
      if (url.pathname === "/describe") return await handleDescribe(request, env);
      if (url.pathname === "/save") return await handleSave(request, env);
      return json({ error: "not_found" }, 404);
    } catch (err) {
      // Do not log request payloads (they contain photos).
      console.error("worker_error", url.pathname, (err as Error)?.message);
      return json({ error: "internal_error" }, 500);
    }
  },
};

/* ---------------- /describe ---------------- */

async function handleDescribe(request: Request, env: Env): Promise<Response> {
  const { imageBase64 } = (await request.json()) as { imageBase64?: string };
  if (!imageBase64) return json({ error: "missing_image" }, 400);

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL,
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

async function handleSave(request: Request, env: Env): Promise<Response> {
  const { itemCode, boxCode, description, imageBase64 } =
    (await request.json()) as {
      itemCode?: string;
      boxCode?: string;
      description?: string;
      imageBase64?: string;
    };

  if (!itemCode || !boxCode) return json({ error: "missing_codes" }, 400);

  const boxId = await findOrCreateBox(env, boxCode);

  // Create the item record, linked to the box.
  const itemId = await createItem(env, {
    itemCode,
    description: description ?? "",
    boxId,
  });

  // Upload the photo into the item's attachment field (base64 accepted directly).
  if (imageBase64) {
    await uploadPhoto(env, itemId, imageBase64);
  }

  return json({ ok: true, itemId });
}

/* ---------------- Airtable helpers ---------------- */

function airtableApi(env: Env, table: string): string {
  return `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(table)}`;
}

function authHeaders(env: Env): Record<string, string> {
  return { authorization: `Bearer ${env.AIRTABLE_TOKEN}` };
}

async function findOrCreateBox(env: Env, boxCode: string): Promise<string> {
  // Escape single quotes for the filterByFormula string literal.
  const safe = boxCode.replace(/'/g, "\\'");
  const filter = encodeURIComponent(`{Box Code}='${safe}'`);
  const findUrl = `${airtableApi(env, env.AIRTABLE_BOXES_TABLE)}?maxRecords=1&filterByFormula=${filter}`;

  const found = await fetch(findUrl, { headers: authHeaders(env) });
  if (found.ok) {
    const data = (await found.json()) as { records?: Array<{ id: string }> };
    if (data.records && data.records.length > 0) return data.records[0].id;
  }

  // Not found -> create a stub box.
  const created = await fetch(airtableApi(env, env.AIRTABLE_BOXES_TABLE), {
    method: "POST",
    headers: { ...authHeaders(env), "content-type": "application/json" },
    body: JSON.stringify({ fields: { "Box Code": boxCode } }),
  });
  if (!created.ok) throw new Error(`box_create_failed_${created.status}`);
  const box = (await created.json()) as { id: string };
  return box.id;
}

async function createItem(
  env: Env,
  args: { itemCode: string; description: string; boxId: string },
): Promise<string> {
  const created = await fetch(airtableApi(env, env.AIRTABLE_ITEMS_TABLE), {
    method: "POST",
    headers: { ...authHeaders(env), "content-type": "application/json" },
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
  env: Env,
  itemId: string,
  imageBase64: string,
): Promise<void> {
  const field = encodeURIComponent(env.AIRTABLE_PHOTO_FIELD);
  const uploadUrl = `https://content.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${itemId}/${field}/uploadAttachment`;

  const resp = await fetch(uploadUrl, {
    method: "POST",
    headers: { ...authHeaders(env), "content-type": "application/json" },
    body: JSON.stringify({
      contentType: "image/jpeg",
      filename: `${Date.now()}.jpg`,
      file: imageBase64,
    }),
  });
  if (!resp.ok) throw new Error(`photo_upload_failed_${resp.status}`);
}
