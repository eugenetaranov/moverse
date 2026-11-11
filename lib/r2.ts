/**
 * Cloudflare R2 (S3-compatible) access with aws4fetch (design.md D8). Path-style
 * URLs, so the same code talks to R2 in prod and MinIO in tests.
 *
 * Photos never pass through the API: clients PUT straight to presigned URLs
 * and read through presigned GETs. Keys are always built by the database.
 */
import { AwsClient } from "aws4fetch";
import { env } from "./env";

export const PUT_TTL_S = 15 * 60;
export const GET_TTL_S = 60 * 60;

let client: AwsClient | null = null;

function aws(): AwsClient {
  if (!client) {
    const { r2 } = env();
    client = new AwsClient({
      accessKeyId: r2.accessKeyId,
      secretAccessKey: r2.secretAccessKey,
      service: "s3",
      region: r2.region,
    });
  }
  return client;
}

/** Reset the cached client (tests switch credentials). */
export function resetR2(): void {
  client = null;
}

function objectUrl(key: string): URL {
  const { r2 } = env();
  const path = key.split("/").map(encodeURIComponent).join("/");
  return new URL(`${r2.endpoint}/${r2.bucket}/${path}`);
}

async function presign(key: string, method: string, ttl: number, headers?: Record<string, string>) {
  const url = objectUrl(key);
  url.searchParams.set("X-Amz-Expires", String(ttl));
  const signed = await aws().sign(url.toString(), {
    method,
    headers,
    // Sign content-type/length too, so the upload must match what we allowed.
    aws: { signQuery: true, allHeaders: true },
  });
  return signed.url;
}

/** Presigned PUT bound to an exact JPEG size. */
export function presignPut(key: string, bytes: number): Promise<string> {
  return presign(key, "PUT", PUT_TTL_S, {
    "content-type": "image/jpeg",
    "content-length": String(bytes),
  });
}

export function presignGet(key: string): Promise<string> {
  return presign(key, "GET", GET_TTL_S);
}

export async function headObject(key: string): Promise<boolean> {
  const res = await aws().fetch(objectUrl(key).toString(), { method: "HEAD" });
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`r2_head_${res.status}`);
  return true;
}

export async function putObject(key: string, body: Uint8Array, contentType = "image/jpeg"): Promise<void> {
  const res = await aws().fetch(objectUrl(key).toString(), {
    method: "PUT",
    body,
    headers: { "content-type": contentType },
  });
  if (!res.ok) throw new Error(`r2_put_${res.status}`);
}

export async function deleteObject(key: string): Promise<void> {
  const res = await aws().fetch(objectUrl(key).toString(), { method: "DELETE" });
  // S3 returns 204 for both deleted and already-missing keys.
  if (!res.ok && res.status !== 404) throw new Error(`r2_delete_${res.status}`);
}

/** All keys under a prefix (ListObjectsV2, following continuation tokens). */
export async function listKeys(prefix: string): Promise<string[]> {
  const { r2 } = env();
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const u = new URL(`${r2.endpoint}/${r2.bucket}`);
    u.searchParams.set("list-type", "2");
    u.searchParams.set("prefix", prefix);
    if (token) u.searchParams.set("continuation-token", token);
    const res = await aws().fetch(u.toString());
    if (!res.ok) throw new Error(`r2_list_${res.status}`);
    const xml = await res.text();
    for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) keys.push(unescapeXml(m[1]));
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
      ? unescapeXml(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml)?.[1] ?? "")
      : undefined;
  } while (token);
  return keys;
}

/**
 * Delete keys with bounded parallelism. Per-object DELETE instead of the
 * DeleteObjects batch call: the batch API needs Content-MD5, which WebCrypto
 * can't compute, and cleanup volume is small.
 */
export async function deleteKeys(keys: string[], concurrency = 8): Promise<void> {
  let i = 0;
  const worker = async () => {
    while (i < keys.length) await deleteObject(keys[i++]);
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, keys.length) }, worker));
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
