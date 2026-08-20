-- tcgscan-michi-maker — daily snapshots of the community totals (growth over time)
--
-- Depends on 20260819120000_community_stats.sql, which defines the singleton
-- `community_stats` row and the totals' semantics. This migration adds the history:
-- one row per UTC day, so the analytics report can plot growth instead of one number.
--
-- ── Retention ─────────────────────────────────────────────────────────────────────────
-- The request was a "30 day rolling window". This table does NOT delete anything: 7 small
-- columns × 365 rows a year is nothing, and a deleted day is unrecoverable in a way a
-- filtered day is not. The 30-day window is applied on READ (`admin_community_growth`
-- defaults to 30 days), which gives the same report and keeps the long series for the
-- month-over-month view you will want in three months. If retention ever becomes a real
-- requirement, prune here, not in the reader.
--
-- ── Backfilled vs captured ────────────────────────────────────────────────────────────
-- `is_backfilled` is load-bearing, do not drop it. Rows written by the daily cron are true
-- observations. Rows written by `backfill_community_stats_daily()` are RECONSTRUCTIONS from
-- the `created_at` of rows that still exist today, which means:
--
--   • They cannot see deletions. A binder built on the 5th and deleted on the 10th is absent
--     from every reconstructed day, so a backfilled series is a LOWER BOUND on what the
--     totals actually were, and is monotonically non-decreasing by construction.
--   • `collectors` uses today's `username is not null` state, not that day's. Someone who
--     set a username yesterday is counted on every earlier day they had a binder.
--
-- Captured rows have neither problem and CAN dip (a deleted binder lowers the total). Any
-- chart that mixes the two should mark the boundary; the report should not present a
-- reconstructed dip-free curve as if it were measured.

create table if not exists public.community_stats_daily (
  day date primary key,
  collectors bigint not null default 0,
  binders_built bigint not null default 0,
  pages_built bigint not null default 0,
  cards_placed bigint not null default 0,
  artwork_placed bigint not null default 0,
  is_backfilled boolean not null default false,
  captured_at timestamptz not null default now()
);

comment on table public.community_stats_daily is
  'One row per UTC day of cumulative community totals. Written by snapshot_community_stats() '
  'daily via pg_cron; earlier days reconstructed by backfill_community_stats_daily(). Check '
  'is_backfilled before treating a row as a measurement.';

-- ── Daily snapshot ─────────────────────────────────────────────────────────────────────
-- Refreshes the live singleton first so the day''s row and the landing page never disagree,
-- then stamps today. Re-running the same day overwrites that day (last write wins), which
-- makes the job safely retryable.

-- plpgsql, not sql, so the refresh is unambiguously a separate statement that completes
-- before the snapshot reads it.
create or replace function public.snapshot_community_stats()
returns public.community_stats_daily
language plpgsql
security definer
set search_path = public, pg_temp
set timezone = 'UTC'
as $$
declare
  fresh public.community_stats;
  snap public.community_stats_daily;
begin
  fresh := public.refresh_community_stats();

  insert into public.community_stats_daily as d (
    day, collectors, binders_built, pages_built, cards_placed, artwork_placed,
    is_backfilled, captured_at
  )
  values (
    current_date, fresh.collectors, fresh.binders_built, fresh.pages_built,
    fresh.cards_placed, fresh.artwork_placed, false, now()
  )
  on conflict (day) do update set
    collectors     = excluded.collectors,
    binders_built  = excluded.binders_built,
    pages_built    = excluded.pages_built,
    cards_placed   = excluded.cards_placed,
    artwork_placed = excluded.artwork_placed,
    is_backfilled  = false,
    captured_at    = excluded.captured_at
  returning d.* into snap;

  return snap;
end;
$$;

-- ── Backfill ───────────────────────────────────────────────────────────────────────────
-- Reconstructs history from created_at so the report has a curve on day one instead of in a
-- month. Read the caveats at the top of this file before trusting the output.
--
-- Never overwrites a captured row: `on conflict do nothing` means a real observation always
-- beats a reconstruction, so this is safe to re-run at any time.

create or replace function public.backfill_community_stats_daily(p_days int default 30)
returns setof public.community_stats_daily
language sql
security definer
set search_path = public, pg_temp
set timezone = 'UTC'
as $$
  with days as (
    select generate_series(
             current_date - (greatest(1, least(p_days, 3650)) - 1),
             current_date,
             interval '1 day'
           )::date as day
  ),
  -- Same population as refresh_community_stats(): every binder whose owner has a username,
  -- private ones included.
  eligible_binders as (
    select b.id, b.owner_id, b.created_at
    from public.binders b
    left join public.profiles p on b.owner_id = p.id
    where p.username is not null
  ),
  eligible_pages as (
    select bp.id, bp.created_at
    from public.binder_pages bp
    join eligible_binders eb on eb.id = bp.binder_id
  ),
  eligible_slots as (
    select bs.id, bs.slot_type, bs.created_at
    from public.binder_slots bs
    join eligible_pages ep on ep.id = bs.page_id
  )
  insert into public.community_stats_daily (
    day, collectors, binders_built, pages_built, cards_placed, artwork_placed,
    is_backfilled, captured_at
  )
  select
    d.day,
    (select count(distinct eb.owner_id) from eligible_binders eb where eb.created_at::date <= d.day),
    (select count(*) from eligible_binders eb where eb.created_at::date <= d.day),
    (select count(*) from eligible_pages ep where ep.created_at::date <= d.day),
    (select count(*) from eligible_slots es where es.created_at::date <= d.day and es.slot_type = 'card'),
    (select count(*) from eligible_slots es where es.created_at::date <= d.day and es.slot_type = 'artwork'),
    true,
    now()
  from days d
  on conflict (day) do nothing
  returning *;
$$;

-- ── Read surface ───────────────────────────────────────────────────────────────────────
-- Admin-only, matching every other analytics read (20260805100000_analytics_events.sql):
-- security definer + is_admin() guard, no broad table read policy. The public landing band
-- reads the singleton `community_stats` row and does not need this series.

create or replace function public.admin_community_growth(p_days int default 30)
returns table (
  day date,
  collectors bigint,
  binders_built bigint,
  pages_built bigint,
  cards_placed bigint,
  artwork_placed bigint,
  is_backfilled boolean,
  -- Same-day deltas. Null on the first row of the window (no prior day to difference
  -- against), which the report should render as a gap, not a zero.
  new_collectors bigint,
  new_binders bigint,
  new_pages bigint,
  new_cards bigint,
  new_artwork bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with windowed as (
    select d.*
    from public.community_stats_daily d
    where public.is_admin()
      and d.day > current_date - greatest(1, least(p_days, 3650))
    order by d.day
  )
  select
    w.day,
    w.collectors, w.binders_built, w.pages_built, w.cards_placed, w.artwork_placed,
    w.is_backfilled,
    w.collectors     - lag(w.collectors)     over (order by w.day),
    w.binders_built  - lag(w.binders_built)  over (order by w.day),
    w.pages_built    - lag(w.pages_built)    over (order by w.day),
    w.cards_placed   - lag(w.cards_placed)   over (order by w.day),
    w.artwork_placed - lag(w.artwork_placed) over (order by w.day)
  from windowed w
  order by w.day;
$$;

alter table public.community_stats_daily enable row level security;
-- No policies: the history is read through admin_community_growth() only. RLS with zero
-- policies already denies every row, but Supabase's default privileges hand `anon` and
-- `authenticated` a table-level SELECT on anything new in `public`, so revoke it too and
-- leave nothing resting on a single mechanism.
revoke all on public.community_stats_daily from anon, authenticated;

revoke all on function public.snapshot_community_stats() from public;
revoke all on function public.snapshot_community_stats() from anon, authenticated;
revoke all on function public.backfill_community_stats_daily(int) from public;
revoke all on function public.backfill_community_stats_daily(int) from anon, authenticated;
grant execute on function public.admin_community_growth(int) to authenticated;

-- ── Schedule ───────────────────────────────────────────────────────────────────────────
-- 00:07 UTC, a few minutes after the day rolls over, so `current_date` inside the function
-- is unambiguously yesterday-complete. Offset from the :23 hourly community_stats refresh
-- and from the 3am reclaim jobs.

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'snapshot-community-stats') then
      perform cron.unschedule('snapshot-community-stats');
    end if;
    perform cron.schedule(
      'snapshot-community-stats', '7 0 * * *',
      $j$ select public.snapshot_community_stats(); $j$
    );
  else
    raise notice 'pg_cron not enabled — daily community snapshot will NOT run.';
  end if;
end $$;

-- Seed, in this order on purpose: the backfill writes the last 30 days INCLUDING today as
-- reconstructed, then the snapshot overwrites today with a true capture (its `do update`
-- beats the backfill's `do nothing`). Every earlier day stays marked is_backfilled.
select public.backfill_community_stats_daily(30);
select public.snapshot_community_stats();
