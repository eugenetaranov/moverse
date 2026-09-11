-- Cross-tenant isolation test (task 2.2 / api-security spec).
--
-- Proves that a user-scoped connection for org A cannot read org B's jobs,
-- boxes, or items through RLS — the catastrophic-leak case. Run with:
--     supabase test db
-- (requires `supabase start`; uses the pgTAP extension bundled with local dev).
--
-- Seeding runs under the default (superuser) role which bypasses RLS. The
-- assertions run as role `authenticated`, switching the acting user by rewriting
-- the request.jwt.claims `sub` so auth.uid() changes without changing DB role.

begin;
select plan(8);

-- Fixed identities so we can reference them below.
\set user_a '11111111-1111-1111-1111-111111111111'
\set user_b '22222222-2222-2222-2222-222222222222'
\set org_a  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
\set org_b  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

-- --- Seed two isolated tenants -------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email,
                        encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', :'user_a', 'authenticated', 'authenticated',
   'a@example.com', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', :'user_b', 'authenticated', 'authenticated',
   'b@example.com', '', now(), now(), now());

insert into orgs (id, name, kind) values
  (:'org_a', 'Org A', 'company'),
  (:'org_b', 'Org B', 'company');

insert into memberships (org_id, user_id, role) values
  (:'org_a', :'user_a', 'owner'),
  (:'org_b', :'user_b', 'owner');

-- Job + box + item in each org.
with ja as (
  insert into jobs (org_id, name) values (:'org_a', 'Job A') returning id
), jb as (
  insert into jobs (org_id, name) values (:'org_b', 'Job B') returning id
), ba as (
  insert into boxes (job_id, code) select id, 'BOX-01' from ja returning id, job_id
), bb as (
  insert into boxes (job_id, code) select id, 'BOX-01' from jb returning id, job_id
)
insert into items (job_id, code, description)
  select job_id, 'ITM-0001', 'a' from ba
  union all
  select job_id, 'ITM-0001', 'b' from bb;

-- --- Assert as authenticated users --------------------------------------------
set local role authenticated;

-- Acting as user A (org A only).
select set_config('request.jwt.claims',
  json_build_object('sub', :'user_a', 'role', 'authenticated')::text, true);

select is((select count(*)::int from jobs),  1, 'user A sees exactly their org job');
select is((select count(*)::int from boxes), 1, 'user A sees exactly their org box');
select is((select count(*)::int from items), 1, 'user A sees exactly their org item');
select is((select count(*)::int from orgs where id = :'org_b'), 0,
  'user A cannot see org B');

-- Acting as user B (org B only).
select set_config('request.jwt.claims',
  json_build_object('sub', :'user_b', 'role', 'authenticated')::text, true);

select is((select count(*)::int from jobs),  1, 'user B sees exactly their org job');
select is((select count(*)::int from items), 1, 'user B sees exactly their org item');
select is((select count(*)::int from items where description = 'a'), 0,
  'user B cannot read org A items by any path');
select is((select count(*)::int from orgs where id = :'org_a'), 0,
  'user B cannot see org A');

select * from finish();
rollback;
