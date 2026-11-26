-- MIC-083 (owner, 2026-11-26: "please inspect and fix some of these in the studio report. i think
-- it's gone astray somewhere."). Read-only admin functions; nothing here writes data.
--
-- 1. COMMUNITY GROWTH COUNTED OURS OUT TWICE. Since 20261004 refresh_community_stats() leaves test
--    accounts out of community_stats_daily (and since 20261024 that set includes admins), but
--    admin_community_growth still subtracted "ours" from those totals, and greatest(0, ...) hid the
--    negative: Cards placed showed 0 (true 9,823), Pages 330 (true 2,196), Binders 264 (true 415).
--    Personas were counted as community. The chart now recounts every day straight from the
--    tables with ONE exclusion set, the same on every day whatever the daily table did then:
--    ours (test_account_ids(), admins), seeded personas, and guests. A binder counts once its owner
--    has a username (the refresh's rule); a collector counts from their first such binder.
--    Same signature and columns, so Studio and database.ts are unchanged. is_backfilled is false.
--
-- 2. WHERE SESSIONS ENDED says which page. "page leave" now carries the route it left from (it
--    is in the event's props), and a /binder/<id> route reads as the binder's title. Same columns:
--    last_route holds that readable place for page.view and page.leave.
begin;

create or replace function public.admin_community_growth(p_days int default 30)
returns table (
  day date,
  collectors bigint,
  binders_built bigint,
  pages_built bigint,
  cards_placed bigint,
  artwork_placed bigint,
  is_backfilled boolean,
  new_collectors bigint,
  new_binders bigint,
  new_pages bigint,
  new_cards bigint,
  new_artwork bigint
)
language sql
stable
security definer
set search_path = public
set timezone = 'UTC'
as $$
  with excluded as (
    select t as id from public.test_account_ids() t
    union select id from public.profiles where is_admin
    union select id from auth.users
      where coalesce(is_anonymous, false) or coalesce(raw_user_meta_data ->> 'seeded_persona', '') = 'true'
  ),
  b as (
    select b.id, b.owner_id, b.created_at
    from public.binders b
    join public.profiles p on p.id = b.owner_id
    where p.username is not null
      and not exists (select 1 from excluded x where x.id = b.owner_id)
  ),
  firsts as (select owner_id, min(created_at) as first_at from b group by owner_id),
  pg as (select bp.created_at from public.binder_pages bp join b on b.id = bp.binder_id),
  sl as (
    select bs.slot_type, bs.created_at
    from public.binder_slots bs join public.binder_pages bp on bp.id = bs.page_id join b on b.id = bp.binder_id
  ),
  days as (
    select g::date as day
    from generate_series(current_date - greatest(1, least(p_days, 3650)), current_date, interval '1 day') g
  ),
  totals as (
    select d.day,
      (select count(*) from firsts f where f.first_at::date <= d.day) as collectors,
      (select count(*) from b where b.created_at::date <= d.day) as binders_built,
      (select count(*) from pg where pg.created_at::date <= d.day) as pages_built,
      (select count(*) from sl where sl.created_at::date <= d.day and sl.slot_type = 'card') as cards_placed,
      (select count(*) from sl where sl.created_at::date <= d.day and sl.slot_type = 'artwork') as artwork_placed
    from days d
    where public.is_admin()
  ),
  with_lag as (
    select t.*,
      t.collectors     - lag(t.collectors)     over (order by t.day) as new_collectors,
      t.binders_built  - lag(t.binders_built)  over (order by t.day) as new_binders,
      t.pages_built    - lag(t.pages_built)    over (order by t.day) as new_pages,
      t.cards_placed   - lag(t.cards_placed)   over (order by t.day) as new_cards,
      t.artwork_placed - lag(t.artwork_placed) over (order by t.day) as new_artwork
    from totals t
  )
  -- One extra day is counted so the first shown day has its "new" too; it is dropped here.
  select w.day, w.collectors, w.binders_built, w.pages_built, w.cards_placed, w.artwork_placed,
         false as is_backfilled,
         w.new_collectors, w.new_binders, w.new_pages, w.new_cards, w.new_artwork
  from with_lag w
  where w.day > current_date - greatest(1, least(p_days, 3650))
  order by w.day;
$$;
revoke all on function public.admin_community_growth(int) from public;
revoke execute on function public.admin_community_growth(int) from anon;
grant execute on function public.admin_community_growth(int) to authenticated;

create or replace function public.admin_dropoffs(p_app text, p_days integer default 7)
returns table (
  last_event text, last_route text,
  sessions integer, median_events double precision, last_at timestamptz
)
language sql stable security definer set search_path = public as $$
  with s as (
    select s.id
    from public.analytics_sessions s
    where s.app = p_app
      and s.started_at >= now() - make_interval(days => greatest(1, least(p_days, 90)))
      and not exists (select 1 from public.test_account_ids() t where t = s.user_id)
      and not exists (select 1 from public.profiles p where p.id = s.user_id and p.is_admin)
      and not exists (select 1 from auth.users u where u.id = s.user_id and u.is_anonymous)
  ),
  last_ev as (
    select distinct on (e.session_id) e.session_id, e.name, e.props->>'route' as route, e.ts
    from public.analytics_events e
    join s on s.id = e.session_id
    order by e.session_id, e.ts desc
  ),
  cnt as (
    select e.session_id, count(*) as n
    from public.analytics_events e
    join s on s.id = e.session_id
    group by e.session_id
  ),
  named as (
    select l.session_id, l.name, l.ts,
      case
        when l.name not in ('page.view', 'page.leave') or l.route is null then null
        when l.route = '/' then 'home'
        when l.route ~ '^/binder/[0-9a-fA-F-]{36}' then
          coalesce('binder “' || (select bb.title from public.binders bb where bb.id::text = substring(l.route from '^/binder/([0-9a-fA-F-]{36})')) || '”', 'a binder since deleted')
        else l.route
      end as place
    from last_ev l
  )
  select n.name as last_event,
         n.place as last_route,
         count(*)::int as sessions,
         percentile_cont(0.5) within group (order by c.n) as median_events,
         max(n.ts) as last_at
  from named n
  join cnt c on c.session_id = n.session_id
  where public.is_admin()
  group by 1, 2
  order by 3 desc, 5 desc
  limit 25;
$$;
revoke all on function public.admin_dropoffs(text, integer) from public;
revoke execute on function public.admin_dropoffs(text, integer) from anon;
grant execute on function public.admin_dropoffs(text, integer) to authenticated;

commit;
