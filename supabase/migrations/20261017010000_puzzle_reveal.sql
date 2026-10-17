-- REVEAL THE ANSWER AFTER FIVE GUESSES (owner, 2026-10-16).
--
-- Until now the only way to learn today's words was to find them, or to come back tomorrow. A
-- player five guesses in who is not going to get there deserves a way out that is not closing
-- the tab. The server counts every guess (hits and misses: `attempts`), and once five are in it
-- hands over the words through reveal_puzzle_answer, stamping `revealed_at` on the play. A
-- revealed play is NOT a win: `correct` stays as it was, the streak does not move, and the
-- count of correct answers the admin list and the weekly draw read is untouched.
--
-- Re-runnable: columns are added if missing; the functions are replaced.

alter table public.puzzle_plays
  add column if not exists attempts    integer not null default 0,
  add column if not exists revealed_at timestamptz;

-- The guess function, as before, plus the attempt count. Everything else is unchanged.
create or replace function public.guess_puzzle_word(p_puzzle_id uuid, p_word text)
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
     and d.publish_on <= public.puzzle_today();
  if v_answer is null then
    raise exception 'no such puzzle' using errcode = '42704';
  end if;

  select coalesce(pp.guess, '{}') into v_found
    from public.puzzle_plays pp
   where pp.user_id = v_user and pp.puzzle_id = p_puzzle_id;
  v_found := coalesce(v_found, '{}');

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
    (user_id, puzzle_id, guess, matched, correct, answered_at, attempts)
  values
    (v_user, p_puzzle_id, v_found, found_count, solved, case when solved then now() else null end, 1)
  on conflict (user_id, puzzle_id) do update
    set guess       = case when pp.correct then pp.guess       else excluded.guess end,
        matched     = case when pp.correct then pp.matched     else excluded.matched end,
        correct     = case when pp.correct then pp.correct     else excluded.correct end,
        answered_at = case when pp.correct then pp.answered_at else excluded.answered_at end,
        -- A solved or revealed play takes no more guesses; the count stops with it.
        attempts    = case when pp.correct or pp.revealed_at is not null then pp.attempts else pp.attempts + 1 end;

  return next;
end;
$$;

grant execute on function public.guess_puzzle_word(uuid, text) to authenticated;

-- Today's words, for a player who has made five guesses (or already revealed). Anyone else is
-- refused, so the answer never leaves the server early. Yesterday's words still come from
-- puzzle_answer, which needs no guesses at all.
create or replace function public.reveal_puzzle_answer(p_puzzle_id uuid)
returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_play public.puzzle_plays%rowtype;
  v_answer text[];
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into v_play from public.puzzle_plays pp
   where pp.user_id = v_user and pp.puzzle_id = p_puzzle_id;
  if v_play.id is null or coalesce(v_play.correct, false) then
    raise exception 'nothing to reveal' using errcode = '22023';
  end if;
  if v_play.revealed_at is null and v_play.attempts < 5 then
    raise exception 'five guesses first' using errcode = '22023';
  end if;
  select a.themes into v_answer
    from public.daily_puzzle_answers a
    join public.daily_puzzles d on d.id = a.puzzle_id
   where a.puzzle_id = p_puzzle_id
     and d.publish_on <= public.puzzle_today();
  if v_answer is null then
    raise exception 'no such puzzle' using errcode = '42704';
  end if;
  if v_play.revealed_at is null then
    update public.puzzle_plays set revealed_at = now() where id = v_play.id;
  end if;
  return v_answer;
end;
$$;

grant execute on function public.reveal_puzzle_answer(uuid) to authenticated;
