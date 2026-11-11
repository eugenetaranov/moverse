/**
 * POST /photos/upload-url { photoId, bytes, thumbBytes } (design.md D8).
 *
 * Creates (or re-reads, on retry) the pending photo row — the database builds
 * the R2 keys — and returns presigned PUTs bound to the exact sizes. The
 * client uploads straight to R2, then attaches the photoId on /save.
 */
import type { AuthedCtx } from "./auth";
import { rpc } from "./db";
import { ApiError, json, readJson, requireUuid } from "./http";
import { PUT_TTL_S, presignPut } from "./r2";

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const MAX_THUMB_BYTES = 200 * 1024;

function size(v: unknown, max: number): number {
  if (!Number.isInteger(v) || (v as number) <= 0) throw new ApiError(400, "invalid_size");
  if ((v as number) > max) throw new ApiError(413, "payload_too_large");
  return v as number;
}

export async function handleUploadUrl(req: Request, ctx: AuthedCtx): Promise<Response> {
  const body = await readJson<{ photoId?: string; bytes?: number; thumbBytes?: number }>(req);
  const photoId = requireUuid(body.photoId, "invalid_photo_id");
  const bytes = size(body.bytes, MAX_PHOTO_BYTES);
  const thumbBytes = size(body.thumbBytes, MAX_THUMB_BYTES);

  const photo = await rpc<{ photoId: string; storagePath: string; thumbPath: string; status: string }>(
    ctx.db,
    "create_pending_photo",
    { p_job: ctx.job.id, p_photo_id: photoId, p_bytes: bytes },
  );
  const [uploadUrl, thumbUploadUrl] = await Promise.all([
    presignPut(photo.storagePath, bytes),
    presignPut(photo.thumbPath, thumbBytes),
  ]);
  return json({ photoId, status: photo.status, uploadUrl, thumbUploadUrl, expiresIn: PUT_TTL_S });
}
