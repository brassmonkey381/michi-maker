-- /studio counts people, not guests, and not us (owner ask, 2026-10-19).
--
-- Three reads on /studio let guest traffic in, and one let our own accounts in:
--   - admin_recent_users listed anonymous (guest) auth users beside real accounts;
--   - admin_dropoffs counted guest sessions, with a guest column beside the number;
--   - admin_health's "event recorded" signals fired on a guest opening the site;
--   - admin_community_growth read the public totals as they are, which include every binder the
--     owner and the QA accounts built (the daily-puzzle binders among them).
--
-- A GUEST here is an anonymous auth user (auth.users.is_anonymous), not analytics_sessions.is_guest.
-- The session flag is set when the session starts; a guest who signs in during the session keeps
-- the flag while their events carry the real account. Those are people and stay in.
--
-- OURS is test_account_ids() (example.com addresses, anything the qa-rig touched) plus every
-- profile with is_admin, the same set the money ledger and drop-offs already use.
--
-- All four stay admin-gated SECURITY DEFINER reads. Nothing here writes.

-- ---------------------------------------------------------------------------------------------
-- User list: accounts only. Same signature, so studio.tsx and database.ts are unchanged.
create or replace function public.admin_recent_users(p_app text default null, p_limit int default 200)
returns table (
  user_id uuid, username text, display_name text,
  event_count bigint, session_count bigint, first_seen timestamptz, last_seen timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    e.user_id, pr.username, pr.display_name,
    count(*) as event_count, count(distinct e.session_id) as session_count,
    min(e.ts) as first_seen, max(e.ts) as last_seen
  from public.analytics_events e
  left join public.profiles pr on pr.id = e.user_id
  where public.is_admin()
    and (p_app is null or e.app = p_app)
    and not exists (select 1 from public.test_account_ids() t where t = e.user_id)
    and not exists (select 1 from auth.users u where u.id = e.user_id and u.is_anonymous)
  group by e.user_id, pr.username, pr.display_name
  order by max(e.ts) desc
  limit greatest(1, least(p_limit, 1000));
$$;
revoke all on function public.admin_recent_users(text, int) from public;
revoke execute on function public.admin_recent_users(text, int) from anon;
grant execute on function public.admin_recent_users(text, int) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Where sessions end: sessions of signed-in people only. The guest_sessions column goes, because
-- a column that is always zero is a question the page cannot answer; the return type changes, so
-- the function is dropped first. studioOps.ts and database.ts drop the column in the same change.
drop function if exists public.admin_dropoffs(text, integer);
create function public.admin_dropoffs(p_app text, p_days integer default 7)
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
  )
  select l.name as last_event,
         case when l.name = 'page.view' then l.route else null end as last_route,
         count(*)::int as sessions,
         percentile_cont(0.5) within group (order by c.n) as median_events,
         max(l.ts) as last_at
  from last_ev l
  join cnt c on c.session_id = l.session_id
  where public.is_admin()
  group by 1, 2
  order by 3 desc, 5 desc
  limit 25;
$$;
revoke all on function public.admin_dropoffs(text, integer) from public;
revoke execute on function public.admin_dropoffs(text, integer) from anon;
grant execute on function public.admin_dropoffs(text, integer) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Health: the two "event recorded" signals mean a signed-in person did something. A guest landing
-- on the site is not a sign the product is alive to anyone. Same eight rows, same shape.
create or replace function public.admin_health()
returns table (signal text, at timestamptz, detail text)
language sql stable security definer set search_path = public as $$
  select * from (
    select 'Stripe webhook wrote' as signal,
           (select max(granted_at) from public.entitlements where source = 'stripe') as at,
           (select count(*)::text || ' Stripe rows all-time' from public.entitlements where source = 'stripe') as detail
    union all
    select 'RevenueCat webhook wrote',
           (select max(granted_at) from public.entitlements where source in ('apple', 'google')),
           (select count(*)::text || ' Apple/Google rows all-time' from public.entitlements where source in ('apple', 'google'))
    union all
    select 'Free trial started',
           (select max(started_at) from public.pro_trials),
           (select count(*)::text || ' trials all-time' from public.pro_trials)
    union all
    select 'Account created',
           (select max(created_at) from auth.users where not coalesce(is_anonymous, false)),
           (select count(*)::text || ' accounts, guests not counted' from auth.users where not coalesce(is_anonymous, false))
    union all
    select 'Michi event recorded',
           (select e.ts from public.analytics_events e
             where e.app = 'michi'
               and not exists (select 1 from auth.users u where u.id = e.user_id and u.is_anonymous)
             order by e.ts desc limit 1),
           (select count(*)::text || ' signed-in sessions in the last 24h, guests not counted'
              from public.analytics_sessions s
             where s.app = 'michi' and s.started_at >= now() - interval '24 hours'
               and not exists (select 1 from auth.users u where u.id = s.user_id and u.is_anonymous))
    union all
    select 'TCGScan event recorded',
           (select e.ts from public.analytics_events e
             where e.app = 'tcgscan'
               and not exists (select 1 from auth.users u where u.id = e.user_id and u.is_anonymous)
             order by e.ts desc limit 1),
           (select count(*)::text || ' signed-in sessions in the last 24h, guests not counted'
              from public.analytics_sessions s
             where s.app = 'tcgscan' and s.started_at >= now() - interval '24 hours'
               and not exists (select 1 from auth.users u where u.id = s.user_id and u.is_anonymous))
    union all
    select 'Daily puzzle scheduled through',
           (select max(publish_on)::timestamptz from public.daily_puzzles),
           case when (select max(publish_on) from public.daily_puzzles) is null then 'no puzzle has ever been published'
                else (select count(*)::text || ' puzzle day(s) still ahead' from public.daily_puzzles where publish_on > current_date) end
    union all
    select 'Content report filed',
           (select max(created_at) from public.content_reports),
           (select count(*) filter (where status = 'open')::text || ' open' from public.content_reports)
  ) x
  where public.is_admin();
$$;
revoke all on function public.admin_health() from public;
revoke execute on function public.admin_health() from anon;
grant execute on function public.admin_health() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Community growth without us. community_stats_daily holds the PUBLIC totals (the landing band's
-- numbers, which still count every binder, ours included; that is the landing page's decision, not
-- this one). For the studio, each day's totals have our own contribution taken back out, counted
-- the way backfill_community_stats_daily() counts: from the created_at of rows that still exist.
-- So the subtraction is a floor on what we added, which makes the result a CEILING on the
-- community's real totals; anything of ours deleted since cannot be subtracted. Same timezone
-- rule as the backfill (UTC days) so a binder lands on the same day in both counts.
-- Same shape as before: the panel and communityGrowth.ts are unchanged.
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
  with ours as (
    select t as id from public.test_account_ids() t
    union select id from public.profiles where is_admin
  ),
  -- Same eligibility as refresh_community_stats(): a binder counts once its owner has a username.
  our_binders as (
    select b.id, b.owner_id, b.created_at
    from public.binders b
    join ours o on o.id = b.owner_id
    join public.profiles p on p.id = b.owner_id
    where p.username is not null
  ),
  our_pages as (
    select bp.id, bp.created_at
    from public.binder_pages bp
    join our_binders ob on ob.id = bp.binder_id
  ),
  our_slots as (
    select bs.id, bs.slot_type, bs.created_at
    from public.binder_slots bs
    join our_pages op on op.id = bs.page_id
  ),
  windowed as (
    select
      d.day,
      d.is_backfilled,
      greatest(0, d.collectors
        - (select count(distinct ob.owner_id) from our_binders ob where ob.created_at::date <= d.day)) as collectors,
      greatest(0, d.binders_built
        - (select count(*) from our_binders ob where ob.created_at::date <= d.day)) as binders_built,
      greatest(0, d.pages_built
        - (select count(*) from our_pages op where op.created_at::date <= d.day)) as pages_built,
      greatest(0, d.cards_placed
        - (select count(*) from our_slots os where os.created_at::date <= d.day and os.slot_type = 'card')) as cards_placed,
      greatest(0, d.artwork_placed
        - (select count(*) from our_slots os where os.created_at::date <= d.day and os.slot_type = 'artwork')) as artwork_placed
    from public.community_stats_daily d
    where public.is_admin()
      and d.day > current_date - greatest(1, least(p_days, 3650))
  )
  select
    w.day,
    w.collectors, w.binders_built, w.pages_built, w.cards_placed, w.artwork_placed,
    w.is_backfilled,
    w.collectors     - lag(w.collectors)     over (order by w.day),
    w.binders_built  - lag(w.binders_built)  over (order by w.day),
    w.pages_built    - lag(w.pages_built)    over (order by w.day),
    w.cards_placed   - lag(w.cards_placed)   over (order by w.day),
    w.artwork_placed - lag(w.artwork_placed) over (order by w.day)
  from windowed w
  order by w.day;
$$;
revoke all on function public.admin_community_growth(int) from public;
revoke execute on function public.admin_community_growth(int) from anon;
grant execute on function public.admin_community_growth(int) to authenticated;
