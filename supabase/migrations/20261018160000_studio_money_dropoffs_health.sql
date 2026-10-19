-- Three more reads for /studio (owner ask, 2026-10-18): the money ledger, where sessions end,
-- and a health row. All three are admin-gated SECURITY DEFINER reads over tables that already
-- exist; nothing here writes. Test accounts (test_account_ids) and admin accounts are left out
-- of money and drop-offs, the same way the analytics studio's morning email leaves "ours" out.

-- ---------------------------------------------------------------------------------------------
-- Money. One row per ledger entry, two kinds: an entitlements row (Stripe, Apple, a grant) and
-- a free-trial row (pro_trials / tcgscan_pro_trials). The client groups them: the same person
-- often has a Stripe trial AND a free-days row from the one checkout, and those are one line.
-- The 'trial' source on entitlements is the pre-Stripe trial grant; the trial tables are the
-- truth for it, so those entitlement rows are skipped here to avoid counting a trial twice.
create or replace function public.admin_money_ledger()
returns table (
  kind text, app text, user_id uuid, username text,
  product text, source text, granted_at timestamptz, expires_at timestamptz,
  "interval" text, unit_amount_minor integer, currency text, cancelled_at timestamptz
)
language sql stable security definer set search_path = public as $$
  with ours as (
    select t as id from public.test_account_ids() t
    union select id from public.profiles where is_admin
  )
  select 'entitlement'::text as kind,
         case when e.product like 'tcgscan_%' then 'tcgscan' else 'michi' end as app,
         e.user_id, pr.username, e.product, e.source, e.granted_at, e.expires_at,
         e."interval", e.unit_amount_minor, e.currency, e.cancelled_at
  from public.entitlements e
  left join public.profiles pr on pr.id = e.user_id
  where public.is_admin()
    and coalesce(e.source, '') <> 'trial'
    and not exists (select 1 from ours o where o.id = e.user_id)
  union all
  select 'free_trial', 'michi', t.user_id, pr.username, 'tier_pro', 'trial', t.started_at, t.expires_at,
         null, null, null, null
  from public.pro_trials t
  left join public.profiles pr on pr.id = t.user_id
  where public.is_admin()
    and not exists (select 1 from ours o where o.id = t.user_id)
  union all
  select 'free_trial', 'tcgscan', t.user_id, pr.username, 'tcgscan_pro', 'trial', t.started_at, t.expires_at,
         null, null, null, null
  from public.tcgscan_pro_trials t
  left join public.profiles pr on pr.id = t.user_id
  where public.is_admin()
    and not exists (select 1 from ours o where o.id = t.user_id);
$$;
revoke all on function public.admin_money_ledger() from public;
-- Default privileges on this schema grant execute to anon; the revoke from public does not undo that.
revoke execute on function public.admin_money_ledger() from anon;
grant execute on function public.admin_money_ledger() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Where sessions end. For every session started in the window, the LAST event it recorded
-- (name, and the route when it was a page view), grouped. A session with no event at all is
-- not here: it never produced a session.start, so there is nothing to end on. "session.start"
-- as the last event means the app was opened and nothing else happened.
create or replace function public.admin_dropoffs(p_app text, p_days integer default 7)
returns table (
  last_event text, last_route text,
  sessions integer, guest_sessions integer, median_events double precision, last_at timestamptz
)
language sql stable security definer set search_path = public as $$
  with s as (
    select s.id, s.is_guest
    from public.analytics_sessions s
    where s.app = p_app
      and s.started_at >= now() - make_interval(days => greatest(1, least(p_days, 90)))
      and not exists (select 1 from public.test_account_ids() t where t = s.user_id)
      and not exists (select 1 from public.profiles p where p.id = s.user_id and p.is_admin)
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
         count(*) filter (where s.is_guest)::int as guest_sessions,
         percentile_cont(0.5) within group (order by c.n) as median_events,
         max(l.ts) as last_at
  from last_ev l
  join s on s.id = l.session_id
  join cnt c on c.session_id = l.session_id
  where public.is_admin()
  group by 1, 2
  order by 3 desc, 6 desc
  limit 25;
$$;
revoke all on function public.admin_dropoffs(text, integer) from public;
-- Default privileges on this schema grant execute to anon; the revoke from public does not undo that.
revoke execute on function public.admin_dropoffs(text, integer) from anon;
grant execute on function public.admin_dropoffs(text, integer) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Health. One row per signal: when it last happened, and a detail. The client decides what is
-- stale; the thresholds are a reading decision, not a database fact. A null `at` means the
-- signal has never fired or has nothing scheduled, and the detail says which.
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
           (select max(ts) from public.analytics_events where app = 'michi'),
           (select count(*)::text || ' sessions in the last 24h' from public.analytics_sessions where app = 'michi' and started_at >= now() - interval '24 hours')
    union all
    select 'TCGScan event recorded',
           (select max(ts) from public.analytics_events where app = 'tcgscan'),
           (select count(*)::text || ' sessions in the last 24h' from public.analytics_sessions where app = 'tcgscan' and started_at >= now() - interval '24 hours')
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
-- Default privileges on this schema grant execute to anon; the revoke from public does not undo that.
revoke execute on function public.admin_health() from anon;
grant execute on function public.admin_health() to authenticated;
