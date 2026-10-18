-- admin_puzzle_calendar: every scheduled puzzle, with its answer words and its page title, for the
-- Studio's month calendar.
--
-- WHY A NEW FUNCTION. admin_puzzle_list returns a window of recent rows (200 at most) and keeps the
-- answer out of each row; the Studio read it back one puzzle at a time through admin_puzzle_themes
-- when the owner asked. A calendar shows a year at once with the themes written on each day
-- (owner, 2026-10-18: "a calendar with themes on the calendar cell"), so this returns the whole
-- schedule in one call, answer words included, plus the source page's title, which carries the
-- holiday name the scheduler writes ("2026-12-25 · Christmas"). Admin only, like the others;
-- nothing a player can call reads daily_puzzle_answers.

create or replace function public.admin_puzzle_calendar()
returns table (
  id uuid, publish_on date, themes text[], card_count integer,
  rows integer, cols integer, hint text, source_binder_id uuid, source_page_id uuid,
  page_title text, binder_is_public boolean, plays bigint, correct bigint, published boolean
)
language sql stable security definer set search_path = '' as $$
  select d.id, d.publish_on, coalesce(a.themes, '{}'::text[]), cardinality(d.card_ids)::integer,
         d.rows, d.cols, d.hint, d.source_binder_id, d.source_page_id,
         pg.title,
         coalesce(b.is_public, false),
         (select count(*) from public.puzzle_plays p where p.puzzle_id = d.id),
         (select count(*) from public.puzzle_plays p where p.puzzle_id = d.id and p.correct),
         d.publish_on <= public.puzzle_today()
    from public.daily_puzzles d
    left join public.daily_puzzle_answers a on a.puzzle_id = d.id
    left join public.binders b on b.id = d.source_binder_id
    left join public.binder_pages pg on pg.id = d.source_page_id
   where public.is_admin()
   order by d.publish_on;
$$;

revoke all on function public.admin_puzzle_calendar() from public;
grant execute on function public.admin_puzzle_calendar() to authenticated;
