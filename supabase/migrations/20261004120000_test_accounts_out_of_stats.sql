-- Test accounts stop counting.
--
-- WHAT WAS WRONG (found 2026-10-04). Reading the trial funnel showed 34 trials and 0 conversions.
-- Eight of the eleven "trialists who built nothing" were qa-rig-* fixtures from a test run on
-- 09-21, and the one "customer who tried to pay four times and could not" was abctest on an
-- example.com address exercising checkout the evening it changed. The real trial count was 25,
-- the real no-binder count was 2, and the lost sale did not exist. Every aggregate Studio shows
-- had the same accounts in it.
--
-- ONE PREDICATE, used by every aggregate, so the definition of a test account cannot drift
-- between the funnel, the user list and the public collector count. It is deliberately broad on
-- the email side: example.com is reserved for exactly this and no real person has an address
-- there. The event-side clause catches a rig that signs up with some other domain.
--
-- FILTERED, NOT DELETED. The rig in tcgscan-app and the checkout tests here may reuse these
-- accounts, and deleting them under a running test is a worse outcome than counting them wrong.
-- Per-user views (admin_user_journey) are untouched on purpose: reading one account at a time is
-- how a test gets debugged.

create or replace function public.is_test_account(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
           select 1 from auth.users u
            where u.id = p_user_id and lower(u.email) like '%@example.com'
         )
      or exists (
           select 1 from public.analytics_events e
            where e.user_id = p_user_id and e.props->>'surface' = 'qa-rig'
         );
$$;
revoke all on function public.is_test_account(uuid) from public;
grant execute on function public.is_test_account(uuid) to authenticated;
comment on function public.is_test_account(uuid) is
  'An account that exists to test the product: an example.com address, or one the QA rig has driven. '
  'Excluded from every aggregate; never deleted by this.';

create or replace function public.admin_event_funnel(p_app text default null)
returns table (name text, event_count bigint, user_count bigint)
language sql stable security definer set search_path = public as $$
  select e.name, count(*) as event_count, count(distinct e.user_id) as user_count
  from public.analytics_events e
  where public.is_admin()
    and (p_app is null or e.app = p_app)
    and not public.is_test_account(e.user_id)
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
    and not public.is_test_account(e.user_id)
  group by e.user_id, pr.username, pr.display_name
  order by max(e.ts) desc
  limit greatest(1, least(p_limit, 1000));
$$;

-- The public "N collectors, N binders" numbers on the site. Same predicate, on the binder owner.
create or replace function public.refresh_community_stats()
returns public.community_stats
language sql security definer set search_path = public, pg_temp as $$
  with binder_summary as (
    select
      b.id as binder_id, b.owner_id,
      count(distinct bp.id) as n_pages,
      count(bs.id) filter (where bs.slot_type = 'card') as n_cards,
      count(bs.id) filter (where bs.slot_type = 'artwork') as n_artwork
    from binders b
    left join profiles p on b.owner_id = p.id
    left join binder_pages bp on bp.binder_id = b.id
    left join binder_slots bs on bs.page_id = bp.id
    where p.username is not null
      and not public.is_test_account(b.owner_id)
    group by b.id, b.owner_id
  )
  insert into public.community_stats as cs (
    id, collectors, binders_built, pages_built, cards_placed, artwork_placed, computed_at
  )
  select true, count(distinct owner_id), count(distinct binder_id),
         coalesce(sum(n_pages), 0), coalesce(sum(n_cards), 0), coalesce(sum(n_artwork), 0), now()
  from binder_summary
  on conflict (id) do update set
    collectors = excluded.collectors, binders_built = excluded.binders_built,
    pages_built = excluded.pages_built, cards_placed = excluded.cards_placed,
    artwork_placed = excluded.artwork_placed, computed_at = excluded.computed_at
  returning cs.*;
$$;
