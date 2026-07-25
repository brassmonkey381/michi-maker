-- tcgscan-michi-maker — the binder contest (docs/CONTEST.md)
--
-- Adds:
--   • contest_entries  — one row per entered binder: which contest + which ONE category.
--                        Owner-managed (enter / change category / withdraw); entering requires
--                        owning the binder AND the binder having ≤ 16 pages (the submission cap).
--   • contest_winners  — the post-contest Hall of Fame. Server-written only (manual SQL /
--                        service role — winners are declared by us, never by clients).
--   • contest_leaderboard(...) — vote-ranked public entries for one category, or ALL entries
--                        (p_category null) for the derived Community's Choice ranking.
--
-- RLS conventions match the init migration: RLS on every table; writes `to authenticated`
-- with an ownership predicate; UPDATE policies declare both USING and WITH CHECK.

-- ---------------------------------------------------------------------------
-- Entries
-- ---------------------------------------------------------------------------

create table public.contest_entries (
  binder_id  uuid primary key references public.binders (id) on delete cascade,
  owner_id   uuid not null references auth.users (id) on delete cascade,
  contest    text not null default 'first-annual-2026',
  category   text not null check (category in ('aesthetic', 'trainer', 'artist', 'creativity', 'meme', '2x2')),
  created_at timestamptz not null default now()
);

create index contest_entries_contest_category_idx on public.contest_entries (contest, category);
create index contest_entries_owner_idx on public.contest_entries (owner_id);

alter table public.contest_entries enable row level security;

-- Anyone can see the entries of binders that are publicly visible (the standard public gate);
-- owners always see their own entries (e.g. for a binder they've since made private).
create policy "Public contest entries are viewable by everyone"
  on public.contest_entries for select to anon, authenticated
  using (
    owner_id = (select auth.uid())
    or exists (
      select 1 from public.binders b
      join public.profiles p on p.id = b.owner_id
      where b.id = contest_entries.binder_id and b.is_public and coalesce(p.is_public, true)
    )
  );

-- Enter: your own binder, and it must respect the 16-page submission cap.
create policy "Users can enter their own binders"
  on public.contest_entries for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.binders b
      where b.id = contest_entries.binder_id and b.owner_id = (select auth.uid())
    )
    and (select count(*) from public.binder_pages pg where pg.binder_id = contest_entries.binder_id) <= 16
  );

-- Change category (until the deadline — the client enforces the date; post-deadline writes
-- are also moot because winners are computed from a snapshot we take at the end time).
create policy "Users can update their own entries"
  on public.contest_entries for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (select count(*) from public.binder_pages pg where pg.binder_id = contest_entries.binder_id) <= 16
  );

create policy "Users can withdraw their own entries"
  on public.contest_entries for delete to authenticated
  using (owner_id = (select auth.uid()));

grant select on public.contest_entries to anon, authenticated;
grant insert, update, delete on public.contest_entries to authenticated;

-- ---------------------------------------------------------------------------
-- Winners (Hall of Fame) — read-only to clients; rows are inserted by us after the contest.
-- ---------------------------------------------------------------------------

create table public.contest_winners (
  id         uuid primary key default gen_random_uuid(),
  contest    text not null,
  category   text not null,   -- a category slug, or 'community' for Community's Choice
  place      integer not null check (place >= 1),
  binder_id  uuid not null references public.binders (id) on delete cascade,
  owner_id   uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (contest, category, place)
);

alter table public.contest_winners enable row level security;

create policy "Winners are viewable by everyone"
  on public.contest_winners for select to anon, authenticated
  using (true);
-- No client write policies: declared via service role / manual SQL only.

grant select on public.contest_winners to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Leaderboard: public entries of a contest ranked by ALL-TIME likes. p_category null = every
-- entry regardless of category (the Community's Choice ranking). SECURITY DEFINER with the
-- same hard visibility gate as featured_binders/search_binders, so private/archived binders
-- never surface no matter what was entered. Same hydration contract as featured_binders.
-- ---------------------------------------------------------------------------

create or replace function public.contest_leaderboard(
  p_contest text default 'first-annual-2026',
  p_category text default null,
  p_limit integer default 100
)
returns table (binder_id uuid, like_count bigint, author_name text, category text)
language sql
stable
security definer
set search_path = ''
as $$
  select e.binder_id,
         (select count(*) from public.binder_likes l where l.binder_id = e.binder_id) as like_count,
         p.username as author_name,
         e.category
  from public.contest_entries e
  join public.binders b on b.id = e.binder_id
  join public.profiles p on p.id = b.owner_id
  where e.contest = p_contest
    and (p_category is null or e.category = p_category)
    and b.is_public
    and coalesce(p.is_public, true)
    and b.archived_at is null
    and coalesce(b.is_demo, false) = false
  order by like_count desc, e.created_at asc, e.binder_id
  limit greatest(p_limit, 0);
$$;

grant execute on function public.contest_leaderboard(text, text, integer) to anon, authenticated;
