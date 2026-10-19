-- The Studio user list has been empty since 2026-10-04. Not "no data": a timeout.
--
-- WHAT WAS WRONG (found 2026-10-18 from analytics-studio). 20261004120000 made every aggregate
-- call is_test_account(e.user_id) once PER EVENT ROW. Each call runs two subqueries, and the
-- second one scans analytics_events for that user's props->>'surface', which has no index. Over
-- 46k michi rows that is 46k scans, far past the 8s statement_timeout the authenticated role
-- carries. PostgREST returned an error, studio.tsx turned the error into an empty array, and the
-- page said "No activity recorded for this app yet." for two weeks. Measured from outside: the
-- RPC body times out; the same list with the test-account set computed once returns 2,081
-- users in 0.7s.
--
-- THE FIX. The set of test accounts is a property of the database, not of the row, so compute it
-- once per statement: test_account_ids() returns the set, and the two aggregates filter against
-- it with NOT EXISTS (same truth table as the old predicate, including user_id null). A partial
-- index makes the qa-rig clause an index probe, so is_test_account() itself also becomes cheap
-- for the callers that keep it (refresh_community_stats, which runs over binders, not events).
-- Same definition of "test account" as before, in one place: is_test_account() is rewritten to
-- read the set, so the two cannot drift.

create index if not exists analytics_events_qa_rig_user_idx
  on public.analytics_events (user_id)
  where props->>'surface' = 'qa-rig';

create or replace function public.test_account_ids()
returns setof uuid
language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u where lower(u.email) like '%@example.com'
  union
  select e.user_id from public.analytics_events e
   where e.props->>'surface' = 'qa-rig' and e.user_id is not null;
$$;
revoke all on function public.test_account_ids() from public;
grant execute on function public.test_account_ids() to authenticated;
comment on function public.test_account_ids() is
  'Every account the stats exclude: example.com addresses and anything the qa-rig touched. '
  'Computed once per statement; filter with NOT EXISTS, never call a per-row predicate over events.';

create or replace function public.is_test_account(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.test_account_ids() t where t = p_user_id);
$$;

create or replace function public.admin_event_funnel(p_app text default null)
returns table (name text, event_count bigint, user_count bigint)
language sql stable security definer set search_path = public as $$
  select e.name, count(*) as event_count, count(distinct e.user_id) as user_count
  from public.analytics_events e
  where public.is_admin()
    and (p_app is null or e.app = p_app)
    and not exists (select 1 from public.test_account_ids() t where t = e.user_id)
  group by e.name
  order by count(*) desc;
$$;

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
  group by e.user_id, pr.username, pr.display_name
  order by max(e.ts) desc
  limit greatest(1, least(p_limit, 1000));
$$;
