-- Moverse commercial schema: org -> job -> boxes/items.
--
-- Tenant hierarchy (design.md D3):
--   orgs (company | personal)
--     memberships (owner | admin | crew)  -> auth.users
--     jobs (one client move)              -- per-job code sequences
--       boxes
--       items  -- item_boxes: an item may span >1 box
--         photos (Supabase Storage paths)
--     invites (crew join tokens)
--     usage   (/describe quota accounting)
--
-- RLS lives in 0002_rls.sql. This file is data model only.

-- gen_random_uuid()
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type org_kind        as enum ('company', 'personal');
create type org_plan        as enum ('free', 'company');
create type member_role     as enum ('owner', 'admin', 'crew');
create type job_status       as enum ('active', 'archived');
create type box_type         as enum ('suitcase', 'shipping_box');
create type box_destination  as enum ('with_me', 'shipment');
create type box_status       as enum ('packing', 'sealed', 'loaded', 'delivered');

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- orgs
-- ---------------------------------------------------------------------------
create table orgs (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  kind               org_kind not null,
  plan               org_plan not null default 'free',
  stripe_customer_id text unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger orgs_updated_at before update on orgs
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- memberships (user <-> org, with a role). One membership per (org,user).
-- ---------------------------------------------------------------------------
create table memberships (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       member_role not null,
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index memberships_user_idx on memberships(user_id);
create index memberships_org_idx  on memberships(org_id);

-- ---------------------------------------------------------------------------
-- jobs (one client move). Per-job code sequences are minted atomically via
-- next_box_code()/next_item_code() (see below) using UPDATE ... RETURNING.
-- report_token backs the public client report link (revocable = regenerate it).
-- ---------------------------------------------------------------------------
create table jobs (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  name         text not null,
  client_name  text,
  status       job_status not null default 'active',
  box_seq      integer not null default 0,   -- last minted BOX-nn number
  item_seq     integer not null default 0,   -- last minted ITM-nnnn number
  report_token text not null unique default encode(gen_random_bytes(18), 'hex'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index jobs_org_idx on jobs(org_id);
create trigger jobs_updated_at before update on jobs
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- boxes (scoped to a job; code unique within the job)
-- ---------------------------------------------------------------------------
create table boxes (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references jobs(id) on delete cascade,
  code        text not null,
  name        text,
  type        box_type,
  destination box_destination,
  status      box_status not null default 'packing',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (job_id, code)
);
create index boxes_job_idx on boxes(job_id);
create trigger boxes_updated_at before update on boxes
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- items (scoped to a job; code unique within the job).
-- idempotency_key: client-generated UUID so offline-queue retries upsert
-- rather than duplicate (design.md D7, offline-capture spec).
-- ---------------------------------------------------------------------------
create table items (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid not null references jobs(id) on delete cascade,
  code            text not null,
  description     text not null default '',
  idempotency_key uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (job_id, code),
  unique (job_id, idempotency_key)
);
create index items_job_idx on items(job_id);
create trigger items_updated_at before update on items
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- item_boxes (an item may belong to more than one box; both sides in same job
-- is enforced in the API/trigger layer, not here)
-- ---------------------------------------------------------------------------
create table item_boxes (
  item_id uuid not null references items(id) on delete cascade,
  box_id  uuid not null references boxes(id) on delete cascade,
  primary key (item_id, box_id)
);
create index item_boxes_box_idx on item_boxes(box_id);

-- ---------------------------------------------------------------------------
-- photos (R2 object keys; served to clients as short-lived presigned GET URLs)
-- ---------------------------------------------------------------------------
create table photos (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references items(id) on delete cascade,
  storage_path text not null,   -- R2 object key
  created_at   timestamptz not null default now()
);
create index photos_item_idx on photos(item_id);

-- ---------------------------------------------------------------------------
-- invites (crew join tokens, job-scoped, expiring, revocable by delete)
-- ---------------------------------------------------------------------------
create table invites (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  job_id     uuid references jobs(id) on delete cascade,
  role       member_role not null default 'crew',
  token      text not null unique default encode(gen_random_bytes(18), 'hex'),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index invites_org_idx on invites(org_id);

-- ---------------------------------------------------------------------------
-- usage (/describe daily quota accounting, per org)
-- ---------------------------------------------------------------------------
create table usage (
  org_id         uuid not null references orgs(id) on delete cascade,
  day            date not null,
  describe_count integer not null default 0,
  primary key (org_id, day)
);

-- ---------------------------------------------------------------------------
-- Atomic per-job code minting. UPDATE ... RETURNING is race-free: concurrent
-- crew phones can never receive the same number (design.md D3, box-code spec).
-- ---------------------------------------------------------------------------

-- BOX-nn, zero-padded to >=2 digits, growing naturally past 99.
create or replace function next_box_code(p_job_id uuid)
returns text
language plpgsql
as $$
declare
  n integer;
begin
  update jobs set box_seq = box_seq + 1
    where id = p_job_id
    returning box_seq into n;
  if n is null then
    raise exception 'job % not found', p_job_id;
  end if;
  return 'BOX-' || lpad(n::text, 2, '0');
end;
$$;

-- ITM-nnnn, zero-padded to >=4 digits.
create or replace function next_item_code(p_job_id uuid)
returns text
language plpgsql
as $$
declare
  n integer;
begin
  update jobs set item_seq = item_seq + 1
    where id = p_job_id
    returning item_seq into n;
  if n is null then
    raise exception 'job % not found', p_job_id;
  end if;
  return 'ITM-' || lpad(n::text, 4, '0');
end;
$$;

-- Reserve a contiguous batch of item codes for offline use, returning the range
-- [first,last]. The client consumes them locally while offline (offline-capture
-- spec). Advancing the sequence up-front guarantees no other device collides.
create or replace function reserve_item_codes(p_job_id uuid, p_count integer)
returns table (first_seq integer, last_seq integer)
language plpgsql
as $$
declare
  last_n integer;
begin
  if p_count < 1 then
    raise exception 'count must be >= 1';
  end if;
  update jobs set item_seq = item_seq + p_count
    where id = p_job_id
    returning item_seq into last_n;
  if last_n is null then
    raise exception 'job % not found', p_job_id;
  end if;
  return query select (last_n - p_count + 1), last_n;
end;
$$;
