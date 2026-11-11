// Photo upload straight to R2 (platform-foundation D8). The API hands out
// presigned PUTs for a photo id the app generated; the photo never passes
// through the API, and /save attaches it by id. Retrying with the same id is
// safe (the server returns the same pending row).
import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";
import { request } from "./apiClient";

const THUMB_PX = 320;

async function sizeOf(uri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || !("size" in info) || !info.size) throw new Error("Photo file missing");
  return info.size;
}

async function put(url: string, uri: string): Promise<void> {
  const res = await FileSystem.uploadAsync(url, uri, {
    httpMethod: "PUT",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { "content-type": "image/jpeg" },
  });
  if (res.status < 200 || res.status >= 300) throw new Error(`Photo upload failed (${res.status})`);
}

/**
 * Upload one captured photo (already resized to 1024 px by Capture) plus a
 * 320 px thumbnail. Returns the photo id to pass to /save or addItemPhoto.
 */
export async function uploadPhoto(uri: string, photoId: string = Crypto.randomUUID()): Promise<string> {
  const thumb = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: THUMB_PX } }], {
    compress: 0.7,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  const [bytes, thumbBytes] = await Promise.all([sizeOf(uri), sizeOf(thumb.uri)]);
  const urls = await request<{ uploadUrl: string; thumbUploadUrl: string }>("/photos/upload-url", {
    body: { photoId, bytes, thumbBytes },
  });
  await Promise.all([put(urls.uploadUrl, uri), put(urls.thumbUploadUrl, thumb.uri)]);
  return photoId;
}
