-- The puzzle day turns over at 3am Pacific, not at midnight UTC.
--
-- WHY IT MOVED (owner, 2026-09-24). Midnight UTC is 5pm the previous afternoon in California, so
-- "a new one every morning" was landing mid-afternoon the day before for the people most likely to
-- be reading it, and the post's own "play tomorrow morning" was wrong by most of a day. 3am local
-- is after the night owls and before anyone is up.
--
-- WHY A NAMED ZONE AND NOT AN OFFSET. "3am PST" is ambiguous for half the year. A fixed -8 gives
-- 3am in winter and 4am in summer; a fixed -7 gives 3am in summer and 2am in winter. Measured:
-- 10:00Z is 3:00 PDT in September and 2:00 PST in December. `America/Los_Angeles` follows the
-- change, so the rule is the same clock time all year.
--
-- ONE DEFINITION, because this rule was about to exist in five places (the read policy, the list's
-- published flag, the guess check, the answer reveal, and the client). Five copies of a date rule
-- drift, and the drift shows up as a puzzle that is playable but invisible, or gradeable but not
-- yet published.

/**
 * Today, as the puzzle counts it: the Pacific date, three hours back, so the day rolls at 03:00
 * local. STABLE not IMMUTABLE, because it reads the clock.
 */
create or replace function public.puzzle_today()
returns date language sql stable set search_path = '' as $$
  select ((now() at time zone 'America/Los_Angeles') - interval '3 hours')::date;
$$;

/** The instant that date began, in UTC, which is what a countdown needs. */
create or replace function public.puzzle_day_started(p_day date)
returns timestamptz language sql stable set search_path = '' as $$
  select ((p_day + 1)::timestamp + interval '3 hours') at time zone 'America/Los_Angeles'
       - interval '1 day';
$$;

revoke all on function public.puzzle_today() from public;
revoke all on function public.puzzle_day_started(date) from public;
grant execute on function public.puzzle_today() to authenticated, anon;
grant execute on function public.puzzle_day_started(date) to authenticated, anon;

-- The four places that had the rule written out ------------------------------------------------

drop policy if exists daily_puzzles_read on public.daily_puzzles;
create policy daily_puzzles_read on public.daily_puzzles
  for select to authenticated
  using (publish_on <= public.puzzle_today());

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

create or replace function public.puzzle_answer(p_puzzle_id uuid)
returns text[]
language sql security definer set search_path = public stable as $$
  select a.themes
    from public.daily_puzzle_answers a
    join public.daily_puzzles d on d.id = a.puzzle_id
   where a.puzzle_id = p_puzzle_id
     and auth.uid() is not null
     and d.publish_on < public.puzzle_today();
$$;

drop function if exists public.admin_puzzle_list(integer);
create or replace function public.admin_puzzle_list(p_limit integer default 60)
returns table (
  id uuid, publish_on date, theme_count integer, card_count integer,
  rows integer, cols integer, hint text, source_binder_id uuid, source_page_id uuid,
  binder_is_public boolean, plays bigint, correct bigint, published boolean
)
language sql stable security definer set search_path = '' as $$
  select d.id, d.publish_on, d.theme_count, cardinality(d.card_ids)::integer,
         d.rows, d.cols, d.hint, d.source_binder_id, d.source_page_id,
         coalesce(b.is_public, false),
         (select count(*) from public.puzzle_plays p where p.puzzle_id = d.id),
         (select count(*) from public.puzzle_plays p where p.puzzle_id = d.id and p.correct),
         d.publish_on <= public.puzzle_today()
    from public.daily_puzzles d
    left join public.binders b on b.id = d.source_binder_id
   where public.is_admin()
   order by d.publish_on desc
   limit least(greatest(p_limit, 0), 200);
$$;

revoke all on function public.admin_puzzle_list(integer) from public;
grant execute on function public.admin_puzzle_list(integer) to authenticated;

comment on function public.puzzle_today() is
  'Today as the puzzle counts it: the America/Los_Angeles date shifted back 3 hours, so the day '
  'turns over at 03:00 Pacific all year. The single definition of the puzzle day.';
