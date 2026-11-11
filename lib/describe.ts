/**
 * POST /describe — one short phrase naming the photographed item, via Claude.
 * Body capped at 1.5 MB before parsing; each call consumes the org's daily
 * quota (design.md D11). Over quota -> 429 and the app falls back to typing.
 */
import type { AuthedCtx } from "./auth";
import { rpc } from "./db";
import { env } from "./env";
import { ApiError, json, readJson } from "./http";

export const MAX_DESCRIBE_BYTES = 1.5 * 1024 * 1024;

export async function handleDescribe(req: Request, ctx: AuthedCtx): Promise<Response> {
  const len = Number(req.headers.get("content-length") ?? "");
  if (!Number.isFinite(len) || len <= 0) throw new ApiError(411, "length_required");
  if (len > MAX_DESCRIBE_BYTES) throw new ApiError(413, "payload_too_large");

  const { imageBase64 } = await readJson<{ imageBase64?: string }>(req);
  if (!imageBase64) throw new ApiError(400, "missing_image");

  const quota = await rpc<{ allowed: boolean; count: number; limit: number }>(
    ctx.db,
    "consume_describe_quota",
    { p_job: ctx.job.id },
  );
  if (!quota.allowed) throw new ApiError(429, "quota_exceeded", { limit: quota.limit });

  const e = env();
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": e.anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: e.anthropicModel,
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
    throw new ApiError(502, "describe_failed");
  }

  const data = (await resp.json()) as { content?: Array<{ type: string; text?: string }> };
  const description = data.content?.find((b) => b.type === "text")?.text?.trim() ?? "";
  return json({ description });
}
