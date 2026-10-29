-- MICHI NINE (owner, 2026-10-29): the daily puzzle as a Reddit game, in the sister repo
-- `michi-nine` (a Devvit web app). Reddit players have no michi account, so the game's server
-- grades guesses through these functions, keyed by the player's Reddit id, with a shared key that
-- lives in Vault here and in the Devvit app's secret settings there. The answers never leave
-- daily_puzzle_answers: a guess comes back as hit or miss and the word it landed on, exactly as
-- guess_puzzle_word does for a signed-in michi reader.
--
-- Apply with apply-michi-nine.ps1 (tcgscan root), which also mints the key.

create table if not exists public.michi_nine_plays (
  player      text not null check (player ~ '^t2_[a-z0-9]+$'),
  puzzle_id   uuid not null references public.daily_puzzles(id) on delete cascade,
  found       text[] not null default '{}',
  attempts    integer not null default 0,
  solved      boolean not null default false,
  solved_at   timestamptz,
  revealed_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (player, puzzle_id)
);
create index if not exists michi_nine_plays_puzzle_idx on public.michi_nine_plays (puzzle_id) where solved;

drop trigger if exists michi_nine_plays_set_updated_at on public.michi_nine_plays;
create trigger michi_nine_plays_set_updated_at
  before update on public.michi_nine_plays
  for each row execute function public.set_updated_at();

-- No policies at all: the only way in is the functions below.
alter table public.michi_nine_plays enable row level security;

comment on table public.michi_nine_plays is
  'One row per Reddit player per puzzle, written only by the michi_nine_* functions. '
  'player is the Reddit t2 id. Streaks are derived, never stored.';

-- The return columns changed after the first apply (found is PL/pgSQL's own FOUND): drop first.
drop function if exists public.michi_nine_play(text, text, uuid);
drop function if exists public.michi_nine_guess(text, text, uuid, text);

/** Is this the key the michi-nine server holds? False, never an error, when Vault has no key yet. */
create or replace function public.michi_nine_key_ok(p_key text)
returns boolean
language sql security definer set search_path = '' stable as $$
  select coalesce(p_key, '') <> ''
     and exists (
       select 1 from vault.decrypted_secrets s
        where s.name = 'michi_nine_key' and s.decrypted_secret = p_key
     );
$$;

/**
 * The player's standing on one puzzle, and their streak: solved days in a row counting back from
 * the current puzzle day, where today not yet solved does not break it (dailyPuzzleLogic.ts).
 */
create or replace function public.michi_nine_play(p_key text, p_player text, p_puzzle_id uuid)
returns table (found_words text[], attempts integer, solved boolean, revealed boolean, streak integer)
language plpgsql security definer set search_path = public as $$
declare
  v_day  date := public.puzzle_today();
  v_won  date[];
begin
  if not public.michi_nine_key_ok(p_key) then
    raise exception 'michi nine key' using errcode = '42501';
  end if;
  select coalesce(pp.found, '{}'), pp.attempts, pp.solved, pp.revealed_at is not null
    into found_words, attempts, solved, revealed
    from public.michi_nine_plays pp
   where pp.player = p_player and pp.puzzle_id = p_puzzle_id;
  if found_words is null then
    found_words := '{}'; attempts := 0; solved := false; revealed := false;
  end if;
  select array_agg(d.publish_on) into v_won
    from public.michi_nine_plays pp
    join public.daily_puzzles d on d.id = pp.puzzle_id
   where pp.player = p_player and pp.solved;
  v_won := coalesce(v_won, '{}');
  streak := 0;
  if not (v_day = any (v_won)) then v_day := v_day - 1; end if;
  while v_day = any (v_won) loop
    streak := streak + 1;
    v_day := v_day - 1;
  end loop;
  return next;
end;
$$;

/** One guess at one theme, as guess_puzzle_word, for a Reddit player. */
create or replace function public.michi_nine_guess(p_key text, p_player text, p_puzzle_id uuid, p_word text)
returns table (hit boolean, matched_word text, found_words text[], attempts integer, total integer, solved boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_answer text[];
  v_play   public.michi_nine_plays%rowtype;
  v_hit    text;
begin
  if not public.michi_nine_key_ok(p_key) then
    raise exception 'michi nine key' using errcode = '42501';
  end if;
  if p_player !~ '^t2_[a-z0-9]+$' then
    raise exception 'not a reddit player' using errcode = '22023';
  end if;
  if coalesce(btrim(p_word), '') = '' then
    raise exception 'type a word first' using errcode = '22023';
  end if;
  select a.themes into v_answer
    from public.daily_puzzle_answers a
    join public.daily_puzzles d on d.id = a.puzzle_id
   where a.puzzle_id = p_puzzle_id
     and d.publish_on <= public.puzzle_today();
  if v_answer is null then
    raise exception 'no such puzzle' using errcode = '42704';
  end if;
  select * into v_play from public.michi_nine_plays pp
   where pp.player = p_player and pp.puzzle_id = p_puzzle_id;
  if v_play.solved then
    -- A solved play is frozen: say so and change nothing.
    hit := false; matched_word := null; found_words := v_play.found; attempts := v_play.attempts;
    total := cardinality(v_answer); solved := true;
    return next; return;
  end if;
  found_words := coalesce(v_play.found, '{}');
  select t into v_hit
    from unnest(v_answer) as t
   where not (t = any (found_words))
     and public.puzzle_words_match(p_word, t)
   limit 1;
  if v_hit is not null then
    found_words := found_words || v_hit;
  end if;
  total        := cardinality(v_answer);
  solved       := cardinality(found_words) = total;
  hit          := v_hit is not null;
  matched_word := v_hit;
  -- A guess after the reveal still counts as a guess, but the reveal stays open.
  attempts     := coalesce(v_play.attempts, 0) + 1;
  insert into public.michi_nine_plays as pp (player, puzzle_id, found, attempts, solved, solved_at)
  values (p_player, p_puzzle_id, found_words, attempts, solved, case when solved then now() else null end)
  on conflict (player, puzzle_id) do update
    set found     = excluded.found,
        attempts  = excluded.attempts,
        solved    = excluded.solved,
        solved_at = excluded.solved_at;
  return next;
end;
$$;

/**
 * The words, for a player five guesses in (REVEAL_AFTER in michi), or for any player once the
 * puzzle is yesterday's. Stamps the play. Never for a solved play: nothing is left to reveal.
 */
create or replace function public.michi_nine_reveal(p_key text, p_player text, p_puzzle_id uuid)
returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v_play   public.michi_nine_plays%rowtype;
  v_answer text[];
  v_old    boolean;
begin
  if not public.michi_nine_key_ok(p_key) then
    raise exception 'michi nine key' using errcode = '42501';
  end if;
  select * into v_play from public.michi_nine_plays pp
   where pp.player = p_player and pp.puzzle_id = p_puzzle_id;
  if coalesce(v_play.solved, false) then
    raise exception 'nothing to reveal' using errcode = '22023';
  end if;
  select d.publish_on < public.puzzle_today() into v_old
    from public.daily_puzzles d where d.id = p_puzzle_id;
  if v_old is null then
    raise exception 'no such puzzle' using errcode = '42704';
  end if;
  if not v_old and v_play.revealed_at is null and coalesce(v_play.attempts, 0) < 5 then
    raise exception 'five guesses first' using errcode = '22023';
  end if;
  select a.themes into v_answer from public.daily_puzzle_answers a where a.puzzle_id = p_puzzle_id;
  insert into public.michi_nine_plays as pp (player, puzzle_id, revealed_at)
  values (p_player, p_puzzle_id, now())
  on conflict (player, puzzle_id) do update
    set revealed_at = coalesce(pp.revealed_at, now());
  return v_answer;
end;
$$;

/** How a puzzle is going on Reddit: players and solvers, for the post. */
create or replace function public.michi_nine_stats(p_key text, p_puzzle_id uuid)
returns table (players integer, solvers integer)
language sql security definer set search_path = public stable as $$
  select count(*)::integer as players,
         count(*) filter (where pp.solved)::integer as solvers
    from public.michi_nine_plays pp
   where pp.puzzle_id = p_puzzle_id
     and public.michi_nine_key_ok(p_key);
$$;

revoke all on function public.michi_nine_key_ok(text)                   from public;
revoke all on function public.michi_nine_play(text, text, uuid)         from public;
revoke all on function public.michi_nine_guess(text, text, uuid, text)  from public;
revoke all on function public.michi_nine_reveal(text, text, uuid)       from public;
revoke all on function public.michi_nine_stats(text, uuid)              from public;
-- Callable with the publishable key, which is how the Devvit server calls; the shared key is
-- what actually admits a call.
grant execute on function public.michi_nine_play(text, text, uuid)        to anon, authenticated;
grant execute on function public.michi_nine_guess(text, text, uuid, text) to anon, authenticated;
grant execute on function public.michi_nine_reveal(text, text, uuid)      to anon, authenticated;
grant execute on function public.michi_nine_stats(text, uuid)             to anon, authenticated;

comment on function public.michi_nine_guess(text, text, uuid, text) is
  'michi-nine (Reddit): one guess at one theme for a Reddit player, admitted by the Vault key michi_nine_key.';
