-- Content reports — the in-app takedown intake for the DMCA / UGC flow (see docs/roadmap/
-- ART-RIGHTS.md). A viewer of a PUBLIC binder can report it (copyright / other), the report
-- lands here, and the owner actions it out of band (hide/remove the binder or the offending art).
--
-- Writes: any signed-in user (guests are anonymous-authenticated, so `to authenticated` covers
-- them) may INSERT a report. There are NO client SELECT/UPDATE/DELETE policies — reports are read
-- and resolved by the service role only (an owner/admin surface), same invariant as entitlements.
create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  -- The reported binder (soft reference — keep the report even if the binder is later deleted).
  binder_id uuid,
  -- Who reported it (auth.uid()); null-safe for the rare unauthenticated path.
  reporter_id uuid default auth.uid() references auth.users (id) on delete set null,
  -- 'copyright' | 'inappropriate' | 'other' (plain text; no CHECK so reasons can grow in code).
  reason text not null,
  -- Free-text detail the reporter typed (what's infringing, the rights-holder link, etc.).
  details text,
  -- 'open' | 'actioned' | 'dismissed' — moved by the owner/admin (service role).
  status text not null default 'open',
  created_at timestamptz not null default now()
);

comment on table public.content_reports is
  'In-app takedown/abuse reports on public binders. Client INSERT only (to authenticated); read/resolve is service-role only. See docs/roadmap/ART-RIGHTS.md.';

create index content_reports_open on public.content_reports (status, created_at desc);

alter table public.content_reports enable row level security;

create policy "Signed-in users can file a report"
  on public.content_reports for insert
  to authenticated
  with check (auth.uid() = reporter_id);
