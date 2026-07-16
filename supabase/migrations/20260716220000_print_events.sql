-- Fill-sheet print usage ledger — one row per successful full-binder PDF download.
--
-- Why: PRO includes 1 full-binder print per month and VIP includes 5 (tiers.ts
-- `includedPrintsPerMonth`); the plan/usage UI shows "N of M included prints used this month"
-- by counting this month's rows. Client-INSERTED on download (the PDF is generated client-side
-- by pdf-lib, so self-reporting is the only signal we have) — that makes it advisory usage
-- data, not a security boundary. When metering ENFORCES the allocation, the count is still
-- read server-side; a client that skips the insert only cheats its own meter until printing
-- moves server-side.

create table public.print_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Which binder was printed (soft reference — the binder may be deleted later; keep the event).
  binder_id uuid,
  -- Sheets in the generated PDF, informational.
  sheets int,
  created_at timestamptz not null default now()
);

comment on table public.print_events is
  'One row per full-binder fill-sheet PDF download. Counted per calendar month against the tier''s included-print allocation (tiers.ts includedPrintsPerMonth). Client-reported (advisory).';

create index print_events_user_month on public.print_events (user_id, created_at desc);

alter table public.print_events enable row level security;

create policy "Users can read their own print events"
  on public.print_events for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can record their own print events"
  on public.print_events for insert
  to authenticated
  with check (auth.uid() = user_id);
