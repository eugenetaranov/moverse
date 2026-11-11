-- Domain and privileged RPCs (platform-foundation D4/D5/D7/D9/D11/D12/D14).
--
-- Privileged RPCs are SECURITY DEFINER and check auth.uid() + the D3 matrix
-- themselves, so the API never needs the service role for them. Inventory
-- RPCs are SECURITY INVOKER: they run under the caller's RLS and are atomic.
--
-- Errors are raised with a stable snake_case MESSAGE and SQLSTATE 'P0001'; the
-- API maps the message straight to { error: <code> } (lib/db.ts).

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------
create or replace function private.require_uid()
returns uuid
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  return uid;
end;
$$;

create or replace function private.is_anonymous()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

create or replace function private.format_code(p_kind text, p_n integer)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_kind
    when 'box'  then 'BOX-' || lpad(p_n::text, 2, '0')
    when 'item' then 'ITM-' || lpad(p_n::text, 4, '0')
  end;
$$;

-- Atomically advance a job sequence by p_count and return the last value.
-- UPDATE ... RETURNING is race-free across devices (D12).
create or replace function private.advance_seq(p_job uuid, p_kind text, p_count integer)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  if not can_access_job(p_job) then raise exception 'job_not_found'; end if;
  if p_kind = 'box' then
    update jobs set box_seq = box_seq + p_count where id = p_job returning box_seq into n;
  elsif p_kind = 'item' then
    update jobs set item_seq = item_seq + p_count where id = p_job returning item_seq into n;
  else
    raise exception 'invalid_kind';
  end if;
  return n;
end;
$$;

-- A client-supplied numeric code (from a pool or a hand-written label) bumps
-- the sequence so a later mint can never collide with it (D9).
create or replace function private.bump_seq(p_job uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  if p_code !~ '^(BOX|ITM)-[0-9]{1,9}$' then return; end if;
  if not can_access_job(p_job) then raise exception 'job_not_found'; end if;
  n := substring(p_code from '[0-9]+$')::int;
  if p_code like 'BOX-%' then
    update jobs set box_seq = greatest(box_seq, n) where id = p_job;
  else
    update jobs set item_seq = greatest(item_seq, n) where id = p_job;
  end if;
end;
$$;

create or replace function private.mint_code(p_job uuid, p_kind text)
returns text
language sql
set search_path = public, pg_temp
as $$
  select private.format_code(p_kind, private.advance_seq(p_job, p_kind, 1));
$$;

-- Find a box by code in the job, creating a stub if missing.
create or replace function private.find_or_create_box(p_job uuid, p_code text)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  bid uuid;
begin
  select id into bid from boxes where job_id = p_job and code = p_code;
  if bid is null then
    insert into boxes (job_id, code) values (p_job, p_code)
      on conflict (job_id, code) do nothing
      returning id into bid;
    if bid is null then
      select id into bid from boxes where job_id = p_job and code = p_code;
    end if;
    perform private.bump_seq(p_job, p_code);
  end if;
  return bid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Request context (D6 step 4): one call per API request. Returns no row when
-- the caller can't access the job, which the API reports as 404.
-- ---------------------------------------------------------------------------
create or replace function job_context(p_job uuid)
returns table (job_id uuid, org_id uuid, org_kind org_kind, job_status job_status,
               role member_role, assigned boolean)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select j.id, j.org_id, o.kind, j.status, m.role,
         exists (select 1 from job_members jm
                 where jm.job_id = j.id and jm.user_id = m.user_id)
  from jobs j
  join orgs o on o.id = j.org_id
  join memberships m on m.org_id = j.org_id and m.user_id = (select auth.uid())
  where j.id = p_job
    and (m.role in ('owner', 'admin')
         or exists (select 1 from job_members jm
                    where jm.job_id = j.id and jm.user_id = m.user_id));
$$;

-- ---------------------------------------------------------------------------
-- Provisioning (D4)
-- ---------------------------------------------------------------------------
create or replace function private.display_name(p_uid uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    nullif(btrim(raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(email, '@', 1), ''),
    'My')
  from auth.users where id = p_uid;
$$;

create or replace function provision_account(p_intent text, p_org_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := private.require_uid();
  oid uuid;
  jid uuid;
begin
  if private.is_anonymous() then raise exception 'anonymous_not_allowed'; end if;
  if p_intent not in ('personal', 'company') then raise exception 'invalid_intent'; end if;

  -- Serialise concurrent provision calls for the same user (app retries).
  perform pg_advisory_xact_lock(hashtextextended('provision:' || uid::text, 0));
  if exists (select 1 from memberships where user_id = uid) then
    return jsonb_build_object('provisioned', false);
  end if;

  if p_intent = 'personal' then
    insert into orgs (name, kind) values (private.display_name(uid) || '''s move', 'personal')
      returning id into oid;
    insert into memberships (org_id, user_id, role) values (oid, uid, 'owner');
    insert into jobs (org_id, name) values (oid, 'My move') returning id into jid;
  else
    if coalesce(btrim(p_org_name), '') = '' then raise exception 'missing_org_name'; end if;
    insert into orgs (name, kind) values (btrim(p_org_name), 'company') returning id into oid;
    insert into memberships (org_id, user_id, role) values (oid, uid, 'owner');
  end if;

  return jsonb_build_object('provisioned', true, 'orgId', oid, 'jobId', jid);
end;
$$;

-- "Start a company" from Settings: a personal user gets a NEW company org; the
-- personal org stays (D3).
create or replace function create_company(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := private.require_uid();
  oid uuid;
begin
  if private.is_anonymous() then raise exception 'anonymous_not_allowed'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'missing_org_name'; end if;
  insert into orgs (name, kind) values (btrim(p_name), 'company') returning id into oid;
  insert into memberships (org_id, user_id, role) values (oid, uid, 'owner');
  return oid;
end;
$$;

-- /me payload (D4 step 3). Orgs the caller belongs to and every job they can
-- access. The API adds `defaults` and self-heals when orgs is empty.
create or replace function me()
returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'orgs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', o.id, 'name', o.name, 'kind', o.kind, 'role', m.role, 'plan', o.plan)
             order by o.kind desc, o.created_at)
      from memberships m join orgs o on o.id = m.org_id
      where m.user_id = (select auth.uid())), '[]'::jsonb),
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', j.id, 'orgId', j.org_id, 'name', j.name,
               'clientName', j.client_name, 'status', j.status)
             order by j.status, j.created_at desc)
      from jobs j where j.id in (select accessible_job_ids())), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- Invites (D5)
-- ---------------------------------------------------------------------------
create or replace function create_invite(p_job uuid, p_expires_hours integer default 168,
                                         p_max_uses integer default 20)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  uid uuid := private.require_uid();
  j record;
  tok text;
  iid uuid;
  exp timestamptz;
begin
  select jobs.id, jobs.org_id, orgs.kind into j
    from jobs join orgs on orgs.id = jobs.org_id where jobs.id = p_job;
  if j.id is null or not can_access_job(p_job) then raise exception 'job_not_found'; end if;
  if org_role(j.org_id) not in ('owner', 'admin') then raise exception 'forbidden'; end if;
  if j.kind <> 'company' then raise exception 'personal_org_cannot_invite'; end if;
  if p_expires_hours not between 1 and 720 then raise exception 'invalid_expiry'; end if;
  if p_max_uses not between 1 and 500 then raise exception 'invalid_max_uses'; end if;

  -- 144 random bits, base64url without padding (18 bytes -> 24 chars).
  tok := translate(encode(gen_random_bytes(18), 'base64'), '+/', '-_');
  exp := now() + make_interval(hours => p_expires_hours);
  insert into invites (org_id, job_id, role, token_hash, expires_at, max_uses, created_by)
    values (j.org_id, p_job, 'crew', digest(tok, 'sha256'), exp, p_max_uses, uid)
    returning id into iid;
  return jsonb_build_object('inviteId', iid, 'token', tok, 'expiresAt', exp,
                            'maxUses', p_max_uses);
end;
$$;

create or replace function revoke_invite(p_invite uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  oid uuid;
begin
  perform private.require_uid();
  select org_id into oid from invites where id = p_invite;
  if oid is null or coalesce(org_role(oid) not in ('owner', 'admin'), true) then
    raise exception 'invite_not_found';
  end if;
  update invites set revoked_at = coalesce(revoked_at, now()) where id = p_invite;
end;
$$;

create or replace function consume_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  uid uuid := private.require_uid();
  inv invites%rowtype;
begin
  select * into inv from invites
    where token_hash = digest(btrim(coalesce(p_token, '')), 'sha256')
    for update;
  if inv.id is null then raise exception 'invite_invalid'; end if;
  if inv.revoked_at is not null or inv.expires_at < now() then raise exception 'invite_expired'; end if;

  -- Re-joining with the same invite is idempotent and doesn't burn a use.
  if exists (select 1 from job_members where job_id = inv.job_id and user_id = uid) then
    return jsonb_build_object('orgId', inv.org_id, 'jobId', inv.job_id);
  end if;
  if inv.uses >= inv.max_uses then raise exception 'invite_used_up'; end if;

  -- Never downgrade an existing owner/admin.
  insert into memberships (org_id, user_id, role) values (inv.org_id, uid, 'crew')
    on conflict (org_id, user_id) do nothing;
  insert into job_members (job_id, user_id) values (inv.job_id, uid)
    on conflict do nothing;
  update invites set uses = uses + 1 where id = inv.id;
  return jsonb_build_object('orgId', inv.org_id, 'jobId', inv.job_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Members (D3 matrix)
-- ---------------------------------------------------------------------------
create or replace function set_member_role(p_org uuid, p_user uuid, p_role member_role)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target member_role;
begin
  perform private.require_uid();
  if org_role(p_org) is distinct from 'owner' then raise exception 'forbidden'; end if;
  if p_role = 'owner' then raise exception 'use_transfer_ownership'; end if;
  select role into target from memberships where org_id = p_org and user_id = p_user;
  if target is null then raise exception 'member_not_found'; end if;
  if target = 'owner' then raise exception 'forbidden'; end if;
  if p_role = 'admin' and exists (select 1 from auth.users where id = p_user and is_anonymous) then
    raise exception 'anonymous_cannot_be_admin';
  end if;
  update memberships set role = p_role where org_id = p_org and user_id = p_user;
end;
$$;

create or replace function remove_member(p_org uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me_role member_role := org_role(p_org);
  target  member_role;
begin
  perform private.require_uid();
  if p_user = auth.uid() then raise exception 'use_leave_org'; end if;
  select role into target from memberships where org_id = p_org and user_id = p_user;
  if me_role is null or target is null then raise exception 'member_not_found'; end if;
  if not (me_role = 'owner' and target <> 'owner'
          or me_role = 'admin' and target = 'crew') then
    raise exception 'forbidden';
  end if;
  delete from job_members jm using jobs j
    where jm.job_id = j.id and j.org_id = p_org and jm.user_id = p_user;
  delete from memberships where org_id = p_org and user_id = p_user;
end;
$$;

create or replace function assign_job(p_job uuid, p_user uuid, p_assign boolean default true)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  oid uuid;
begin
  perform private.require_uid();
  select org_id into oid from jobs where id = p_job;
  if oid is null or not is_job_admin(p_job) then raise exception 'job_not_found'; end if;
  if not exists (select 1 from memberships where org_id = oid and user_id = p_user) then
    raise exception 'member_not_found';
  end if;
  if p_assign then
    insert into job_members (job_id, user_id) values (p_job, p_user) on conflict do nothing;
  else
    delete from job_members where job_id = p_job and user_id = p_user;
  end if;
end;
$$;

create or replace function transfer_ownership(p_org uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := private.require_uid();
begin
  if org_role(p_org) is distinct from 'owner' then raise exception 'forbidden'; end if;
  if p_user = uid then return; end if;
  if not exists (select 1 from memberships where org_id = p_org and user_id = p_user) then
    raise exception 'member_not_found';
  end if;
  if exists (select 1 from auth.users where id = p_user and is_anonymous) then
    raise exception 'anonymous_cannot_be_owner';
  end if;
  update memberships set role = 'admin' where org_id = p_org and user_id = uid;
  update memberships set role = 'owner' where org_id = p_org and user_id = p_user;
end;
$$;

create or replace function leave_org(p_org uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := private.require_uid();
  r member_role := org_role(p_org);
begin
  if r is null then raise exception 'member_not_found'; end if;
  if r = 'owner' then raise exception 'transfer_ownership_required'; end if;
  delete from job_members jm using jobs j
    where jm.job_id = j.id and j.org_id = p_org and jm.user_id = uid;
  delete from memberships where org_id = p_org and user_id = uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Report token (owner/admin only; crew can't read the column at all).
-- ---------------------------------------------------------------------------
create or replace function get_report_token(p_job uuid)
returns text
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  tok text;
begin
  perform private.require_uid();
  if not is_job_admin(p_job) then raise exception 'job_not_found'; end if;
  select report_token into tok from jobs where id = p_job;
  return tok;
end;
$$;

create or replace function regenerate_report_token(p_job uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  tok text;
begin
  perform private.require_uid();
  if not is_job_admin(p_job) then raise exception 'job_not_found'; end if;
  update jobs set report_token = encode(gen_random_bytes(18), 'hex')
    where id = p_job returning report_token into tok;
  return tok;
end;
$$;

-- ---------------------------------------------------------------------------
-- /describe quota (D11): free 50/day, company 2,000/day per org.
-- ---------------------------------------------------------------------------
create or replace function consume_describe_quota(p_job uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  oid uuid;
  lim integer;
  n integer;
begin
  perform private.require_uid();
  if not can_access_job(p_job) then raise exception 'job_not_found'; end if;
  select o.id, case o.plan when 'company' then 2000 else 50 end into oid, lim
    from jobs j join orgs o on o.id = j.org_id where j.id = p_job;
  insert into usage (org_id, day, describe_count) values (oid, current_date, 1)
    on conflict (org_id, day) do update set describe_count = usage.describe_count + 1
    returning describe_count into n;
  return jsonb_build_object('allowed', n <= lim, 'count', n, 'limit', lim);
end;
$$;

-- ---------------------------------------------------------------------------
-- Account deletion (D14)
-- ---------------------------------------------------------------------------
create or replace function account_deletion_plan()
returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'blocked', coalesce(bool_or(o.kind = 'company' and others > 0), false),
    'orgs', coalesce(jsonb_agg(jsonb_build_object(
              'id', o.id, 'name', o.name, 'kind', o.kind, 'otherMembers', others)), '[]'::jsonb))
  from memberships m
  join orgs o on o.id = m.org_id
  cross join lateral (select count(*)::int as others from memberships x
                      where x.org_id = o.id and x.user_id <> m.user_id) c
  where m.user_id = (select auth.uid()) and m.role = 'owner';
$$;

-- Step 3: delete every org the caller solely owns with no other members.
-- Raises if a company org still has members (transfer first).
create or replace function delete_owned_orgs()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := private.require_uid();
  n integer;
begin
  if (account_deletion_plan() ->> 'blocked')::boolean then
    raise exception 'transfer_ownership_required';
  end if;
  delete from orgs o
    using memberships m
    where m.org_id = o.id and m.user_id = uid and m.role = 'owner'
      and not exists (select 1 from memberships x where x.org_id = o.id and x.user_id <> uid);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Codes (D12)
-- ---------------------------------------------------------------------------
create or replace function reserve_codes(p_job uuid, p_kind text, p_count integer)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  last_n integer;
begin
  perform private.require_uid();
  if p_kind not in ('item', 'box') then raise exception 'invalid_kind'; end if;
  if p_count is null or p_count not between 1 and 200 then raise exception 'invalid_count'; end if;
  last_n := private.advance_seq(p_job, p_kind, p_count);
  return jsonb_build_object(
    'kind', p_kind,
    'first', last_n - p_count + 1,
    'last', last_n,
    'format', case p_kind when 'box' then 'BOX-nn' else 'ITM-nnnn' end);
end;
$$;

-- ---------------------------------------------------------------------------
-- Photos (D8). Keys are built here, never by the client.
-- ---------------------------------------------------------------------------
create or replace function create_pending_photo(p_job uuid, p_photo_id uuid, p_bytes integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := private.require_uid();
  oid uuid;
  prefix text;
  p photos%rowtype;
begin
  if not can_access_job(p_job) then raise exception 'job_not_found'; end if;
  select * into p from photos where id = p_photo_id;
  if p.id is not null then
    if p.job_id <> p_job then raise exception 'photo_conflict'; end if;
  else
    select org_id into oid from jobs where id = p_job;
    prefix := 'org/' || oid || '/job/' || p_job || '/photo/' || p_photo_id;
    insert into photos (id, job_id, storage_path, thumb_path, bytes, status, created_by)
      values (p_photo_id, p_job, prefix || '.jpg', prefix || '_t.jpg', p_bytes, 'pending', uid)
      returning * into p;
  end if;
  return jsonb_build_object('photoId', p.id, 'storagePath', p.storage_path,
                            'thumbPath', p.thumb_path, 'status', p.status);
end;
$$;

-- Attach uploaded photos to an item (the API has already HEADed each object).
-- Only pending photos of the same job, or ones already on this item, qualify.
create or replace function attach_photos(p_job uuid, p_item_id uuid, p_photo_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  perform private.require_uid();
  if not can_access_job(p_job) then raise exception 'job_not_found'; end if;
  if not exists (select 1 from items where id = p_item_id and job_id = p_job) then
    raise exception 'item_not_found';
  end if;
  if exists (select 1 from unnest(coalesce(p_photo_ids, '{}')) pid
             left join photos ph on ph.id = pid
             where ph.id is null or ph.job_id <> p_job
                or (ph.item_id is not null and ph.item_id <> p_item_id)) then
    raise exception 'photo_not_found';
  end if;
  update photos set item_id = p_item_id, status = 'ready'
    where id = any(p_photo_ids) and job_id = p_job;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Inventory writes (D9). SECURITY INVOKER: the caller's RLS applies.
-- ---------------------------------------------------------------------------
create or replace function save_item(
  p_job         uuid,
  p_item_id     uuid,
  p_item_code   text default null,
  p_box_code    text default null,
  p_new_box     boolean default false,
  p_description text default '',
  p_photo_ids   uuid[] default '{}'
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  box_code  text := nullif(btrim(coalesce(p_box_code, '')), '');
  item_code text := nullif(btrim(coalesce(p_item_code, '')), '');
  bid    uuid;
  it     items%rowtype;
  linked boolean;
  action text;
begin
  perform private.require_uid();
  if p_item_id is null then raise exception 'missing_item_id'; end if;
  if not can_access_job(p_job) then raise exception 'job_not_found'; end if;

  -- Box resolution: given code -> find-or-create; else newBox -> mint; else error.
  if box_code is null then
    if not coalesce(p_new_box, false) then raise exception 'missing_box'; end if;
    box_code := private.mint_code(p_job, 'box');
  end if;
  bid := private.find_or_create_box(p_job, box_code);

  -- Item resolution.
  select * into it from items where id = p_item_id;
  if it.id is not null then
    if it.job_id <> p_job then raise exception 'item_conflict'; end if;
    action := 'exists';                                -- replay of an earlier save
  elsif item_code is not null then
    select * into it from items where job_id = p_job and code = item_code;
    if it.id is null then
      insert into items (id, job_id, code, description)
        values (p_item_id, p_job, item_code, coalesce(p_description, ''))
        returning * into it;
      perform private.bump_seq(p_job, item_code);
      action := 'created';
    end if;                                            -- else: union (below)
  else
    insert into items (id, job_id, code, description)
      values (p_item_id, p_job, private.mint_code(p_job, 'item'), coalesce(p_description, ''))
      returning * into it;
    action := 'created';
  end if;

  select exists (select 1 from item_boxes where item_id = it.id and box_id = bid) into linked;
  if not linked then
    insert into item_boxes (item_id, box_id, job_id) values (it.id, bid, p_job);
  end if;
  if action is null then
    action := case when linked then 'exists' else 'added' end;
  end if;

  if coalesce(array_length(p_photo_ids, 1), 0) > 0 then
    perform attach_photos(p_job, it.id, p_photo_ids);
  end if;

  return jsonb_build_object('ok', true, 'itemId', it.id, 'itemCode', it.code,
                            'boxCode', box_code, 'action', action);
end;
$$;

-- Absent (null) arguments are left untouched. p_box_codes replaces the item's
-- links with exactly these boxes (stubs created as needed).
create or replace function update_item(p_job uuid, p_item_id uuid,
                                       p_description text default null,
                                       p_box_codes text[] default null)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  code text;
  bids uuid[] := '{}';
begin
  perform private.require_uid();
  if not exists (select 1 from items where id = p_item_id and job_id = p_job) then
    raise exception 'item_not_found';
  end if;
  if p_description is null and p_box_codes is null then raise exception 'nothing_to_update'; end if;
  if p_description is not null then
    update items set description = p_description where id = p_item_id;
  end if;
  if p_box_codes is not null then
    foreach code in array p_box_codes loop
      if btrim(code) <> '' then
        bids := bids || private.find_or_create_box(p_job, btrim(code));
      end if;
    end loop;
    delete from item_boxes where item_id = p_item_id and not (box_id = any(bids));
    insert into item_boxes (item_id, box_id, job_id)
      select p_item_id, b, p_job from unnest(bids) b
      on conflict do nothing;
  end if;
  if p_box_codes is not null and p_description is null then
    update items set updated_at = now() where id = p_item_id;
  end if;
end;
$$;

create or replace function update_box(p_job uuid, p_box_code text,
                                      p_name text default null,
                                      p_type box_type default null,
                                      p_destination box_destination default null,
                                      p_status box_status default null)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  bid uuid;
begin
  perform private.require_uid();
  if coalesce(btrim(p_box_code), '') = '' then raise exception 'missing_box'; end if;
  if not can_access_job(p_job) then raise exception 'job_not_found'; end if;
  if num_nulls(p_name, p_type, p_destination, p_status) = 4 then
    raise exception 'nothing_to_update';
  end if;
  bid := private.find_or_create_box(p_job, btrim(p_box_code));
  update boxes set
    name        = coalesce(p_name, name),
    type        = coalesce(p_type, type),
    destination = coalesce(p_destination, destination),
    status      = coalesce(p_status, status)
  where id = bid;
end;
$$;

-- Bulk delete (admin via RLS). Returns how many rows were deleted; ids from
-- another job or that RLS hides are silently skipped.
create or replace function delete_items(p_job uuid, p_ids uuid[])
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  perform private.require_uid();
  if not is_job_admin(p_job) then raise exception 'forbidden'; end if;
  delete from items where job_id = p_job and id = any(p_ids);
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function delete_box(p_job uuid, p_box_code text)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  perform private.require_uid();
  if not is_job_admin(p_job) then raise exception 'forbidden'; end if;
  delete from boxes where job_id = p_job and code = btrim(p_box_code);
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- Move items into one box (replacing their links), creating it if needed.
create or replace function move_items(p_job uuid, p_ids uuid[], p_box_code text)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  bid uuid;
  n integer;
begin
  perform private.require_uid();
  if coalesce(btrim(p_box_code), '') = '' then raise exception 'missing_box'; end if;
  if not can_access_job(p_job) then raise exception 'job_not_found'; end if;
  bid := private.find_or_create_box(p_job, btrim(p_box_code));
  delete from item_boxes where job_id = p_job and item_id = any(p_ids) and box_id <> bid;
  insert into item_boxes (item_id, box_id, job_id)
    select id, bid, p_job from items where job_id = p_job and id = any(p_ids)
    on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Inventory reads. One call returns the whole list as jsonb, so PostgREST's
-- max_rows cap can't truncate large jobs. SECURITY INVOKER: RLS applies.
-- Sorted most-recent first: higher numeric code on top, named codes after.
-- ---------------------------------------------------------------------------
create or replace function list_boxes(p_job uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'boxCode', b.code, 'name', coalesce(b.name, ''), 'type', b.type,
           'destination', b.destination, 'status', b.status,
           'itemCount', (select count(*) from item_boxes ib where ib.box_id = b.id))
         order by b.code_seq desc nulls last, b.code), '[]'::jsonb)
  from boxes b where b.job_id = p_job;
$$;

create or replace function list_items(p_job uuid, p_box_code text default null)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'itemId', i.id, 'itemCode', i.code, 'description', i.description,
           'boxCodes', coalesce(bx.codes, '[]'::jsonb),
           'destination', bx.destination,
           'photos', coalesce(ph.photos, '[]'::jsonb))
         order by i.code_seq desc nulls last, i.code), '[]'::jsonb)
  from items i
  left join lateral (
    select jsonb_agg(b.code order by b.code_seq nulls last, b.code) as codes,
           (array_agg(b.destination order by b.code_seq nulls last, b.code)
              filter (where b.destination is not null))[1] as destination
    from item_boxes ib join boxes b on b.id = ib.box_id
    where ib.item_id = i.id
  ) bx on true
  left join lateral (
    select jsonb_agg(jsonb_build_object('path', p.storage_path, 'thumb', p.thumb_path)
                     order by p.created_at) as photos
    from photos p where p.item_id = i.id and p.status = 'ready'
  ) ph on true
  where i.job_id = p_job
    and (p_box_code is null or exists (
      select 1 from item_boxes ib join boxes b on b.id = ib.box_id
      where ib.item_id = i.id and b.code = p_box_code));
$$;

-- ---------------------------------------------------------------------------
-- Members list (owner/admin) with display names from auth and job assignments.
-- ---------------------------------------------------------------------------
create or replace function list_members(p_org uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
begin
  perform private.require_uid();
  if coalesce(org_role(p_org) not in ('owner', 'admin'), true) then raise exception 'forbidden'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'userId', m.user_id, 'role', m.role,
             'displayName', coalesce(u.raw_user_meta_data ->> 'display_name', ''),
             'email', u.email, 'isAnonymous', u.is_anonymous, 'joinedAt', m.created_at,
             'jobIds', coalesce((select jsonb_agg(jm.job_id) from job_members jm
                                 join jobs j on j.id = jm.job_id
                                 where jm.user_id = m.user_id and j.org_id = p_org), '[]'::jsonb))
           order by m.role, m.created_at)
    from memberships m join auth.users u on u.id = m.user_id
    where m.org_id = p_org), '[]'::jsonb);
end;
$$;

-- Display name lives in auth user metadata (crew set it when joining).
create or replace function set_display_name(p_name text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := private.require_uid();
  name text := left(btrim(coalesce(p_name, '')), 60);
begin
  if name = '' then raise exception 'missing_display_name'; end if;
  update auth.users
    set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                             || jsonb_build_object('display_name', name)
    where id = uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: nothing for anon; private helpers callable only from RPCs.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public, private from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema private to authenticated;
