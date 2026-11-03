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
-- Replica identity FULL on entitlements so a DELETE event carries user_id and the client filter
-- can match it (the default identity sends the primary key only). tcgscan_pro_trials is keyed by
-- user_id already. This changes what the WAL records for the row, nothing about the data.
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

alter table public.entitlements replica identity full;
