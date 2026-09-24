-- The daily theme-search puzzle: a published puzzle a day, and what each player did with it.
--
-- ONE UTC DAY FOR EVERYONE (owner, 2026-09-23). `publish_on` is a plain date and it is the key:
-- one puzzle is live worldwide at a time, so a streak means the same thing for every player, the
-- weekly raffle has an unambiguous cut-off, and the puzzle on the site is the one that went to
-- Instagram that morning. The cost is that the rollover lands mid-afternoon in Hawaii, which is
-- the price of the other three and was chosen with that known.
--
-- THE TAG VOCABULARY IS THE PRODUCT, so this schema is built so that playing the game never
-- enumerates it. Three separate decisions carry that, and each is marked below:
--   1. the answer lives in its own table with no read policy at all, not in a column,
--   2. guesses are graded by a function that never returns the answer,
--   3. the autocomplete reads an owner-curated word list, never the tag corpus.
--
-- WHAT IS DELIBERATELY ABSENT: no streak column. A streak is derivable from puzzle_plays by
-- counting consecutive publish_on dates, and a stored counter is a second source of truth that
-- goes wrong exactly once and then stays wrong.

create table if not exists public.daily_puzzles (
  id            uuid primary key default gen_random_uuid(),
  publish_on    date not null unique,
  -- How many themes to guess. The ANSWER is not here (see daily_puzzle_answers); this is only the
  -- count, which the player is told anyway because the question asks for it.
  theme_count   integer not null check (theme_count between 1 and 4),
  -- The cards on the page, in reading order. Client-minted catalog ids (text, not uuid).
  card_ids      text[] not null check (cardinality(card_ids) between 1 and 16),
  rows          integer not null default 3 check (rows between 1 and 4),
  cols          integer not null default 3 check (cols between 1 and 4),
  backdrop_url  text,
  -- Shown on request rather than by default. Null means this one has no hint.
  hint          text,
  -- The binder this was curated in, so a puzzle can be traced back to the page it came from.
  source_binder_id uuid references public.binders(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- The grid has to hold the cards it names, or the page draws with holes or drops cards silently.
  constraint daily_puzzles_fits_page check (cardinality(card_ids) <= rows * cols)
);

create index if not exists daily_puzzles_publish_on_idx on public.daily_puzzles (publish_on desc);

drop trigger if exists daily_puzzles_set_updated_at on public.daily_puzzles;
create trigger daily_puzzles_set_updated_at
  before update on public.daily_puzzles
  for each row execute function public.set_updated_at();

-- (1) THE ANSWER, IN ITS OWN TABLE WITH NO READ POLICY.
--
-- A separate table rather than a revoked column on the one above, deliberately. Column-level
-- REVOKE works, but PostgREST answers `select=*` on such a table with a permission error rather
-- than a filtered row, so the protection depends on every present and future caller remembering to
-- name its columns. One `select('*')` written in a hurry either breaks the page or, if someone
-- "fixes" it by restoring the grant, silently publishes every answer. A table with no select policy
-- cannot be read by any client however the query is written.
create table if not exists public.daily_puzzle_answers (
  puzzle_id uuid primary key references public.daily_puzzles(id) on delete cascade,
  themes    text[] not null check (cardinality(themes) between 1 and 4)
);

create table if not exists public.puzzle_plays (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  puzzle_id    uuid not null references public.daily_puzzles(id) on delete cascade,
  seen_at      timestamptz not null default now(),
  -- What they typed. Null until they answer; an empty array means they dismissed without guessing,
  -- which is a different thing from not having seen it.
  guess        text[],
  correct      boolean,
  answered_at  timestamptz,
  -- How many of the themes they got, so a near miss can be shown as one without revealing which.
  matched      integer,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, puzzle_id)
);

create index if not exists puzzle_plays_user_idx on public.puzzle_plays (user_id, seen_at desc);
-- The weekly draw is a scan of correct answers in a date window, so index that shape.
create index if not exists puzzle_plays_correct_idx on public.puzzle_plays (answered_at) where correct;

drop trigger if exists puzzle_plays_set_updated_at on public.puzzle_plays;
create trigger puzzle_plays_set_updated_at
  before update on public.puzzle_plays
  for each row execute function public.set_updated_at();

-- (3) THE AUTOCOMPLETE'S WORD LIST, CURATED BY HAND.
--
-- The obvious autocomplete reads the real tag vocabulary, and that is precisely the thing this app
-- does not hand over: a client that can complete a prefix can walk the alphabet and take the lot.
-- So the suggestions come from a list the owner writes, seeded with the words that have already
-- been puzzle answers and whatever decoys make the game fair.
--
-- It is also the better game. A player should be choosing between words that plausibly ARE an
-- answer, not typing into the dark against thirty thousand tags, and a bounded list is what makes
-- "lake" versus "pond" a decision instead of a complaint.
create table if not exists public.puzzle_vocabulary (
  word       text primary key check (word = lower(word) and length(word) between 2 and 32),
  -- False parks a word without offering it yet (a theme being saved for a future puzzle).
  suggest    boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.daily_puzzles        enable row level security;
alter table public.daily_puzzle_answers enable row level security;
alter table public.puzzle_plays         enable row level security;
alter table public.puzzle_vocabulary    enable row level security;

-- READING A PUZZLE. Every signed-in session, guests included: a guest here holds an anonymous
-- session, so `to authenticated` already covers the visitor who arrived from Instagram and has not
-- made an account. A puzzle that is not published yet is not readable, which keeps tomorrow's page
-- off a curious client along with its answer.
drop policy if exists daily_puzzles_read on public.daily_puzzles;
create policy daily_puzzles_read on public.daily_puzzles
  for select to authenticated
  using (publish_on <= (now() at time zone 'utc')::date);

drop policy if exists daily_puzzles_write on public.daily_puzzles;
create policy daily_puzzles_write on public.daily_puzzles
  for all to authenticated
  using (public.is_privileged_write())
  with check (public.is_privileged_write());

-- NO SELECT POLICY ON THE ANSWERS, for anyone, ever. RLS denies by default, so the only way in is
-- the SECURITY DEFINER functions below, which are the audited path. Writes are privileged only.
drop policy if exists daily_puzzle_answers_write on public.daily_puzzle_answers;
create policy daily_puzzle_answers_write on public.daily_puzzle_answers
  for all to authenticated
  using (public.is_privileged_write())
  with check (public.is_privileged_write());

drop policy if exists puzzle_vocabulary_read on public.puzzle_vocabulary;
create policy puzzle_vocabulary_read on public.puzzle_vocabulary
  for select to authenticated
  using (suggest);

drop policy if exists puzzle_vocabulary_write on public.puzzle_vocabulary;
create policy puzzle_vocabulary_write on public.puzzle_vocabulary
  for all to authenticated
  using (public.is_privileged_write())
  with check (public.is_privileged_write());

-- A PLAY IS THE PLAYER'S OWN. The update policy declares both `using` and `with check` so a row
-- cannot be handed to somebody else on the way out.
drop policy if exists puzzle_plays_read on public.puzzle_plays;
create policy puzzle_plays_read on public.puzzle_plays
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists puzzle_plays_insert on public.puzzle_plays;
create policy puzzle_plays_insert on public.puzzle_plays
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists puzzle_plays_update on public.puzzle_plays;
create policy puzzle_plays_update on public.puzzle_plays
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No delete policy: a play is a record of what happened. Deleting the account clears it by cascade,
-- which is the only erasure this needs.

-- (2) GRADING, WITHOUT EVER RETURNING THE ANSWER.
--
-- The function reads the hidden table as its owner, compares, records the play, and hands back only
-- how many were right. A player who guesses one of two is told "one of two", which is the useful
-- feedback, and is NOT told which one: saying which would let two accounts split the alphabet.
--
-- Case and surrounding space are forgiven; nothing else is. The comparison is set-wise, so the
-- order the player types the words in does not matter.
create or replace function public.grade_puzzle_guess(p_puzzle_id uuid, p_guess text[])
returns table (correct boolean, matched integer, of integer)
language plpgsql security definer set search_path = public as $$
declare
  v_user   uuid := auth.uid();
  v_answer text[];
  v_guess  text[];
  v_open   boolean;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  -- A puzzle that is not published yet cannot be graded, or tomorrow's answer is brute-forceable
  -- tonight at a few hundred guesses a second.
  select true into v_open from public.daily_puzzles d
   where d.id = p_puzzle_id and d.publish_on <= (now() at time zone 'utc')::date;
  if v_open is not true then
    raise exception 'no such puzzle' using errcode = '42704';
  end if;

  select a.themes into v_answer from public.daily_puzzle_answers a where a.puzzle_id = p_puzzle_id;
  if v_answer is null then
    raise exception 'that puzzle has no answer recorded' using errcode = '42704';
  end if;

  -- Distinct, so typing the same right word twice is not two matches.
  select array_agg(distinct btrim(lower(g))) into v_guess
    from unnest(coalesce(p_guess, '{}')) as g
   where btrim(g) <> '';

  select count(*)::integer into matched
    from unnest(coalesce(v_guess, '{}')) as g
   where g = any (select btrim(lower(t)) from unnest(v_answer) as t);

  of := cardinality(v_answer);
  correct := matched = of;

  insert into public.puzzle_plays as pp (user_id, puzzle_id, guess, correct, matched, answered_at)
  values (v_user, p_puzzle_id, v_guess, correct, matched, now())
  on conflict (user_id, puzzle_id) do update
    -- FIRST CORRECT ANSWER STANDS. Without this a player answers, is told "one of two", and edits
    -- until the counter reads two, which is not a guess, it is a search. Once a play is correct it
    -- is frozen; an incorrect one may be amended.
    set guess       = case when pp.correct then pp.guess       else excluded.guess end,
        correct     = case when pp.correct then pp.correct     else excluded.correct end,
        matched     = case when pp.correct then pp.matched     else excluded.matched end,
        answered_at = case when pp.correct then pp.answered_at else excluded.answered_at end;

  return next;
end;
$$;

-- YESTERDAY'S ANSWER IS PUBLIC, today's is not. The reveal is what makes the game teachable: a
-- player sees the words and learns what the search box takes.
create or replace function public.puzzle_answer(p_puzzle_id uuid)
returns text[]
language sql security definer set search_path = public stable as $$
  select a.themes
    from public.daily_puzzle_answers a
    join public.daily_puzzles d on d.id = a.puzzle_id
   where a.puzzle_id = p_puzzle_id
     and auth.uid() is not null
     -- Strictly before today, so the answer appears when the next puzzle does and not a moment
     -- sooner. A player who has already answered correctly is shown their own guess instead, which
     -- the client has, so there is no case for opening this earlier.
     and d.publish_on < (now() at time zone 'utc')::date;
$$;

revoke all on function public.grade_puzzle_guess(uuid, text[]) from public;
revoke all on function public.puzzle_answer(uuid)              from public;
grant execute on function public.grade_puzzle_guess(uuid, text[]) to authenticated;
grant execute on function public.puzzle_answer(uuid)              to authenticated;

-- THE OPT-IN PROMPT, on the pattern profiles already uses for the avatar and the PRO trial: a
-- `*_prompt_at` column paces the asking, and the answer lives in profiles.preferences
-- (`dailyPuzzle`: 'on' | 'declined') so it merges with the rest of the blob in one write. Guests
-- are never prompted, following src/data/prompts.ts: they have no account to record it on.
alter table public.profiles
  add column if not exists daily_puzzle_prompt_at timestamptz;

comment on column public.profiles.daily_puzzle_prompt_at is
  'When the daily puzzle opt-in was last offered. The answer lives in preferences.dailyPuzzle.';
comment on table public.daily_puzzles is
  'One theme-search puzzle per UTC day. Readable once published; written only by a privileged caller.';
comment on table public.daily_puzzle_answers is
  'The answers. No select policy for anyone: reachable only via grade_puzzle_guess / puzzle_answer.';
comment on table public.puzzle_vocabulary is
  'The words the guess box suggests. Curated by hand so playing never enumerates the tag corpus.';
comment on table public.puzzle_plays is
  'One row per player per puzzle, created when it is shown. Streaks are derived from these, never stored.';
