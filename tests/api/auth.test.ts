// Request pipeline: JWT verification, job context, roles (design.md D6).
import { test } from "node:test";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import { EMAILS, IDS, call, signIn } from "./helpers";
import { verifyJwt } from "../../lib/auth";
import me from "../../api/me";
import items from "../../api/items";
import itemDelete from "../../api/item-delete";
import jobUpdate from "../../api/job-update";

test("no JWT -> 401", async () => {
  assert.equal((await call(me, "/me")).status, 401);
  assert.equal((await call(items, "/items", { job: IDS.j1 })).status, 401);
});

test("garbage or wrong-issuer JWT -> 401", async () => {
  assert.equal((await call(me, "/me", { token: "not.a.jwt" })).status, 401);
  const forged = await new SignJWT({ sub: IDS.owner, role: "authenticated" })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("authenticated")
    .setIssuer("https://evil.example/auth/v1")
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!));
  assert.equal((await call(me, "/me", { token: forged })).status, 401);
});

test("legacy HS256 tokens verify with SUPABASE_JWT_SECRET", async () => {
  const token = await new SignJWT({ sub: IDS.owner, role: "authenticated" })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("authenticated")
    .setIssuer(`${process.env.SUPABASE_URL}/auth/v1`)
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!));
  assert.equal((await verifyJwt(token)).sub, IDS.owner);
});

test("expired token -> 401", async () => {
  const token = await new SignJWT({ sub: IDS.owner })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("authenticated")
    .setIssuer(`${process.env.SUPABASE_URL}/auth/v1`)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
    .sign(new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!));
  await assert.rejects(verifyJwt(token), { status: 401 });
});

test("wrong method -> 405", async () => {
  const token = await signIn(EMAILS.owner);
  assert.equal((await call(me, "/me", { token, method: "POST", body: {} })).status, 405);
});

test("job header: missing -> 400, malformed/foreign -> 404, never 403", async () => {
  const token = await signIn(EMAILS.crew1);
  assert.deepEqual((await call(items, "/items", { token })).body, { error: "missing_job" });
  assert.equal((await call(items, "/items", { token, job: "nope" })).status, 404);
  assert.equal((await call(items, "/items", { token, job: IDS.jBeta })).status, 404);
  // Crew not assigned to J2: indistinguishable from a job that doesn't exist.
  assert.equal((await call(items, "/items", { token, job: IDS.j2 })).status, 404);
});

test("minRole: crew -> 403 on admin routes, admin allowed", async () => {
  const crew = await signIn(EMAILS.crew1);
  const r = await call(itemDelete, "/item-delete", { token: crew, job: IDS.j1, body: { itemId: IDS.j1Item1 } });
  assert.deepEqual([r.status, r.body.error], [403, "forbidden"]);
  const r2 = await call(jobUpdate, "/job-update", { token: crew, job: IDS.j1, body: { name: "x" } });
  assert.equal(r2.status, 403);

  const admin = await signIn(EMAILS.admin);
  const r3 = await call(jobUpdate, "/job-update", { token: admin, job: IDS.j2, body: { clientName: "K. Jones Jr" } });
  assert.equal(r3.status, 200);
  assert.equal(r3.body.job.clientName, "K. Jones Jr");
});
