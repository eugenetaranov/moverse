-- Job overview counts (job-overview-card change, design.md D1).
--
-- Raw counts only; progress, stage and next action are derived in TypeScript
-- by deriveSummary() (lib/jobSummary.ts) so the product rules live in one
-- unit-tested place shared by the API, the offline app and the client report.
--
-- SECURITY INVOKER (the default): called through a user-scoped client, RLS on
-- boxes/items/item_boxes/photos applies, so a caller who cannot read the job
-- gets zeros rather than another tenant's counts. Archived jobs are not
-- filtered out — they still produce a summary.

create or replace function job_summary(p_job_id uuid)
returns table (
  packing     integer,
  sealed      integer,
  loaded      integer,
  delivered   integer,
  boxes       integer,
  items       integer,
  photos      integer,
  unboxed     integer,
  undescribed integer
)
language sql
stable
set search_path = public, pg_temp
as $$
  select
    b.packing, b.sealed, b.loaded, b.delivered, b.total,
    i.total, p.total, i.unboxed, i.undescribed
  from
    (select
       count(*) filter (where status = 'packing')::int   as packing,
       count(*) filter (where status = 'sealed')::int    as sealed,
       count(*) filter (where status = 'loaded')::int    as loaded,
       count(*) filter (where status = 'delivered')::int as delivered,
       count(*)::int                                      as total
     from boxes where job_id = p_job_id) b,
    (select
       count(*)::int as total,
       count(*) filter (
         where not exists (select 1 from item_boxes ib where ib.item_id = it.id)
       )::int as unboxed,
       count(*) filter (where btrim(it.description) = '')::int as undescribed
     from items it where it.job_id = p_job_id) i,
    (select count(*)::int as total
     from photos where job_id = p_job_id and status = 'ready') p;
$$;

revoke execute on function job_summary(uuid) from public, anon;
grant execute on function job_summary(uuid) to authenticated;
