-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- scan_events — the tcgscan monthly scan meter
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- RECONSTRUCTED 2026-07-23 from the live database. This migration was applied to
-- `piikwvntldytjejxmcla` as `20260721210058_tcgscan_scan_events` but its file was never
-- committed, so a fresh environment (or `supabase db reset`) came up WITHOUT the table and
-- tcgscan's scan-quota silently degraded to local-only counting. The DDL below reproduces
-- the live object exactly (columns, RLS, policies, index, comment) and is idempotent, so it
-- is safe to re-run against the project that already has it.
--
-- Trust model: client-reported and advisory, same as print_events — the INSERT policy asserts
-- ownership only, and tcgscan's scan-quota swallows insert failures by design ("a failed insert
-- just under-counts"). Making the meter authoritative means moving the record-and-check into a
-- security-definer RPC; tracked as a follow-up, deliberately NOT changed here so this file
-- stays a faithful record of what is already deployed.

create table if not exists public.scan_events (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  card_id    text,
  created_at timestamptz not null default now()
);

comment on table public.scan_events is
  'One row per scan-originated confirmed add (tcgscan). Counted per calendar month against the '
  'tier''s cardScansPerMonth cap (tcgscan lib/tiers). Client-reported (advisory), same trust '
  'model as print_events. See tcgscan docs/MONETIZATION-TIERS.md.';

-- The meter always counts one user over a date window.
create index if not exists scan_events_user_created_idx
  on public.scan_events (user_id, created_at);

alter table public.scan_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'scan_events'
       and policyname = 'Users can read their own scan events'
  ) then
    create policy "Users can read their own scan events"
      on public.scan_events for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'scan_events'
       and policyname = 'Users can record their own scan events'
  ) then
    create policy "Users can record their own scan events"
      on public.scan_events for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;
end $$;

-- No UPDATE or DELETE policy: a meter row, once recorded, is not client-editable.
