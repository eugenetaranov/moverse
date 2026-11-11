/**
 * Environment config for the API (platform-foundation design.md D1). Every
 * difference between local / staging / prod lives in these env vars.
 */

export interface Env {
  supabaseUrl: string;
  supabaseAnonKey: string;
  /** Optional: only for legacy / self-hosted HS256 projects. */
  supabaseJwtSecret: string;
  anthropicKey: string;
  anthropicModel: string;
  r2: {
    /** Full S3 endpoint; defaults to the account's R2 endpoint. MinIO in tests. */
    endpoint: string;
    /** "auto" for R2; S3 stand-ins in tests need a real region. */
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
  /** Base URL invite links are built on: <base>/j/<token>. */
  inviteBaseUrl: string;
}

export function env(): Env {
  const e = process.env;
  const accountId = e.R2_ACCOUNT_ID ?? "";
  return {
    supabaseUrl: (e.SUPABASE_URL ?? "").replace(/\/$/, ""),
    supabaseAnonKey: e.SUPABASE_ANON_KEY ?? "",
    supabaseJwtSecret: e.SUPABASE_JWT_SECRET ?? "",
    anthropicKey: e.ANTHROPIC_API_KEY ?? "",
    anthropicModel: e.ANTHROPIC_MODEL ?? "claude-haiku-4-5",
    r2: {
      endpoint: (e.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`).replace(/\/$/, ""),
      region: e.R2_REGION || "auto",
      bucket: e.R2_BUCKET ?? "",
      accessKeyId: e.R2_ACCESS_KEY_ID ?? "",
      secretAccessKey: e.R2_SECRET_ACCESS_KEY ?? "",
    },
    inviteBaseUrl: (e.INVITE_BASE_URL ?? "https://moverse.app").replace(/\/$/, ""),
  };
}
