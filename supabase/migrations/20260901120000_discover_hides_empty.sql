-- Discover shows binders, not empty ones.
--
-- A binder made public before anything was put in it is still a public binder, so it sat in
-- Discover as a title and a blank grid. It costs a visitor a tap to find out there is nothing
-- there, and it pushes real work down the page. The owner has done nothing wrong and nothing is
-- taken from them: the binder stays public, stays on their profile, and stays reachable by its
-- share link. It just does not get a slot in the browse feed until it holds something.
--
-- WHAT COUNTS AS FILLED. Every pocket that exists as a `binder_slots` row: cards, artwork panels
-- and tonal inserts alike. A `binder_slots` row IS a filled pocket (empty pockets are the absence
-- of a row, never a row with slot_type 'empty'), so this is a plain count.
--
-- Deliberately NOT "cards": michi's whole point is curated art layouts, and a binder sliced into
-- artwork panels with zero cards is finished work, not an empty binder. Counting card slots only
-- would hide exactly the binders this app exists to make.
--
-- THE THRESHOLD IS THE ONE NUMBER TO CHANGE. Owner intent 2026-09-01: hide 0-pocket binders now,
-- possibly raise the bar to 3 later ("a binder with two cards in it is not a binder yet"). It
-- appears once, below, marked MIN_FILLED_POCKETS.
--
-- WHY DROP AND RECREATE: same reason as 20260823140000 — the body changes but the signature does
-- not, so create-or-replace alone is fine; the drop keeps this file re-runnable next to its
-- sibling migrations that did change signatures.

create or replace function public.discover_binders(
  p_sort           text default 'recent',  -- 'recent' | 'likes'
  p_limit          integer default 40,
  p_contest        text default null,      -- exclude entries of this contest
  p_author         text default null,      -- ONLY this @username
  p_exclude_author text default null       -- everything EXCEPT this @username
)
returns table (
  binder_id      uuid,
  like_count     bigint,
  author_name    text,
  made_public_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id as binder_id,
         (select count(*) from public.binder_likes l where l.binder_id = b.id) as like_count,
         p.username as author_name,
         coalesce(b.made_public_at, b.created_at) as made_public_at
  from public.binders b
  join public.profiles p on p.id = b.owner_id
  where b.is_public
    and coalesce(p.is_public, true)
    and b.archived_at is null
    and coalesce(b.is_demo, false) = false
    -- MIN_FILLED_POCKETS: raise to 3 to require a binder to have some substance to it.
    -- `exists` rather than a count while the bar is 1, so Postgres stops at the first pocket
    -- instead of walking every slot of a full binder; swap to a counted subquery when it moves.
    and exists (
      select 1
        from public.binder_pages pg
        join public.binder_slots s on s.page_id = pg.id
       where pg.binder_id = b.id
    )
    and (
      p_contest is null
      or not exists (
        select 1 from public.contest_entries e
        where e.binder_id = b.id and e.contest = p_contest
      )
    )
    -- Username comparisons are case-insensitive: usernames are stored normalised, but a caller
    -- passing 'MichiMaker' should not silently select nothing.
    and (p_author is null or lower(p.username) = lower(p_author))
    and (p_exclude_author is null or lower(p.username) is distinct from lower(p_exclude_author))
  order by
    case when p_sort = 'likes'
      then (select count(*) from public.binder_likes l2 where l2.binder_id = b.id)
      else 0
    end desc,
    case when p_sort = 'likes'
      then null::timestamptz
      else coalesce(b.made_public_at, b.created_at)
    end desc nulls last,
    lower(coalesce(b.title, '')) asc,
    b.id
  limit greatest(p_limit, 0);
$$;

grant execute on function public.discover_binders(text, integer, text, text, text)
  to anon, authenticated;

-- Supporting index for the pocket test: binder_slots is scanned by page, and binder_pages by
-- binder. The second is what this adds; the first already exists for the page load.
create index if not exists binder_pages_binder_id_idx on public.binder_pages (binder_id);
