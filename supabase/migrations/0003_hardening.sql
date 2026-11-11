-- Schema + RLS hardening (platform-foundation design.md D3/D7/D8).
--
-- Fixes the review findings against 0002: any member could write any row in
-- their org (self-promotion, plan edits, invite/report token reads, cross-job
-- links, client-chosen photo keys) and crew job scoping was not enforced.
--
-- After this migration:
--   * one policy per command, gated by role helpers shared with the RPCs;
--   * crew see only jobs they are assigned to (job_members);
--   * composite FKs make cross-job item/box/photo links unrepresentable;
--   * column grants close plan / stripe / report_token / sequence writes;
--   * deleted photos/jobs/orgs queue their R2 keys in storage_deletions.

-- ---------------------------------------------------------------------------
-- Private schema: helpers that must not be exposed as PostgREST RPCs.
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- job_members: crew access list (owners/admins see every job in the org).
-- ---------------------------------------------------------------------------
create table job_members (
  job_id     uuid not null references jobs(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (job_id, user_id)
);
create index job_members_user_idx on job_members(user_id);

-- ---------------------------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------------------------
alter table jobs add column report_enabled boolean not null default true;
drop index jobs_org_idx;
create index jobs_org_status_idx on jobs(org_id, status);

-- ---------------------------------------------------------------------------
-- Boxes & items: composite tenancy keys, authorship, numeric code for sorting.
-- ---------------------------------------------------------------------------
alter table boxes add constraint boxes_id_job_key unique (id, job_id);
alter table items add constraint items_id_job_key unique (id, job_id);

alter table boxes
  add column created_by   uuid default auth.uid() references auth.users(id) on delete set null,
  add column code_seq     integer,
  add column sealed_at    timestamptz,
  add column loaded_at    timestamptz,
  add column delivered_at timestamptz;

-- The client-generated UUID primary key is the idempotency key (D9).
alter table items drop column idempotency_key;
alter table items
  add column created_by uuid default auth.uid() references auth.users(id) on delete set null,
  add column code_seq   integer;

-- unique(job_id, code) already leads with job_id.
drop index boxes_job_idx;
drop index items_job_idx;

-- Numeric part of BOX-nn / ITM-nnnn; null for named boxes or free-form codes.
create or replace function private.set_code_seq()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.code_seq := case
    when new.code ~ '^(BOX|ITM)-[0-9]{1,9}$'
      then substring(new.code from '[0-9]+$')::int
  end;
  return new;
end;
$$;
create trigger boxes_code_seq before insert or update of code on boxes
  for each row execute function private.set_code_seq();
create trigger items_code_seq before insert or update of code on items
  for each row execute function private.set_code_seq();

-- Lifecycle timestamps follow status changes (box-status-tracking).
create or replace function private.set_box_status_times()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status = 'sealed'    then new.sealed_at    := coalesce(new.sealed_at, now()); end if;
    if new.status = 'loaded'    then new.loaded_at    := coalesce(new.loaded_at, now()); end if;
    if new.status = 'delivered' then new.delivered_at := coalesce(new.delivered_at, now()); end if;
  end if;
  return new;
end;
$$;
create trigger boxes_status_times before insert or update of status on boxes
  for each row execute function private.set_box_status_times();

-- ---------------------------------------------------------------------------
-- item_boxes: job_id + composite FKs => an item can't link to another job's box.
-- ---------------------------------------------------------------------------
alter table item_boxes add column job_id uuid;
update item_boxes ib set job_id = i.job_id from items i where i.id = ib.item_id;
alter table item_boxes
  alter column job_id set not null,
  drop constraint item_boxes_item_id_fkey,
  drop constraint item_boxes_box_id_fkey,
  add constraint item_boxes_item_fkey foreign key (item_id, job_id)
    references items(id, job_id) on delete cascade,
  add constraint item_boxes_box_fkey foreign key (box_id, job_id)
    references boxes(id, job_id) on delete cascade;

-- ---------------------------------------------------------------------------
-- photos: pending until attached; keys built by the server (D8).
-- ---------------------------------------------------------------------------
create type photo_status as enum ('pending', 'ready');

alter table photos add column job_id uuid;
update photos p set job_id = i.job_id from items i where i.id = p.item_id;
alter table photos
  alter column job_id set not null,
  alter column item_id drop not null,
  drop constraint photos_item_id_fkey,
  add constraint photos_job_fkey foreign key (job_id)
    references jobs(id) on delete cascade,
  add constraint photos_item_fkey foreign key (item_id, job_id)
    references items(id, job_id) on delete cascade,
  add column status     photo_status not null default 'pending',
  add column thumb_path text,
  add column bytes      integer,
  add column created_by uuid default auth.uid() references auth.users(id) on delete set null,
  add constraint photos_ready_has_item check (status = 'pending' or item_id is not null);
create index photos_job_idx on photos(job_id);

-- Keys must live under the photo's own org/job prefix. A CHECK can't see
-- jobs.org_id, so this is a trigger.
create or replace function private.check_photo_keys()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prefix text;
begin
  select 'org/' || j.org_id || '/job/' || j.id || '/' into prefix
    from jobs j where j.id = new.job_id;
  if left(new.storage_path, length(prefix)) <> prefix
     or (new.thumb_path is not null and left(new.thumb_path, length(prefix)) <> prefix) then
    raise exception 'photo key outside job prefix' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger photos_key_check before insert or update of storage_path, thumb_path, job_id on photos
  for each row execute function private.check_photo_keys();

-- ---------------------------------------------------------------------------
-- invites: hashed tokens, use limits, revocation (D5).
-- ---------------------------------------------------------------------------
delete from invites where job_id is null;
alter table invites
  drop column token,
  add column token_hash bytea not null unique,
  add column max_uses   integer not null default 20 check (max_uses between 1 and 500),
  add column uses       integer not null default 0,
  add column revoked_at timestamptz,
  alter column job_id set not null;
create index invites_job_idx on invites(job_id);

-- unique(org_id, user_id) already leads with org_id.
drop index memberships_org_idx;

-- ---------------------------------------------------------------------------
-- storage_deletions: R2 outbox drained by /api/cron/storage (D8). Service role
-- only: RLS on, no policies.
-- ---------------------------------------------------------------------------
create table storage_deletions (
  id             bigint generated always as identity primary key,
  key_or_prefix  text not null,
  is_prefix      boolean not null default false,
  reason         text not null,
  created_at     timestamptz not null default now(),
  attempts       integer not null default 0
);

create or replace function private.queue_photo_deletion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into storage_deletions (key_or_prefix, reason) values (old.storage_path, 'photo');
  if old.thumb_path is not null then
    insert into storage_deletions (key_or_prefix, reason) values (old.thumb_path, 'photo');
  end if;
  return old;
end;
$$;
create trigger photos_queue_deletion after delete on photos
  for each row execute function private.queue_photo_deletion();

create or replace function private.queue_prefix_deletion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'jobs' then
    insert into storage_deletions (key_or_prefix, is_prefix, reason)
      values ('org/' || old.org_id || '/job/' || old.id || '/', true, 'job');
  else
    insert into storage_deletions (key_or_prefix, is_prefix, reason)
      values ('org/' || old.id || '/', true, 'org');
  end if;
  return old;
end;
$$;
create trigger jobs_queue_deletion after delete on jobs
  for each row execute function private.queue_prefix_deletion();
create trigger orgs_queue_deletion after delete on orgs
  for each row execute function private.queue_prefix_deletion();

-- ---------------------------------------------------------------------------
-- Permission helpers (D3 matrix). SECURITY DEFINER so they bypass RLS and
-- can't recurse; STABLE + (select auth.uid()) so policies evaluate them once
-- per statement.
-- ---------------------------------------------------------------------------
create or replace function org_role(p_org_id uuid)
returns member_role
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select role from memberships
  where org_id = p_org_id and user_id = (select auth.uid());
$$;

create or replace function accessible_job_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select j.id
  from jobs j
  join memberships m on m.org_id = j.org_id and m.user_id = (select auth.uid())
  where m.role in ('owner', 'admin')
     or exists (select 1 from job_members jm
                where jm.job_id = j.id and jm.user_id = m.user_id);
$$;

create or replace function can_access_job(p_job_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select p_job_id in (select accessible_job_ids());
$$;

-- Owner/admin of the job's org.
create or replace function is_job_admin(p_job_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    (select org_role(org_id) in ('owner', 'admin') from jobs where id = p_job_id),
    false);
$$;

-- ---------------------------------------------------------------------------
-- Policies: drop the 0002 for-all policies and their helpers.
-- ---------------------------------------------------------------------------
drop policy orgs_member_access        on orgs;
drop policy memberships_member_access on memberships;
drop policy jobs_member_access        on jobs;
drop policy boxes_member_access       on boxes;
drop policy items_member_access       on items;
drop policy item_boxes_member_access  on item_boxes;
drop policy photos_member_access      on photos;
drop policy invites_member_access     on invites;
drop policy usage_member_access       on usage;
drop function is_job_accessible(uuid);
drop function is_item_accessible(uuid);

alter table job_members       enable row level security;
alter table storage_deletions enable row level security;

-- Table privileges: start from nothing, grant only what the D7 table allows.
-- Column lists close plan/stripe/report_token/sequence holes even for a role
-- that passes the row policy.
revoke all on orgs, memberships, jobs, job_members, boxes, items, item_boxes,
              photos, invites, usage, storage_deletions
  from anon, authenticated;

-- orgs: members read; owner renames. Everything else via RPC.
grant select (id, name, kind, plan, created_at, updated_at) on orgs to authenticated;
grant update (name) on orgs to authenticated;
create policy orgs_select on orgs for select to authenticated
  using (org_role(id) is not null);
create policy orgs_update on orgs for update to authenticated
  using (org_role(id) = 'owner') with check (org_role(id) = 'owner');

-- memberships: members of the org read; writes via RPC.
grant select on memberships to authenticated;
create policy memberships_select on memberships for select to authenticated
  using (org_role(org_id) is not null);

-- jobs: report_token and sequences are neither readable nor writable here.
grant select (id, org_id, name, client_name, status, report_enabled, created_at, updated_at)
  on jobs to authenticated;
grant insert (id, org_id, name, client_name) on jobs to authenticated;
grant update (name, client_name, status, report_enabled) on jobs to authenticated;
-- Checked on the row itself (not via accessible_job_ids()) so INSERT ...
-- RETURNING can see the job it just created.
create policy jobs_select on jobs for select to authenticated
  using (org_role(org_id) in ('owner', 'admin')
         or (org_role(org_id) = 'crew'
             and exists (select 1 from job_members jm
                         where jm.job_id = jobs.id and jm.user_id = (select auth.uid()))));
create policy jobs_insert on jobs for insert to authenticated
  with check (org_role(org_id) in ('owner', 'admin'));
create policy jobs_update on jobs for update to authenticated
  using (org_role(org_id) in ('owner', 'admin'))
  with check (org_role(org_id) in ('owner', 'admin'));

-- job_members: owner/admin see the job's list, crew see their own rows.
grant select, delete on job_members to authenticated;
create policy job_members_select on job_members for select to authenticated
  using (user_id = (select auth.uid()) or is_job_admin(job_id));
create policy job_members_delete on job_members for delete to authenticated
  using (is_job_admin(job_id));

-- boxes / items / item_boxes: accessible job for read+write, admin to delete.
grant select, delete on boxes, items, item_boxes to authenticated;
grant insert (id, job_id, code, name, type, destination, status) on boxes to authenticated;
grant update (code, name, type, destination, status) on boxes to authenticated;
grant insert (id, job_id, code, description) on items to authenticated;
grant update (code, description) on items to authenticated;
grant insert on item_boxes to authenticated;

create policy boxes_select on boxes for select to authenticated
  using (job_id in (select accessible_job_ids()));
create policy boxes_insert on boxes for insert to authenticated
  with check (job_id in (select accessible_job_ids()));
create policy boxes_update on boxes for update to authenticated
  using (job_id in (select accessible_job_ids()))
  with check (job_id in (select accessible_job_ids()));
create policy boxes_delete on boxes for delete to authenticated
  using (is_job_admin(job_id));

create policy items_select on items for select to authenticated
  using (job_id in (select accessible_job_ids()));
create policy items_insert on items for insert to authenticated
  with check (job_id in (select accessible_job_ids()));
create policy items_update on items for update to authenticated
  using (job_id in (select accessible_job_ids()))
  with check (job_id in (select accessible_job_ids()));
create policy items_delete on items for delete to authenticated
  using (is_job_admin(job_id));

-- Unlinking an item from a box is an edit (crew may re-box), not a deletion.
create policy item_boxes_select on item_boxes for select to authenticated
  using (job_id in (select accessible_job_ids()));
create policy item_boxes_insert on item_boxes for insert to authenticated
  with check (job_id in (select accessible_job_ids()));
create policy item_boxes_delete on item_boxes for delete to authenticated
  using (job_id in (select accessible_job_ids()));

-- photos: read on access; create/attach via RPC; admin deletes.
grant select, delete on photos to authenticated;
create policy photos_select on photos for select to authenticated
  using (job_id in (select accessible_job_ids()));
create policy photos_delete on photos for delete to authenticated
  using (is_job_admin(job_id));

-- invites: owner/admin list them (no token column exists); writes via RPC.
grant select (id, org_id, job_id, role, expires_at, created_by, created_at,
              max_uses, uses, revoked_at) on invites to authenticated;
create policy invites_select on invites for select to authenticated
  using (org_role(org_id) in ('owner', 'admin'));

-- usage: owner/admin read; written only by consume_describe_quota.
grant select on usage to authenticated;
create policy usage_select on usage for select to authenticated
  using (org_role(org_id) in ('owner', 'admin'));

-- ---------------------------------------------------------------------------
-- Code minting moves to private.mint_code / reserve_codes (0004), which check
-- job access themselves. The public, unchecked versions go away.
-- ---------------------------------------------------------------------------
drop function reserve_item_codes(uuid, integer);
drop function next_box_code(uuid);
drop function next_item_code(uuid);
drop function is_org_member(uuid);
alter function set_updated_at() set search_path = public, pg_temp;

revoke execute on all functions in schema public, private from public, anon;
