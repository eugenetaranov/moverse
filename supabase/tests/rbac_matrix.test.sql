-- Role x table x command matrix, escalation cases and RPC behaviour
-- (platform-foundation task 2.7, design.md D16). Runs against supabase/seed.sql.
--     supabase db reset && supabase test db

begin;
select plan(84);

\set acme   'aaaaaaaa-0000-0000-0000-000000000001'
\set beta   'bbbbbbbb-0000-0000-0000-000000000001'
\set solo_o 'cccccccc-0000-0000-0000-000000000001'
\set j1     '10000000-0000-0000-0000-000000000001'
\set j2     '10000000-0000-0000-0000-000000000002'
\set jb     '10000000-0000-0000-0000-000000000003'
\set owner  '00000000-0000-0000-0000-0000000000a1'
\set admin  '00000000-0000-0000-0000-0000000000a2'
\set crew1  '00000000-0000-0000-0000-0000000000a3'
\set crew2  '00000000-0000-0000-0000-0000000000a4'
\set outsdr '00000000-0000-0000-0000-0000000000b1'
\set solo   '00000000-0000-0000-0000-0000000000c1'
\set j1box2 '20000000-0000-0000-0000-000000000002'
\set j2box  '20000000-0000-0000-0000-000000000011'
\set j1item '30000000-0000-0000-0000-000000000001'

-- Switch the acting user (and anonymity) without leaving the transaction.
create function pg_temp.act_as(uid uuid, anon boolean default false) returns void
language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object(
    'sub', uid, 'role', 'authenticated', 'is_anonymous', anon)::text, true);
  set local role authenticated;
end;
$$;
grant execute on function pg_temp.act_as(uuid, boolean) to authenticated;

-- ===========================================================================
-- anon: no table or RPC access at all
-- ===========================================================================
set local role anon;
select throws_ok($$ select * from boxes $$, '42501', null, 'anon: cannot read boxes');
select throws_ok($$ select me() $$, '42501', null, 'anon: cannot call RPCs');
reset role;

-- ===========================================================================
-- owner
-- ===========================================================================
select pg_temp.act_as(:'owner');
select is((select count(*)::int from jobs), 2, 'owner: sees every job in the org');
select is((select count(*)::int from boxes), 4, 'owner: sees boxes of both jobs');
select is((select count(*)::int from invites), 1, 'owner: lists invites');
select lives_ok($$ update orgs set name = 'Acme Removals Ltd' where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'owner: renames org');
select throws_ok($$ update orgs set plan = 'company' $$, '42501', null, 'owner: cannot set plan directly');
select throws_ok($$ select report_token from jobs $$, '42501', null, 'owner: report_token not selectable');
select ok(length(get_report_token(:'j1')) = 36, 'owner: reads report token via RPC');
select throws_ok($$ select set_member_role('aaaaaaaa-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a1', 'crew') $$, 'P0001', 'forbidden', 'owner: cannot demote self');
select throws_ok($$ select leave_org('aaaaaaaa-0000-0000-0000-000000000001') $$,
  'P0001', 'transfer_ownership_required', 'owner: cannot leave without transfer');
select is((account_deletion_plan() ->> 'blocked')::boolean, true,
  'owner: account deletion blocked while company has members');
select throws_ok($$ select delete_owned_orgs() $$, 'P0001', 'transfer_ownership_required',
  'owner: delete_owned_orgs refuses');

-- ===========================================================================
-- admin
-- ===========================================================================
select pg_temp.act_as(:'admin');
select is((select count(*)::int from jobs), 2, 'admin: sees every job in the org');
with u as (update orgs set name = 'Hijacked' returning 1)
  select is(count(*)::int, 0, 'admin: cannot rename org (row filtered)') from u;
select throws_ok($$ select set_member_role('aaaaaaaa-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a3', 'admin') $$, 'P0001', 'forbidden', 'admin: cannot promote');
select throws_ok($$ select remove_member('aaaaaaaa-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a1') $$, 'P0001', 'forbidden', 'admin: cannot remove owner');
select lives_ok($$ select create_invite('10000000-0000-0000-0000-000000000002') $$, 'admin: creates invite');
select lives_ok($$ select assign_job('10000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-0000000000a4') $$, 'admin: assigns crew to a job');
select lives_ok($$ select regenerate_report_token('10000000-0000-0000-0000-000000000002') $$,
  'admin: regenerates report token');
select lives_ok($$ insert into jobs (org_id, name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'New job') $$,
  'admin: creates job');
select throws_ok($$ update jobs set box_seq = 0 $$, '42501', null, 'admin: sequences not writable');

-- ===========================================================================
-- crew assigned to J1
-- ===========================================================================
select pg_temp.act_as(:'crew1');
select results_eq($$ select id from jobs $$, $$ values ('10000000-0000-0000-0000-000000000001'::uuid) $$,
  'crew: sees only the assigned job');
select is((select count(*)::int from boxes), 3, 'crew: sees only J1 boxes');
select is((select count(*)::int from boxes where job_id = '10000000-0000-0000-0000-000000000002'), 0,
  'crew: J2 boxes invisible');
select is((select count(*)::int from photos), 1, 'crew: sees J1 photos');
select is((select count(*)::int from invites), 0, 'crew: cannot read invites');
select is((select count(*)::int from usage), 0, 'crew: cannot read usage');
select is((select count(*)::int from job_members), 1, 'crew: sees own assignment only');
select lives_ok($$ insert into items (job_id, code) values ('10000000-0000-0000-0000-000000000001', 'ITM-0900') $$,
  'crew: inserts item in assigned job');
select throws_ok($$ insert into items (job_id, code) values ('10000000-0000-0000-0000-000000000002', 'ITM-0900') $$,
  '42501', null, 'crew: cannot insert into unassigned job');
select lives_ok($$ update boxes set status = 'sealed' where code = 'BOX-02' $$, 'crew: changes box status');
with d as (delete from items returning 1)
  select is(count(*)::int, 0, 'crew: cannot delete items') from d;
with d as (delete from boxes returning 1)
  select is(count(*)::int, 0, 'crew: cannot delete boxes') from d;
select throws_ok($$ select delete_items('10000000-0000-0000-0000-000000000001',
  array['30000000-0000-0000-0000-000000000001'::uuid]) $$, 'P0001', 'forbidden', 'crew: delete_items refused');

-- Escalations
select throws_ok($$ update memberships set role = 'owner' $$, '42501', null, 'crew: cannot self-promote');
select throws_ok($$ insert into memberships (org_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a3', 'owner') $$,
  '42501', null, 'crew: cannot insert membership');
select throws_ok($$ select set_member_role('aaaaaaaa-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a3', 'admin') $$, 'P0001', 'forbidden', 'crew: set_member_role refused');
select throws_ok($$ update orgs set plan = 'company' $$, '42501', null, 'crew: cannot set plan');
select throws_ok($$ select report_token from jobs $$, '42501', null, 'crew: cannot read report token');
select throws_ok($$ select get_report_token('10000000-0000-0000-0000-000000000001') $$,
  'P0001', 'job_not_found', 'crew: get_report_token refused');
with u as (update jobs set name = 'x' returning 1)
  select is(count(*)::int, 0, 'crew: cannot rename jobs (row filtered)') from u;
select throws_ok($$ select create_invite('10000000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'crew: cannot create invites');
select throws_ok($$ insert into photos (job_id, storage_path) values
  ('10000000-0000-0000-0000-000000000001', 'org/x/job/y/photo/z.jpg') $$, '42501', null,
  'crew: cannot insert photo rows directly');
select throws_ok($$ insert into item_boxes (item_id, box_id, job_id) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000011',
   '10000000-0000-0000-0000-000000000001') $$, '23503', null,
  'crew: cross-job item_boxes link is a FK violation');
select throws_ok($$ select reserve_codes('10000000-0000-0000-0000-000000000001', 'item', 201) $$,
  'P0001', 'invalid_count', 'crew: reserve_codes caps count at 200');
select throws_ok($$ select reserve_codes('10000000-0000-0000-0000-000000000001', 'item', 0) $$,
  'P0001', 'invalid_count', 'crew: reserve_codes rejects 0');
select throws_ok($$ select private.run_cleanup() $$, '42501', null, 'crew: cannot run cleanup');

-- ===========================================================================
-- crew with no job / outsider / personal
-- ===========================================================================
select pg_temp.act_as(:'crew2');
-- The admin section assigned crew2 to J2 via assign_job.
select results_eq($$ select id from jobs $$, $$ values ('10000000-0000-0000-0000-000000000002'::uuid) $$,
  'crew2: assign_job grants exactly J2');
select is((select count(*)::int from items), 1, 'crew2: sees only J2 items');
select throws_ok($$ select save_item('10000000-0000-0000-0000-000000000001', gen_random_uuid(), null, 'BOX-01') $$,
  'P0001', 'job_not_found', 'crew2: save_item refused on J1 (not assigned)');

select pg_temp.act_as(:'outsdr');
select is((select count(*)::int from jobs where org_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0,
  'outsider: no Acme jobs');
select is((select count(*)::int from job_context('10000000-0000-0000-0000-000000000001')), 0,
  'outsider: job_context empty for foreign job');
select is((select count(*)::int from memberships where org_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0,
  'outsider: cannot see Acme members');

select pg_temp.act_as(:'solo');
select throws_ok($$ select create_invite('10000000-0000-0000-0000-000000000004') $$,
  'P0001', 'personal_org_cannot_invite', 'personal: cannot create invites');
select is((me() -> 'jobs' -> 0 ->> 'name'), 'My move', 'personal: me() lists My move');

-- ===========================================================================
-- RPC behaviour: save_item
-- ===========================================================================
select pg_temp.act_as(:'crew1');
select is((save_item(:'j1', '50000000-0000-0000-0000-000000000001', 'ITM-0500', 'BOX-01', false, 'Mug') ->> 'action'),
  'created', 'save_item: creates with client id');
select is((save_item(:'j1', '50000000-0000-0000-0000-000000000001', 'ITM-0500', 'BOX-01', false, 'Mug') ->> 'action'),
  'exists', 'save_item: replay is idempotent');
select is((select count(*)::int from items where code = 'ITM-0500'), 1, 'save_item: replay made no duplicate');
select is((save_item(:'j1', gen_random_uuid(), 'ITM-0500', 'BOX-02') ->> 'itemId'),
  '50000000-0000-0000-0000-000000000001', 'save_item: same code returns existing id');
select is((select count(*)::int from item_boxes where item_id = '50000000-0000-0000-0000-000000000001'), 2,
  'save_item: code union links a second box');
select is((save_item(:'j1', gen_random_uuid(), null, null, true) ->> 'itemCode'), 'ITM-0501',
  'save_item: sequence repaired past client code');
select is((select code from boxes where job_id = '10000000-0000-0000-0000-000000000001' order by code_seq desc limit 1),
  'BOX-04', 'save_item: newBox mints BOX-04');
select throws_ok($$ select save_item('10000000-0000-0000-0000-000000000001', gen_random_uuid(), 'ITM-0600', null) $$,
  'P0001', 'missing_box', 'save_item: missing box');
select is((reserve_codes(:'j1', 'box', 5) ->> 'first')::int, 5, 'reserve_codes: next box range starts at 5');
select is((save_item(:'j1', gen_random_uuid(), null, 'BOX-01') ->> 'itemCode'), 'ITM-0502',
  'save_item: codeless mint continues sequence');

-- Photos
select is((create_pending_photo(:'j1', '60000000-0000-0000-0000-000000000001', 1000) ->> 'storagePath'),
  'org/aaaaaaaa-0000-0000-0000-000000000001/job/10000000-0000-0000-0000-000000000001/photo/60000000-0000-0000-0000-000000000001.jpg',
  'photos: server builds the key');
select is((save_item(:'j1', gen_random_uuid(), 'ITM-0700', 'BOX-01', false, 'Lamp',
  array['60000000-0000-0000-0000-000000000001'::uuid]) ->> 'action'), 'created', 'photos: attached on save');
select is((select status::text from photos where id = '60000000-0000-0000-0000-000000000001'), 'ready',
  'photos: attached photo is ready');
select throws_ok($$ select create_pending_photo('10000000-0000-0000-0000-000000000002', gen_random_uuid(), 1) $$,
  'P0001', 'job_not_found', 'photos: no pending photo in unassigned job');
reset role;
select throws_ok($$ insert into photos (job_id, storage_path) values
  ('10000000-0000-0000-0000-000000000001', 'org/bbbbbbbb-0000-0000-0000-000000000001/job/x/photo/y.jpg') $$,
  '23514', null, 'photos: foreign storage_path rejected even for privileged writers');

-- Box status timestamps + storage outbox
select isnt((select sealed_at from boxes where id = :'j1box2'), null, 'boxes: sealed_at set on status change');
delete from photos where id = '40000000-0000-0000-0000-000000000001';
select is((select count(*)::int from storage_deletions where reason = 'photo'), 2,
  'outbox: photo delete queues full + thumbnail keys');

-- ===========================================================================
-- Invites
-- ===========================================================================
reset role;
insert into auth.users (instance_id, id, aud, role, is_anonymous, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000d1',
   'authenticated', 'authenticated', true, now(), now());

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1', true);
select throws_ok($$ select provision_account('personal') $$, 'P0001', 'anonymous_not_allowed',
  'provision: anonymous refused');
select throws_ok($$ select consume_invite('nope') $$, 'P0001', 'invite_invalid', 'invite: bad token');
select is((consume_invite('seed-invite-j1') ->> 'jobId'), :'j1', 'invite: anonymous crew joins J1');
select is((select count(*)::int from jobs), 1, 'invite: joined crew sees J1');

select pg_temp.act_as(:'owner');
select is((consume_invite('seed-invite-j1') ->> 'orgId'), :'acme', 'invite: owner consuming own invite');
select is(org_role(:'acme')::text, 'owner', 'invite: never downgrades an owner');
select lives_ok($$ select revoke_invite(id) from invites where job_id = '10000000-0000-0000-0000-000000000001' $$,
  'invite: owner revokes');
select pg_temp.act_as(:'outsdr');
select throws_ok($$ select consume_invite('seed-invite-j1') $$, 'P0001', 'invite_expired',
  'invite: revoked invite refused');

-- ===========================================================================
-- Provisioning
-- ===========================================================================
reset role;
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e1',
   'authenticated', 'authenticated', 'new@person.test', '{"display_name":"Nina"}', now(), now());
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select is((provision_account('personal') ->> 'provisioned')::boolean, true, 'provision: creates personal org');
select is((provision_account('personal') ->> 'provisioned')::boolean, false, 'provision: second call is a no-op');
select is((me() -> 'orgs' -> 0 ->> 'name'), 'Nina''s move', 'provision: personal org named after user');

select * from finish();
rollback;
