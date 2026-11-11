-- DB-internal cleanup on pg_cron (platform-foundation D2/D8). R2 objects are
-- not touched here: deleting photo rows queues their keys in storage_deletions,
-- which /api/cron/storage drains.

create extension if not exists pg_cron with schema pg_catalog;

create or replace function private.run_cleanup()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Anonymous crew users that never joined anything (abandoned invite scans).
  delete from auth.users u
  where u.is_anonymous
    and u.created_at < now() - interval '24 hours'
    and not exists (select 1 from memberships m where m.user_id = u.id);

  -- Photos requested but never attached to a saved item.
  delete from photos
  where status = 'pending' and created_at < now() - interval '24 hours';
end;
$$;
revoke execute on function private.run_cleanup() from public, anon, authenticated;

select cron.schedule('moverse-cleanup', '17 * * * *', $$select private.run_cleanup()$$);
