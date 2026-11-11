/**
 * POST /photos/upload-url { photoId, bytes, thumbBytes } -> { uploadUrl, thumbUploadUrl, expiresIn } (D8).
 */
import { withAuth } from "../../lib/auth";
import { handleUploadUrl } from "../../lib/photos";

export const config = { runtime: "edge" };

export default withAuth(handleUploadUrl, { job: "required" });
