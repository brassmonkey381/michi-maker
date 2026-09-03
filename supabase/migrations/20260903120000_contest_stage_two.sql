-- tcgscan-michi-maker — the binder contest, STAGE TWO (docs/CONTEST.md)
--
-- The contest becomes two rounds. Stage 1 is the open field, voted with ordinary binder likes,
-- and it closes at CONTEST.finalsOpenAt. Stage 2 is a one-week final: the top ten of each
-- category are frozen, locked against edits, and voted again from zero.
--
-- Adds:
--   • contest_finalists       — the frozen top ten per category. Server-written only (the
--                               snapshot is a decision we make, never something a client asserts).
--   • contest_finals_votes    — stage-2 votes. A SEPARATE table from binder_likes, so stage 1's
--                               result stays intact and auditable and nobody's public heart count
--                               is rewritten to stage a second round.
--   • contest_lock_guard()    — the edit lock, as triggers on binders / binder_pages /
--                               binder_slots. A prize contest judged on frozen entries cannot be
--                               enforced by the client the entrant is holding.
--   • contest_finals_leaderboard(...) — finalists ranked by stage-2 votes.
--
-- RLS conventions match the init migration: RLS on every table; writes `to authenticated` with an
-- ownership predicate; UPDATE policies declare both USING and WITH CHECK.

-- ---------------------------------------------------------------------------
-- Finalists — the frozen field. Written by scripts/contest-stage2.sql (apply-contest-stage2.ps1)
-- at the stage-1 cutoff; no client write policies, exactly like contest_winners.
-- ---------------------------------------------------------------------------

create table public.contest_finalists (
  contest      text not null default 'first-annual-2026',
  category     text not null check (category in ('aesthetic', 'trainer', 'artist', 'creativity', 'meme', '2x2')),
  binder_id    uuid not null references public.binders (id) on delete cascade,
  owner_id     uuid not null references auth.users (id) on delete cascade,
  -- Stage-1 finishing position, 1..10. Kept for the record and for a stable tie-break in the
  -- stage-2 ranking: with every finalist starting at zero votes, SOMETHING has to order them on
  -- the first page load, and "how they qualified" is the only non-arbitrary answer.
  seed         integer not null check (seed >= 1),
  -- What it finished stage 1 with. Never displayed as a stage-2 score; this is the audit trail
  -- for how the field was picked, which is the question a losing entrant will ask.
  stage1_votes integer not null default 0,
  -- The stage-2 window, stamped per row by the snapshot script from src/data/contest.ts. On the
  -- row rather than in a config table because the vote policy has to read it on every insert, and
  -- a lock/close that lives anywhere but next to the data it governs is a lock that drifts.
  votes_open_at  timestamptz not null,
  votes_close_at timestamptz not null,
  -- The edit lock, separable from the voting window: the field stays frozen after voting closes,
  -- until we lift it. Flip to false to hand a binder back to its owner.
  locked       boolean not null default true,
  created_at   timestamptz not null default now(),
  primary key (contest, binder_id),
  unique (contest, category, seed)
);

create index contest_finalists_binder_idx on public.contest_finalists (binder_id) where locked;
create index contest_finalists_category_idx on public.contest_finalists (contest, category);

alter table public.contest_finalists enable row level security;

create policy "Finalists are viewable by everyone"
  on public.contest_finalists for select to anon, authenticated
  using (true);
-- No client write policies: the field is declared via service role / manual SQL only.

grant select on public.contest_finalists to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Stage-2 votes. Mirrors binder_likes' rules deliberately — one vote per account per binder, real
-- accounts only, never your own binder — so "vote" behaves the way "like" already taught people it
-- behaves. What it adds is the window: a vote only counts for a locked-in finalist, and only
-- between that row's open and close instants, checked on the server's clock.
-- ---------------------------------------------------------------------------

create table public.contest_finals_votes (
  contest    text not null default 'first-annual-2026',
  binder_id  uuid not null references public.binders (id) on delete cascade,
  voter_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (binder_id, voter_id)
);

create index contest_finals_votes_binder_idx on public.contest_finals_votes (binder_id);

alter table public.contest_finals_votes enable row level security;

-- Read: your own vote (so the button can show you already voted), and the binder owner's view of
-- who voted for them. Public COUNTS go through the SECURITY DEFINER leaderboard below, so an
-- anonymous visitor never reads individual vote rows — same shape as binder_likes.
create policy "Voters and owners can see finals votes"
  on public.contest_finals_votes for select to authenticated
  using (
    voter_id = (select auth.uid())
    or exists (
      select 1 from public.binders b
      where b.id = contest_finals_votes.binder_id and b.owner_id = (select auth.uid())
    )
  );

create policy "Real accounts can vote for finalists in the window"
  on public.contest_finals_votes for insert to authenticated
  with check (
    voter_id = (select auth.uid())
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and exists (
      select 1
      from public.contest_finalists f
      join public.binders b on b.id = f.binder_id
      join public.profiles p on p.id = b.owner_id
      where f.binder_id = contest_finals_votes.binder_id
        and f.contest = contest_finals_votes.contest
        and now() >= f.votes_open_at
        and now() <= f.votes_close_at
        and b.is_public
        and coalesce(p.is_public, true)
        and b.archived_at is null
        and b.owner_id <> (select auth.uid())
    )
  );

-- Change your mind, while the window is open. Past the close a vote is final: the count at
-- votes_close_at is the result, and a result that can still be edited afterwards is not one.
create policy "Voters can take back a vote in the window"
  on public.contest_finals_votes for delete to authenticated
  using (
    voter_id = (select auth.uid())
    and exists (
      select 1 from public.contest_finalists f
      where f.binder_id = contest_finals_votes.binder_id
        and f.contest = contest_finals_votes.contest
        and now() <= f.votes_close_at
    )
  );

grant select, insert, delete on public.contest_finals_votes to authenticated;

-- ---------------------------------------------------------------------------
-- THE EDIT LOCK.
--
-- One guard function for three tables, resolving each row back to its binder. SECURITY DEFINER so
-- it can read contest_finalists regardless of the caller's policies.
--
-- The service role passes straight through (auth.uid() is null): the snapshot script, prize
-- fulfilment and any manual repair have to be able to touch a locked binder, and they are us. An
-- anonymous visitor also has a null uid but cannot reach these tables at all — every write policy
-- on binders/binder_pages/binder_slots already requires ownership.
-- ---------------------------------------------------------------------------

create or replace function public.contest_lock_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_binder uuid;
begin
  if (select auth.uid()) is null then
    return coalesce(new, old);
  end if;

  v_binder := case tg_table_name
    when 'binders' then coalesce(new.id, old.id)
    when 'binder_pages' then coalesce(new.binder_id, old.binder_id)
    when 'binder_slots' then (
      select pg.binder_id from public.binder_pages pg
      where pg.id = coalesce(new.page_id, old.page_id)
    )
  end;

  if v_binder is null then
    return coalesce(new, old);
  end if;

  if exists (
    select 1 from public.contest_finalists f
    where f.binder_id = v_binder and f.locked
  ) then
    raise exception 'This binder is a locked contest finalist and cannot be edited.'
      using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$$;

-- Deleting the BINDER itself stays allowed on purpose. It is the one edit that is really a
-- withdrawal, and an entrant who wants their work off the site entirely must not be trapped by a
-- contest they entered; the cascade takes the entry and the finalist row with it. Everything that
-- would change what voters are looking at — the binder's title, description, cover and public
-- flag, and every page and slot — is refused.
create trigger contest_lock_binders
  before update on public.binders
  for each row execute function public.contest_lock_guard();

create trigger contest_lock_binder_pages
  before insert or update or delete on public.binder_pages
  for each row execute function public.contest_lock_guard();

create trigger contest_lock_binder_slots
  before insert or update or delete on public.binder_slots
  for each row execute function public.contest_lock_guard();

-- ---------------------------------------------------------------------------
-- Stage-2 leaderboard. Same hard visibility gate and hydration contract as contest_leaderboard,
-- ranked by stage-2 votes; ties fall back to the stage-1 seed, so an all-zero board on the first
-- morning reads as the qualifying order rather than as random noise.
-- ---------------------------------------------------------------------------

create or replace function public.contest_finals_leaderboard(
  p_contest text default 'first-annual-2026',
  p_category text default null,
  p_limit integer default 100
)
returns table (binder_id uuid, vote_count bigint, author_name text, category text, seed integer)
language sql
stable
security definer
set search_path = ''
as $$
  select f.binder_id,
         (select count(*) from public.contest_finals_votes v
           where v.binder_id = f.binder_id and v.contest = f.contest) as vote_count,
         p.username as author_name,
         f.category,
         f.seed
  from public.contest_finalists f
  join public.binders b on b.id = f.binder_id
  join public.profiles p on p.id = b.owner_id
  where f.contest = p_contest
    and (p_category is null or f.category = p_category)
    and b.is_public
    and coalesce(p.is_public, true)
    and b.archived_at is null
    and coalesce(b.is_demo, false) = false
  order by vote_count desc, f.seed asc, f.binder_id
  limit greatest(p_limit, 0);
$$;

grant execute on function public.contest_finals_leaderboard(text, text, integer) to anon, authenticated;
