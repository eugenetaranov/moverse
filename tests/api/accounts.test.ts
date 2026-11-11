// /me, provisioning, jobs, invites, members, account deletion, describe quota.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EMAILS, IDS, call, newUser, signIn, signInAnonymously, sql } from "./helpers";
import me from "../../api/me";
import provision from "../../api/account/provision";
import company from "../../api/account/company";
import profile from "../../api/account/profile";
import accountDelete from "../../api/account/delete";
import jobs from "../../api/jobs";
import invites from "../../api/invites";
import inviteRevoke from "../../api/invite-revoke";
import consume from "../../api/invites/consume";
import members from "../../api/members";
import memberUpdate from "../../api/member-update";
import orgTransfer from "../../api/org-transfer";
import orgLeave from "../../api/org-leave";
import reportToken from "../../api/report-token";
import items from "../../api/items";
import describe from "../../api/describe";

test("/me for an owner: orgs, jobs, company job as default", async () => {
  const r = await call(me, "/me", { token: await signIn(EMAILS.owner) });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.user, { id: IDS.owner, email: EMAILS.owner, isAnonymous: false, displayName: "Olga Owner" });
  assert.deepEqual(r.body.orgs.map((o: any) => [o.name, o.role]), [["Acme Removals", "owner"]]);
  assert.equal(r.body.jobs.length, 2);
  assert.equal(r.body.defaults.orgId, IDS.acme);
});

test("/me self-heals a user with no workspace; provision is idempotent", async () => {
  const u = await newUser("Pia");
  const r = await call(me, "/me", { token: u.token });
  assert.deepEqual(r.body.orgs.map((o: any) => [o.name, o.kind]), [["Pia's move", "personal"]]);
  assert.equal(r.body.jobs[0].name, "My move");
  assert.equal(r.body.defaults.jobId, r.body.jobs[0].id);
  const again = await call(provision, "/account/provision", { token: u.token, body: { intent: "company", orgName: "X" } });
  assert.deepEqual(again.body, { provisioned: false });
});

test("company signup: provision company -> no job yet -> create first job", async () => {
  const u = await newUser("Cleo");
  const p = await call(provision, "/account/provision", { token: u.token, body: { intent: "company", orgName: "Cleo Moves" } });
  assert.equal(p.body.provisioned, true);
  const m = await call(me, "/me", { token: u.token });
  assert.deepEqual([m.body.orgs[0].kind, m.body.jobs.length, m.body.defaults.jobId], ["company", 0, null]);
  const j = await call(jobs, "/jobs", { token: u.token, body: { orgId: p.body.orgId, name: "First job" } });
  assert.equal(j.status, 201);
  const list = await call(jobs, "/jobs", { token: u.token, query: { orgId: p.body.orgId } });
  assert.deepEqual(list.body.jobs.map((x: any) => x.name), ["First job"]);
});

test("personal user can start a company; personal org stays", async () => {
  const u = await newUser("Dee");
  await call(me, "/me", { token: u.token });
  const c = await call(company, "/account/company", { token: u.token, body: { name: "Dee Haulage" } });
  assert.equal(c.status, 200);
  const m = await call(me, "/me", { token: u.token });
  assert.deepEqual(m.body.orgs.map((o: any) => o.kind).sort(), ["company", "personal"]);
});

test("crew cannot create jobs; anonymous cannot provision", async () => {
  const crew = await signIn(EMAILS.crew1);
  assert.equal((await call(jobs, "/jobs", { token: crew, body: { orgId: IDS.acme, name: "Sneaky" } })).status, 403);
  const anon = await signInAnonymously();
  const p = await call(provision, "/account/provision", { token: anon.token, body: { intent: "personal" } });
  assert.deepEqual([p.status, p.body.error], [403, "anonymous_not_allowed"]);
  const m = await call(me, "/me", { token: anon.token });
  assert.deepEqual([m.body.orgs, m.body.user.isAnonymous], [[], true]);
});

test("invite flow: create -> anonymous consume with name -> crew access -> revoke", async () => {
  const admin = await signIn(EMAILS.admin);
  const inv = await call(invites, "/invites", { token: admin, job: IDS.j1, body: { maxUses: 2 } });
  assert.equal(inv.status, 201);
  assert.equal(inv.body.url, `https://moverse.test/j/${inv.body.token}`);
  assert.match(inv.body.token, /^[A-Za-z0-9_-]{24}$/);

  const listed = await call(invites, "/invites", { token: admin, job: IDS.j1 });
  assert.ok(listed.body.invites.every((i: any) => !("token" in i) && !("token_hash" in i)));

  const anon = await signInAnonymously();
  const c = await call(consume, "/invites/consume", { token: anon.token, body: { token: inv.body.url, displayName: "Vic" } });
  assert.deepEqual(c.body, { orgId: IDS.acme, jobId: IDS.j1 });
  assert.equal((await call(items, "/items", { token: anon.token, job: IDS.j1 })).status, 200);
  assert.equal((await call(items, "/items", { token: anon.token, job: IDS.j2 })).status, 404);

  const roster = await call(members, "/members", { token: admin, query: { orgId: IDS.acme } });
  const vic = roster.body.members.find((m: any) => m.userId === anon.userId);
  assert.deepEqual([vic.displayName, vic.role, vic.isAnonymous, vic.jobIds], ["Vic", "crew", true, [IDS.j1]]);

  assert.equal((await call(inviteRevoke, "/invite-revoke", { token: admin, job: IDS.j1, body: { inviteId: inv.body.inviteId } })).status, 200);
  const late = await signInAnonymously();
  const r = await call(consume, "/invites/consume", { token: late.token, body: { token: inv.body.token } });
  assert.deepEqual([r.status, r.body.error], [410, "invite_expired"]);
});

test("invites: use limit, crew and personal cannot create", async () => {
  const owner = await signIn(EMAILS.owner);
  const inv = await call(invites, "/invites", { token: owner, job: IDS.j2, body: { maxUses: 1 } });
  assert.equal((await call(consume, "/invites/consume", { token: (await signInAnonymously()).token, body: { token: inv.body.token } })).status, 200);
  const r = await call(consume, "/invites/consume", { token: (await signInAnonymously()).token, body: { token: inv.body.token } });
  assert.deepEqual([r.status, r.body.error], [410, "invite_used_up"]);

  assert.equal((await call(invites, "/invites", { token: await signIn(EMAILS.crew1), job: IDS.j1, body: {} })).status, 403);
  const solo = await call(invites, "/invites", { token: await signIn(EMAILS.solo), job: IDS.jSolo, body: {} });
  assert.deepEqual([solo.status, solo.body.error], [403, "personal_org_cannot_invite"]);
});

test("members: matrix for role changes, removal, assignment, transfer", async () => {
  const owner = await signIn(EMAILS.owner);
  const admin = await signIn(EMAILS.admin);
  const crew = await signIn(EMAILS.crew1);

  assert.equal((await call(members, "/members", { token: crew, query: { orgId: IDS.acme } })).status, 403);
  const promote = { orgId: IDS.acme, userId: IDS.crew2, action: "set_role", role: "admin" };
  assert.equal((await call(memberUpdate, "/member-update", { token: admin, body: promote })).status, 403);
  assert.equal((await call(memberUpdate, "/member-update", { token: owner, body: promote })).status, 200);
  assert.equal((await call(memberUpdate, "/member-update", { token: owner, body: { ...promote, role: "crew" } })).status, 200);

  const assign = { orgId: IDS.acme, userId: IDS.crew2, action: "assign", jobId: IDS.j1 };
  assert.equal((await call(memberUpdate, "/member-update", { token: admin, body: assign })).status, 200);
  assert.equal(sql(`select count(*) from job_members where user_id = '${IDS.crew2}' and job_id = '${IDS.j1}'`), "1");
  assert.equal((await call(memberUpdate, "/member-update", { token: admin, body: { ...assign, action: "unassign" } })).status, 200);

  const removeAdmin = { orgId: IDS.acme, userId: IDS.admin, action: "remove" };
  assert.equal((await call(memberUpdate, "/member-update", { token: crew, body: removeAdmin })).status, 403);

  assert.deepEqual((await call(orgLeave, "/org-leave", { token: owner, body: { orgId: IDS.acme } })).body, { error: "transfer_ownership_required" });
  assert.equal((await call(orgTransfer, "/org-transfer", { token: admin, body: { orgId: IDS.acme, userId: IDS.admin } })).status, 403);
});

test("report token: admin reads and regenerates, crew cannot", async () => {
  const admin = await signIn(EMAILS.admin);
  const a = await call(reportToken, "/report-token", { token: admin, job: IDS.j1 });
  const b = await call(reportToken, "/report-token", { token: admin, job: IDS.j1, body: {} });
  assert.notEqual(a.body.token, b.body.token);
  assert.equal((await call(reportToken, "/report-token", { token: await signIn(EMAILS.crew1), job: IDS.j1 })).status, 403);
});

test("describe: size cap and quota before calling the model", async () => {
  const token = await signIn(EMAILS.solo);
  const huge = await call(describe, "/describe", { token, job: IDS.jSolo, body: { imageBase64: "x" }, headers: { "content-length": String(2 * 1024 * 1024) } });
  assert.equal(huge.status, 413);
  sql(`insert into usage (org_id, day, describe_count) values ('${IDS.soloOrg}', current_date, 50)
       on conflict (org_id, day) do update set describe_count = 50`);
  const over = await call(describe, "/describe", { token, job: IDS.jSolo, body: { imageBase64: "x" } });
  assert.deepEqual([over.status, over.body.error, over.body.limit], [429, "quota_exceeded", 50]);
});

test("profile sets display name", async () => {
  const u = await newUser("Old");
  assert.equal((await call(profile, "/account/profile", { token: u.token, body: { displayName: "  New Name " } })).status, 200);
  assert.equal(sql(`select raw_user_meta_data->>'display_name' from auth.users where id = '${u.userId}'`), "New Name");
});

test("account deletion: blocked for an owner with members; personal user deleted with data", async () => {
  const owner = await signIn(EMAILS.owner);
  assert.equal((await call(accountDelete, "/account/delete", { token: owner, body: {} })).body.error, "confirm_required");
  const blocked = await call(accountDelete, "/account/delete", { token: owner, body: { confirm: "DELETE" } });
  assert.deepEqual([blocked.status, blocked.body.error, blocked.body.orgs[0].id], [409, "transfer_ownership_required", IDS.acme]);

  const u = await newUser("Gone");
  const m = await call(me, "/me", { token: u.token });
  const orgId = m.body.orgs[0].id;
  const d = await call(accountDelete, "/account/delete", { token: u.token, body: { confirm: "DELETE" } });
  assert.deepEqual(d.body, { ok: true, deletedOrgs: 1 });
  assert.equal(sql(`select count(*) from auth.users where id = '${u.userId}'`), "0");
  assert.equal(sql(`select count(*) from orgs where id = '${orgId}'`), "0");
  assert.equal(sql(`select count(*) from storage_deletions where key_or_prefix = 'org/${orgId}/' and is_prefix`), "1");
});
