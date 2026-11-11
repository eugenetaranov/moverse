-- Local/staging seed (platform-foundation task 2.8). Loaded by `supabase db
-- reset`; the pgTAP matrix (tests/rbac_matrix.test.sql) and the API
-- integration tests rely on these fixed ids.
--
-- Every user's password is: moverse-dev-pass1
--
--   Acme Removals (company)                     Beta Movers (company)
--     owner@acme.test   owner                      owner@beta.test  owner (outsider to Acme)
--     admin@acme.test   admin                    Solo (personal)
--     crew1@acme.test   crew, assigned to J1       solo@personal.test owner, job "My move"
--     crew2@acme.test   crew, no job
--   Jobs: J1 "Smith move", J2 "Jones move"
--
-- Invite token for J1 (plain text, only the hash is stored): seed-invite-j1

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Users (auth.users + email identities so password sign-in works)
-- ---------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at, confirmation_token, recovery_token,
                        email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', u.id::uuid, 'authenticated', 'authenticated',
       u.email, extensions.crypt('moverse-dev-pass1', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', u.name),
       now(), now(), '', '', '', ''
from (values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@acme.test',    'Olga Owner'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin@acme.test',    'Adam Admin'),
  ('00000000-0000-0000-0000-0000000000a3', 'crew1@acme.test',    'Cora Crew'),
  ('00000000-0000-0000-0000-0000000000a4', 'crew2@acme.test',    'Carl Crew'),
  ('00000000-0000-0000-0000-0000000000b1', 'owner@beta.test',    'Bea Beta'),
  ('00000000-0000-0000-0000-0000000000c1', 'solo@personal.test', 'Sam Solo')
) as u(id, email, name);

insert into auth.identities (id, user_id, provider_id, provider, identity_data,
                             last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, 'email',
       jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
       now(), now(), now()
from auth.users where email like '%.test';

-- ---------------------------------------------------------------------------
-- Orgs, memberships, jobs, assignments
-- ---------------------------------------------------------------------------
insert into orgs (id, name, kind, plan) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Acme Removals', 'company', 'company'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Beta Movers',   'company', 'free'),
  ('cccccccc-0000-0000-0000-000000000001', 'Sam Solo''s move', 'personal', 'free');

insert into memberships (org_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'admin'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a3', 'crew'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a4', 'crew'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'owner'),
  ('cccccccc-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'owner');

insert into jobs (id, org_id, name, client_name, box_seq, item_seq) values
  ('10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Smith move', 'J. Smith', 3, 4),
  ('10000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Jones move', 'K. Jones', 1, 1),
  ('10000000-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000001', 'Beta job',   null,       1, 1),
  ('10000000-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000001', 'My move',    null,       1, 2);

insert into job_members (job_id, user_id) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a3');

-- ---------------------------------------------------------------------------
-- Inventory
-- ---------------------------------------------------------------------------
insert into boxes (id, job_id, code, name, type, destination, status) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'BOX-01', 'Kitchen', 'shipping_box', 'shipment', 'sealed'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'BOX-02', 'Books',   'shipping_box', 'shipment', 'packing'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'BOX-03', null,      'suitcase',     'with_me',  'packing'),
  ('20000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000002', 'BOX-01', 'Garage',  null,           null,       'packing'),
  ('20000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000003', 'BOX-01', 'Beta box', null,          null,       'packing'),
  ('20000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000004', 'BOX-01', 'Clothes', 'suitcase',     'with_me',  'packing');

insert into items (id, job_id, code, description) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'ITM-0001', 'Kettle'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'ITM-0002', 'Plates'),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'ITM-0003', 'Cookbooks'),
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'ITM-0004', ''),
  ('30000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000002', 'ITM-0001', 'Drill'),
  ('30000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000003', 'ITM-0001', 'Beta lamp'),
  ('30000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000004', 'ITM-0001', 'Jacket'),
  ('30000000-0000-0000-0000-000000000032', '10000000-0000-0000-0000-000000000004', 'ITM-0002', 'Shoes');

insert into item_boxes (item_id, box_id, job_id) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000002'),
  ('30000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000003'),
  ('30000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000004'),
  ('30000000-0000-0000-0000-000000000032', '20000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000004');

insert into photos (id, job_id, item_id, storage_path, thumb_path, status) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
   'org/aaaaaaaa-0000-0000-0000-000000000001/job/10000000-0000-0000-0000-000000000001/photo/40000000-0000-0000-0000-000000000001.jpg',
   'org/aaaaaaaa-0000-0000-0000-000000000001/job/10000000-0000-0000-0000-000000000001/photo/40000000-0000-0000-0000-000000000001_t.jpg',
   'ready');

insert into invites (org_id, job_id, role, token_hash, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'crew',
   extensions.digest('seed-invite-j1', 'sha256'), '00000000-0000-0000-0000-0000000000a1');
