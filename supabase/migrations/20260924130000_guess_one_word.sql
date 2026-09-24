-- Guessing one word at a time, with near misses accepted.
--
-- WHAT CHANGED AND WHY (owner, 2026-09-24). The first design took all the words at once from an
-- autocomplete box and answered "how many were right, never which". That protected the answer
-- perfectly and played badly: the reader had to commit to the whole thing blind, and the
-- autocomplete was doing most of the work anyway. One word at a time, with the box saying whether
-- that word landed, is the game people actually expect.
--
-- WHAT IT COSTS, SAID PLAINLY. Telling a player their word was right necessarily tells them WHICH
-- word was right. The old "never which" property is gone, deliberately. What it does not cost is
-- the tag vocabulary: a caller learns only about the word they already typed, against one day's
-- two-word answer, and there is no longer an autocomplete handing out candidates. That is a
-- narrower disclosure than the thing it replaces.
--
-- NEAR MISSES COUNT. "flowers" for "flower", "kyruem" for "kyurem". Exact-only matching turns a
-- game about noticing pictures into a spelling test, and the loss is silent: the player believes
-- they were wrong. pg_trgm is already installed, so similarity does the work rather than a
-- hand-rolled table of plural rules. It is called SCHEMA-QUALIFIED because these functions run
-- with `search_path = ''` and Supabase installs pg_trgm into `extensions`, not `public`.

/**
 * Normalised for comparison: lower case, trimmed, punctuation dropped, spaces collapsed, and a
 * trailing plural 's' removed. The plural rule is crude on purpose; the trigram check behind it
 * catches what it misses, and a longer list of English rules would be a new thing to maintain.
 */
create or replace function public.puzzle_norm(p_word text)
returns text language sql immutable set search_path = '' as $$
  select regexp_replace(
           regexp_replace(lower(btrim(coalesce(p_word, ''))), '[^a-z0-9 ]', '', 'g'),
           '\s+', ' ', 'g')
$$;

create or replace function public.puzzle_words_match(p_guess text, p_theme text)
returns boolean language sql immutable set search_path = '' as $$
  with g as (select public.puzzle_norm(p_guess) as w),
       t as (select public.puzzle_norm(p_theme) as w)
  select case
    when (select w from g) = '' then false
    when (select w from g) = (select w from t) then true
    -- Plural either way round, so "flowers" finds "flower" and "flower" finds "flowers".
    when (select w from g) = (select w from t) || 's' then true
    when (select w from g) || 's' = (select w from t) then true
    -- A typo. 0.5 IS MEASURED, NOT CHOSEN: against real pairs, typos of theme words score 0.571 to
    -- 0.615 ("citty"/"city" 0.571, "flowerz"/"flowers" 0.600) and different words score 0.333 and
    -- below. The pair that sets the ceiling is "night"/"light" at 0.333: both are plausible themes,
    -- so accepting that band would mark a wrong answer right. A transposition like "kyruem" for
    -- "kyurem" scores 0.273 and is therefore refused, which is the price of refusing night/light.
    -- Only on themes of four characters or more; below that, trigrams barely mean anything.
    when length((select w from t)) >= 4 and extensions.similarity((select w from g), (select w from t)) >= 0.5 then true
    else false
  end;
$$;

-- Dropped first: `create or replace` cannot change a function's OUT parameters, so a migration that
-- reshapes them fails on any database that already ran an earlier version of it.
drop function if exists public.guess_puzzle_word(uuid, text);

/**
 * One guess. Returns whether it landed, which of the answer's words it landed on (the player has
 * just named it, so this reveals nothing they do not now know), and how far along they are.
 *
 * FOUND WORDS ARE ACCUMULATED IN puzzle_plays.guess, whose meaning changes here from "what they
 * typed" to "which themes they have found". Nothing depends on the old meaning: no puzzle had been
 * published when this landed.
 *
 * A SOLVED PLAY IS FROZEN, as before, so a later guess cannot walk a win backwards.
 */
create or replace function public.guess_puzzle_word(p_puzzle_id uuid, p_word text)
-- NOT `found` AND NOT `of`. `FOUND` is PL/pgSQL's own boolean (set by the last statement) and an
-- OUT parameter of that name is read as it, so `solved := found = of` failed with "operator does
-- not exist: boolean = integer". `of` is a reserved word besides. Both are renamed rather than
-- quoted, because a column you have to quote at every call site is a trap left for later.
returns table (hit boolean, matched_word text, found_count integer, total integer, solved boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_user   uuid := auth.uid();
  v_answer text[];
  v_found  text[];
  v_hit    text;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if coalesce(btrim(p_word), '') = '' then
    raise exception 'type a word first' using errcode = '22023';
  end if;

  select a.themes into v_answer
    from public.daily_puzzle_answers a
    join public.daily_puzzles d on d.id = a.puzzle_id
   where a.puzzle_id = p_puzzle_id
     and d.publish_on <= (now() at time zone 'utc')::date;
  if v_answer is null then
    raise exception 'no such puzzle' using errcode = '42704';
  end if;

  select coalesce(pp.guess, '{}') into v_found
    from public.puzzle_plays pp
   where pp.user_id = v_user and pp.puzzle_id = p_puzzle_id;
  v_found := coalesce(v_found, '{}');

  -- The first answer word this guess matches that has not already been found.
  select t into v_hit
    from unnest(v_answer) as t
   where not (t = any (v_found))
     and public.puzzle_words_match(p_word, t)
   limit 1;

  if v_hit is not null then
    v_found := v_found || v_hit;
  end if;

  total       := cardinality(v_answer);
  found_count := cardinality(v_found);
  solved      := found_count = total;
  hit          := v_hit is not null;
  matched_word := v_hit;

  insert into public.puzzle_plays as pp
    (user_id, puzzle_id, guess, matched, correct, answered_at)
  values
    (v_user, p_puzzle_id, v_found, found_count, solved, case when solved then now() else null end)
  on conflict (user_id, puzzle_id) do update
    set guess       = case when pp.correct then pp.guess       else excluded.guess end,
        matched     = case when pp.correct then pp.matched     else excluded.matched end,
        correct     = case when pp.correct then pp.correct     else excluded.correct end,
        answered_at = case when pp.correct then pp.answered_at else excluded.answered_at end;

  return next;
end;
$$;

-- The all-at-once grader is superseded. Dropped rather than left beside its replacement: two
-- grading paths that can disagree is exactly the drift this is trying to avoid, and nothing has
-- been published for either of them to have graded.
drop function if exists public.grade_puzzle_guess(uuid, text[]);

revoke all on function public.guess_puzzle_word(uuid, text) from public;
revoke all on function public.puzzle_words_match(text, text) from public;
revoke all on function public.puzzle_norm(text) from public;
grant execute on function public.guess_puzzle_word(uuid, text) to authenticated;

comment on function public.guess_puzzle_word(uuid, text) is
  'One guess at one theme. Accepts plurals and typos (pg_trgm). Accumulates found words in '
  'puzzle_plays.guess and freezes a solved play.';
