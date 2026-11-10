-- MIC-029: "Restore as private" says what it did (owner, 2026-11-10: the button flashed and nothing
-- showed). It returned void, the report row stays 'actioned', and an admin cannot read another
-- person's private binder, so Studio had no way to tell a restore from a no-op. Now it returns
-- 'restored' | 'already private' | 'not found'. Old clients ignore the return value.
-- The return type changes, so the function is dropped and recreated in one transaction.
begin;
drop function if exists public.admin_restore_binder_private(uuid);
create function public.admin_restore_binder_private(p_binder_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  was_public boolean;
  was_removed timestamptz;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;
  select is_public, removed_at into was_public, was_removed from public.binders where id = p_binder_id for update;
  if not found then
    return 'not found';
  end if;
  if was_public = false and was_removed is null then
    return 'already private';
  end if;
  update public.binders set is_public = false, removed_at = null where id = p_binder_id;
  return 'restored';
end;
$$;
revoke all on function public.admin_restore_binder_private(uuid) from public, anon;
grant execute on function public.admin_restore_binder_private(uuid) to authenticated;
commit;
