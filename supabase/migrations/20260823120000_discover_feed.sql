-- Discover page ordering: a contest-entry feed, and everything else sorted by when it went
-- public or by how much it is liked.
--
-- WHY A NEW COLUMN. "Most recently made public" had no data behind it. `updated_at` moves on
-- every edit, so a binder published months ago jumps to the top of a "new" feed the moment its
-- owner nudges a card, which is exactly the ordering people notice is wrong. `created_at` is
-- stable but answers a different question: plenty of binders are built private and published
-- later. So record the transition itself.
--
-- THE BACKFILL IS AN APPROXIMATION AND SAYS SO. We never recorded the flip for binders that are
-- already public, and it is not recoverable from anything in the table. `created_at` is the
-- closest honest stand-in: correct for every binder that was public from the start, and too old
-- (never too new) for the rest, so an existing binder can never outrank a genuinely new one.
-- Every publish from here on carries the real instant.

alter table public.binders
  add column if not exists made_public_at timestamptz;

comment on column public.binders.made_public_at is
  'When is_public last went false -> true. Set by the binders_made_public trigger. Rows that '
  'predate the column were backfilled from created_at, which is a lower bound, not the truth.';

update public.binders
  set made_public_at = created_at
  where is_public and made_public_at is null;

-- Stamp the transition, not every write. `before update of is_public` means an ordinary edit
-- never fires this, and the old.is_public guard means re-saving an already-public binder does
-- not refresh its position in the feed. Unpublishing deliberately LEAVES the old timestamp: it
-- is a record of the last publish, and clearing it would make a republish look like a first one.
create or replace function public.binders_stamp_made_public()
returns trigger
language plpgsql
as $$
begin
  if new.is_public and (tg_op = 'INSERT' or not coalesce(old.is_public, false)) then
    new.made_public_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists binders_made_public on public.binders;
create trigger binders_made_public
  before insert or update of is_public on public.binders
  for each row execute function public.binders_stamp_made_public();

create index if not exists binders_made_public_at_idx
  on public.binders (made_public_at desc) where is_public;

-- The feed of contest entries -------------------------------------------------------------
--
-- contest_leaderboard already returns every entry when p_category is null, but it ranks by
-- votes, which is the wrong shape for a feed at the top of Discover: the same binders sit there
-- until the voting moves, and a brand new entry is invisible. This is the same visibility gate,
-- ordered newest entry first, so entering a binder puts it in front of people immediately.
create or replace function public.contest_entry_feed(
  p_contest text,
  p_limit   integer default 60
)
returns table (
  binder_id   uuid,
  like_count  bigint,
  author_name text,
  category    text,
  entered_at  timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.binder_id,
         (select count(*) from public.binder_likes l where l.binder_id = e.binder_id) as like_count,
         p.username as author_name,
         e.category,
         e.created_at as entered_at
  from public.contest_entries e
  join public.binders b on b.id = e.binder_id
  join public.profiles p on p.id = b.owner_id
  where e.contest = p_contest
    and b.is_public
    and coalesce(p.is_public, true)
    and b.archived_at is null
    and coalesce(b.is_demo, false) = false
  order by e.created_at desc, e.binder_id
  limit greatest(p_limit, 0);
$$;

grant execute on function public.contest_entry_feed(text, integer) to anon, authenticated;

-- Everything that is NOT an entry ----------------------------------------------------------
--
-- Same visibility gate as search_binders (public binder, public owner, not archived, not a
-- seeded demo), with two orderings and an optional contest exclusion so the Discover page can
-- show "all other binders" without repeating what the feed above it already showed.
--
-- The two sorts share one function rather than becoming two, so the visibility gate can never
-- drift between them. Both order-by keys are always present; the inactive one is a constant,
-- which keeps the column types stable and lets the planner drop it.
create or replace function public.discover_binders(
  p_sort    text default 'recent',   -- 'recent' | 'likes'
  p_limit   integer default 40,
  p_contest text default null        -- exclude entries of this contest
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
    and (
      p_contest is null
      or not exists (
        select 1 from public.contest_entries e
        where e.binder_id = b.id and e.contest = p_contest
      )
    )
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

grant execute on function public.discover_binders(text, integer, text) to anon, authenticated;
