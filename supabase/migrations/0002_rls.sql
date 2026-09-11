-- Row-level security: org isolation as the second line of defense behind the
-- API's explicit scoping (design.md D1/D2, api-security spec).
--
-- Trust model:
--   * The API layer uses the service role (bypasses RLS) and derives org/job
--     scope from the verified JWT. It is the PRIMARY enforcement point.
--   * These policies guarantee that ANY user-scoped connection (anon key + user
--     JWT) can only ever touch rows in orgs the user is a member of — so a
--     forgotten WHERE clause or a direct-from-client query cannot leak across
--     orgs. This is what the cross-tenant CI test (task 2.2) pins down.
--
--   * Crew job-scoping ("crew see only their invited job") is enforced in the
--     API layer, NOT here: memberships are modeled at org granularity (design
--     D3/D4), so RLS defends the ORG boundary. If crew scoping should ever be
--     DB-enforced too, add a nullable job_id to memberships and tighten the
--     job/box/item policies — noted as an open follow-up.

-- ---------------------------------------------------------------------------
-- Membership lookup helpers. SECURITY DEFINER so they bypass RLS themselves
-- and cannot recurse through the memberships policy.
-- ---------------------------------------------------------------------------
create or replace function is_org_member(p_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from memberships
    where org_id = p_org_id and user_id = auth.uid()
  );
$$;

create or replace function is_job_accessible(p_job_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from jobs j
    join memberships m on m.org_id = j.org_id
    where j.id = p_job_id and m.user_id = auth.uid()
  );
$$;

create or replace function is_item_accessible(p_item_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from items i
    join jobs j on j.id = i.job_id
    join memberships m on m.org_id = j.org_id
    where i.id = p_item_id and m.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS on every tenant table
-- ---------------------------------------------------------------------------
alter table orgs        enable row level security;
alter table memberships enable row level security;
alter table jobs        enable row level security;
alter table boxes       enable row level security;
alter table items       enable row level security;
alter table item_boxes  enable row level security;
alter table photos      enable row level security;
alter table invites     enable row level security;
alter table usage       enable row level security;

-- ---------------------------------------------------------------------------
-- Policies. One membership-gated ALL policy per table. Role restrictions
-- (e.g. crew cannot create jobs) live in the API, not here.
-- ---------------------------------------------------------------------------
create policy orgs_member_access on orgs
  for all using (is_org_member(id)) with check (is_org_member(id));

create policy memberships_member_access on memberships
  for all using (is_org_member(org_id)) with check (is_org_member(org_id));

create policy jobs_member_access on jobs
  for all using (is_org_member(org_id)) with check (is_org_member(org_id));

create policy boxes_member_access on boxes
  for all using (is_job_accessible(job_id)) with check (is_job_accessible(job_id));

create policy items_member_access on items
  for all using (is_job_accessible(job_id)) with check (is_job_accessible(job_id));

create policy item_boxes_member_access on item_boxes
  for all using (is_item_accessible(item_id)) with check (is_item_accessible(item_id));

create policy photos_member_access on photos
  for all using (is_item_accessible(item_id)) with check (is_item_accessible(item_id));

create policy invites_member_access on invites
  for all using (is_org_member(org_id)) with check (is_org_member(org_id));

create policy usage_member_access on usage
  for all using (is_org_member(org_id)) with check (is_org_member(org_id));

-- The public client report reads via the service role by report_token (no user
-- session), so it is intentionally not exposed to user-scoped connections here.
