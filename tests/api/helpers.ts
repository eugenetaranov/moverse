/**
 * API integration test harness (platform-foundation task 3.5, design.md D16).
 *
 * Requires the local stack: `supabase start` + `supabase db reset` (seed) and
 * `scripts/s3-local.sh` (S3 gateway standing in for R2). Route handlers are
 * imported and called directly with real JWTs from signing in seeded users.
 */
import { execSync } from "node:child_process";
import { AwsClient } from "aws4fetch";

export const PASSWORD = "moverse-dev-pass1";

export const IDS = {
  acme: "aaaaaaaa-0000-0000-0000-000000000001",
  beta: "bbbbbbbb-0000-0000-0000-000000000001",
  soloOrg: "cccccccc-0000-0000-0000-000000000001",
  j1: "10000000-0000-0000-0000-000000000001",
  j2: "10000000-0000-0000-0000-000000000002",
  jBeta: "10000000-0000-0000-0000-000000000003",
  jSolo: "10000000-0000-0000-0000-000000000004",
  owner: "00000000-0000-0000-0000-0000000000a1",
  admin: "00000000-0000-0000-0000-0000000000a2",
  crew1: "00000000-0000-0000-0000-0000000000a3",
  crew2: "00000000-0000-0000-0000-0000000000a4",
  outsider: "00000000-0000-0000-0000-0000000000b1",
  solo: "00000000-0000-0000-0000-0000000000c1",
  j1Item1: "30000000-0000-0000-0000-000000000001",
} as const;

export const EMAILS = {
  owner: "owner@acme.test",
  admin: "admin@acme.test",
  crew1: "crew1@acme.test",
  crew2: "crew2@acme.test",
  outsider: "owner@beta.test",
  solo: "solo@personal.test",
} as const;

function loadEnv(): void {
  if (process.env.SUPABASE_URL) return;
  const out = execSync("npx -y supabase@3.1.0 status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const vars = Object.fromEntries(
    out
      .split("\n")
      .map((l) => /^([A-Z_]+)="(.*)"$/.exec(l))
      .filter((m): m is RegExpExecArray => !!m)
      .map((m) => [m[1], m[2]]),
  );
  Object.assign(process.env, {
    SUPABASE_URL: vars.API_URL,
    SUPABASE_ANON_KEY: vars.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: vars.SERVICE_ROLE_KEY,
    SUPABASE_JWT_SECRET: vars.JWT_SECRET,
  });
}

loadEnv();
process.env.R2_ENDPOINT ??= "http://127.0.0.1:9000";
process.env.R2_REGION ??= "us-east-1";
process.env.R2_BUCKET ??= "moverse-test";
process.env.R2_ACCESS_KEY_ID ??= "moverse";
process.env.R2_SECRET_ACCESS_KEY ??= "moverse-secret";
process.env.CRON_SECRET ??= "test-cron-secret";
process.env.INVITE_BASE_URL ??= "https://moverse.test";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const s3 = new AwsClient({
  accessKeyId: process.env.R2_ACCESS_KEY_ID!,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  service: "s3",
  region: process.env.R2_REGION,
});

export async function ensureBucket(): Promise<void> {
  const res = await s3.fetch(`${process.env.R2_ENDPOINT}/${process.env.R2_BUCKET}`, { method: "PUT" });
  if (!res.ok && res.status !== 409) throw new Error(`bucket_create_${res.status}: ${await res.text()}`);
}

const tokens = new Map<string, string>();

export async function signIn(email: string): Promise<string> {
  const cached = tokens.get(email);
  if (cached) return cached;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error(`sign-in failed for ${email}: ${JSON.stringify(body)}`);
  tokens.set(email, body.access_token);
  return body.access_token;
}

export async function signInAnonymously(): Promise<{ token: string; userId: string }> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  const body = (await res.json()) as { access_token?: string; user?: { id: string } };
  if (!body.access_token || !body.user) throw new Error(`anonymous sign-in failed: ${JSON.stringify(body)}`);
  return { token: body.access_token, userId: body.user.id };
}

/** Create a confirmed email user via the admin API and sign them in. */
export async function newUser(displayName = "New User"): Promise<{ token: string; userId: string; email: string }> {
  const email = `u${Date.now()}${Math.floor(Math.random() * 1e6)}@new.test`;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true, user_metadata: { display_name: displayName } }),
  });
  const user = (await res.json()) as { id?: string };
  if (!user.id) throw new Error(`create user failed: ${JSON.stringify(user)}`);
  return { token: await signIn(email), userId: user.id, email };
}

/** Run SQL as the superuser (assertions and fixtures only). */
export function sql(query: string): string {
  return execSync(
    `docker exec -i supabase_db_moverse psql -U postgres -d postgres -tA -v ON_ERROR_STOP=1`,
    { input: query, encoding: "utf8" },
  ).trim();
}

type Handler = (req: Request) => Promise<Response>;

export interface CallOpts {
  method?: string;
  token?: string;
  job?: string;
  body?: unknown;
  query?: Record<string, string>;
  headers?: Record<string, string>;
}

export async function call(
  handler: Handler,
  path: string,
  opts: CallOpts = {},
): Promise<{ status: number; body: any }> {
  const url = new URL(`http://api.test${path}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.job) headers["x-moverse-job"] = opts.job;
  let body: string | undefined;
  if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers["content-type"] = "application/json";
    headers["content-length"] ??= String(Buffer.byteLength(body));
  }
  const res = await handler(new Request(url, { method: opts.method ?? (body ? "POST" : "GET"), headers, body }));
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
