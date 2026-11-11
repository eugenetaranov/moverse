-- job_summary() counts (job-overview-card task 1.1). Run with:
--     supabase test db
--
-- Seeds a 19-box / 50-item job plus a noisy sibling job in the same org and
-- checks every count, and that the sibling's rows never leak in.

begin;
select plan(10);

\set org  'cccccccc-cccc-cccc-cccc-cccccccccccc'
\set job  'c0000000-0000-0000-0000-000000000001'
\set job2 'c0000000-0000-0000-0000-000000000002'

insert into orgs (id, name, kind) values (:'org', 'Org C', 'company');
insert into jobs (id, org_id, name) values
  (:'job',  :'org', 'Main job'),
  (:'job2', :'org', 'Other job');

-- 19 boxes: 2 packing, 3 sealed, 4 loaded, 10 delivered.
insert into boxes (job_id, code, status)
select :'job', 'BOX-' || lpad(n::text, 2, '0'),
       case when n <= 2 then 'packing'
            when n <= 5 then 'sealed'
            when n <= 9 then 'loaded'
            else 'delivered' end::box_status
from generate_series(1, 19) n;

-- 50 items; items 1-3 have a blank (incl. whitespace-only) description.
insert into items (job_id, code, description)
select :'job', 'ITM-' || lpad(n::text, 4, '0'),
       case when n = 1 then '' when n = 2 then '   ' when n = 3 then ''
            else 'item ' || n end
from generate_series(1, 50) n;

-- Items 5-50 go into a box (item 50 into two boxes); items 1-4 stay unboxed.
insert into item_boxes (item_id, box_id, job_id)
select i.id, b.id, i.job_id
from items i
join boxes b on b.job_id = i.job_id
  and b.code = 'BOX-' || lpad((((substring(i.code from 5)::int) % 19) + 1)::text, 2, '0')
where i.job_id = :'job' and substring(i.code from 5)::int >= 5;
insert into item_boxes (item_id, box_id, job_id)
select i.id, b.id, i.job_id from items i, boxes b
where i.job_id = :'job' and i.code = 'ITM-0050'
  and b.job_id = :'job' and b.code = 'BOX-01'
on conflict do nothing;

-- 7 ready photos on this job's items, plus one pending upload (not counted).
insert into photos (job_id, item_id, storage_path, status)
select :'job', id, 'org/' || :'org' || '/job/' || :'job' || '/photo/' || code || '.jpg', 'ready'
from items where job_id = :'job' and code <= 'ITM-0007';
insert into photos (job_id, storage_path)
values (:'job', 'org/' || :'org' || '/job/' || :'job' || '/photo/pending.jpg');

-- Sibling job: 30 delivered boxes, 5 unboxed blank items with photos.
insert into boxes (job_id, code, status)
select :'job2', 'BOX-' || lpad(n::text, 2, '0'), 'delivered'
from generate_series(1, 30) n;
insert into items (job_id, code, description)
select :'job2', 'ITM-' || lpad(n::text, 4, '0'), '' from generate_series(1, 5) n;
insert into photos (job_id, item_id, storage_path, status)
select :'job2', id, 'org/' || :'org' || '/job/' || :'job2' || '/photo/' || code || '.jpg', 'ready'
from items where job_id = :'job2';

select is((select packing     from job_summary(:'job')), 2,  'packing count');
select is((select sealed      from job_summary(:'job')), 3,  'sealed count');
select is((select loaded      from job_summary(:'job')), 4,  'loaded count');
select is((select delivered   from job_summary(:'job')), 10, 'delivered count (other job excluded)');
select is((select boxes       from job_summary(:'job')), 19, 'total boxes (other job excluded)');
select is((select items       from job_summary(:'job')), 50, 'total items');
select is((select photos      from job_summary(:'job')), 7,  'ready photos only (pending and other job excluded)');
select is((select unboxed     from job_summary(:'job')), 4,  'unboxed items (multi-box item counted once)');
select is((select undescribed from job_summary(:'job')), 3,  'undescribed items (whitespace counts as empty)');

select results_eq(
  $$ select boxes, items, unboxed, undescribed from job_summary('c0000000-0000-0000-0000-000000000002') $$,
  $$ values (30, 5, 5, 5) $$,
  'sibling job summarises only its own rows'
);

select * from finish();
rollback;
