-- MIC-029: Studio's "Restore as private". A taken-down binder comes back for its owner only:
-- is_public off, takedown lifted, files untouched (owner, 2026-11-09: the owner may keep adult
-- art in a PRIVATE binder, e.g. to print). Admin only; an admin cannot change another person's
-- binder through the owner-only update policy, so this is the one door.
create or replace function public.admin_restore_binder_private(p_binder_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;
  update public.binders set is_public = false, removed_at = null where id = p_binder_id;
end;
$$;

revoke all on function public.admin_restore_binder_private(uuid) from public, anon;
grant execute on function public.admin_restore_binder_private(uuid) to authenticated;
