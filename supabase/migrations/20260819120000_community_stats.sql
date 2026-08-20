-- tcgscan-michi-maker — cached community totals for the landing page
--
-- The landing page (`/welcome`) is guest-facing, and `anon` cannot read `binders`,
-- `binder_pages` or `binder_slots` under RLS. It also must not run an aggregate over every
-- slot row on every page view. Both problems are solved the same way: precompute the five
-- totals into a single row, let anyone SELECT that row, and refresh it on a schedule.
--
-- `community_stats` is a SINGLETON — the `id boolean primary key default true` + check
-- constraint is the standard one-row-table trick, so `on conflict (id) do update` in the
-- refresh function is always an upsert of the same row and the table can never grow.
--
-- The counts deliberately match the ad-hoc query these came from, unchanged:
--   • every binder whose owner has a username, PUBLIC OR NOT — the claim is about what
--     people have BUILT, not what is viewable. Do not add an `is_public` filter here
--     without also rewording the landing copy (see src/app/welcome.tsx). Only ~24 binders
--     are publicly reachable; the wording on the page ("built", "placed") is chosen to be
--     true of all of them, and "showcased"/"public"/"on display" would not be.
--   • `count(distinct bp.id)` because the slots join fans pages out; slots do not
--     multiply (each slot belongs to exactly one page), so they are counted directly.
--
-- Nothing per-row or identifying is exposed: the table holds five integers and a timestamp.
-- The source query's `auth.users` join is gone (its `email` was selected but never
-- aggregated), and the group-by keeps only the binder PK plus owner, which every dropped
-- column was functionally dependent on — the totals are byte-identical either way.

create table if not exists public.community_stats (
  id boolean primary key default true,
  collectors bigint not null default 0,
  binders_built bigint not null default 0,
  pages_built bigint not null default 0,
  cards_placed bigint not null default 0,
  artwork_placed bigint not null default 0,
  computed_at timestamptz not null default now(),
  constraint community_stats_singleton check (id)
);

comment on table public.community_stats is
  'Singleton row of aggregate community totals for the public landing page. Refreshed hourly '
  'by public.refresh_community_stats() via pg_cron. Never holds per-user data.';

-- ── Refresh ────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER because the totals span every user's binders; the function is the ONLY
-- writer (the table has no write policies) and it is not executable by clients.

create or replace function public.refresh_community_stats()
returns public.community_stats
language sql
security definer
set search_path = public, pg_temp
as $$
  with binder_summary as (
    select
      b.id       as binder_id,
      b.owner_id,
      count(distinct bp.id)                                as n_pages,
      count(bs.id) filter (where bs.slot_type = 'card')    as n_cards,
      count(bs.id) filter (where bs.slot_type = 'artwork') as n_artwork
    from binders b
    left join profiles p
      on b.owner_id = p.id
    left join binder_pages bp
      on bp.binder_id = b.id
    left join binder_slots bs
      on bs.page_id = bp.id
    where p.username is not null
    group by b.id, b.owner_id
  )
  insert into public.community_stats as cs (
    id, collectors, binders_built, pages_built, cards_placed, artwork_placed, computed_at
  )
  select
    true,
    count(distinct owner_id),
    count(distinct binder_id),
    coalesce(sum(n_pages), 0),
    coalesce(sum(n_cards), 0),
    coalesce(sum(n_artwork), 0),
    now()
  from binder_summary
  on conflict (id) do update set
    collectors     = excluded.collectors,
    binders_built  = excluded.binders_built,
    pages_built    = excluded.pages_built,
    cards_placed   = excluded.cards_placed,
    artwork_placed = excluded.artwork_placed,
    computed_at    = excluded.computed_at
  returning cs.*;
$$;

comment on function public.refresh_community_stats() is
  'Recomputes the singleton public.community_stats row. Cheap (single-digit ms at current '
  'scale, no disk reads) but it touches every binder_slots row, which is exactly why the '
  'landing page reads the cached row instead of running this.';

-- Clients never refresh; only the cron job (and manual SQL) may.
revoke all on function public.refresh_community_stats() from public;
revoke all on function public.refresh_community_stats() from anon, authenticated;

-- ── Read access ────────────────────────────────────────────────────────────────────────
-- World-readable by design: the row is aggregate-only. RLS stays ON with a SELECT-only
-- policy so the table follows the same conventions as everything else here, and so no
-- client can ever write it even if a grant is widened by mistake.

alter table public.community_stats enable row level security;

drop policy if exists "community stats are readable by everyone" on public.community_stats;
create policy "community stats are readable by everyone"
  on public.community_stats
  for select
  to anon, authenticated
  using (true);

grant select on public.community_stats to anon, authenticated;

-- ── Schedule ───────────────────────────────────────────────────────────────────────────
-- Hourly at :23. The landing page tolerates an hour of staleness completely — these are
-- lifetime totals that move a handful of binders a day. Raise the cadence only if the
-- numbers ever start driving something time-sensitive; the cost is not the reason to
-- keep it low, the pointlessness is.

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'refresh-community-stats') then
      perform cron.unschedule('refresh-community-stats');
    end if;
    perform cron.schedule(
      'refresh-community-stats', '23 * * * *',
      $j$ select public.refresh_community_stats(); $j$
    );
  else
    raise notice 'pg_cron not enabled — community stats will NOT refresh on a schedule.';
  end if;
end $$;

-- Populate immediately so the page has numbers before the first cron tick.
select public.refresh_community_stats();
