-- SHARED CONTRACT with tcgscan-app (work order from its page-shell branch, commit cedbf7f,
-- 2026-11-02): its 'user-data-sync' channel subscribes to public.entitlements and
-- public.tcgscan_pro_trials with filter user_id=eq.<uid> and re-reads entitlements on any event,
-- so a plan change (webhook grant, trial start, cancellation) follows live without a reload.
--
-- Guarded the way storage_units was: only added when not already in the publication. Reads stay
-- behind the existing owner SELECT policies ("Users can read their own entitlements", "Users can
-- read their own tcgscan trial"); realtime postgres_changes respects them. No write policy is
-- added: clients never write either table, only the payments webhook and the trial RPC do.
--
-- DELETE events carry the primary key only, and user_id is in both keys (entitlements is keyed
-- (user_id, product), tcgscan_pro_trials by user_id), so the client's user_id filter matches
-- deletes without changing replica identity.
--
-- Applied with `supabase db query --linked -f` (this project is shared; db push always stops).

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'entitlements'
  ) then
    alter publication supabase_realtime add table public.entitlements;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tcgscan_pro_trials'
  ) then
    alter publication supabase_realtime add table public.tcgscan_pro_trials;
  end if;
end $$;
