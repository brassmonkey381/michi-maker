-- /studio: admin accounts are ours, so they are test accounts too (owner, 2026-10-24).
--
-- @fakemichi, the QA account used to drive the app by hand, topped both /studio user lists.
-- It is not an example.com address and the qa-rig never touched it, so test_account_ids()
-- (20261018150000) did not contain it; what it IS is profiles.is_admin. The community-growth
-- strip already defines "ours" as test_account_ids() UNION the admin profiles
-- (20261019120000); this makes the set itself say the same thing, so the user list, the
-- drop-offs, the funnel and the health signals all exclude the same accounts as the growth strip,
-- and nothing can drift between them.
--
-- Applying it also showed @qa_playwright, @testaccount123 and @tester123 outside the set: QA
-- signups whose addresses the analytics studio already excludes by pattern. The same patterns
-- are added here, so a QA account is a QA account in both tools.
--
-- Same signature, so every caller (is_test_account, admin_recent_users, admin_dropoffs,
-- admin_event_funnel, admin_health, admin_community_growth, refresh_community_stats) picks it
-- up unchanged. The public landing band (community_stats_daily) is refreshed by
-- refresh_community_stats(), which reads is_test_account(): from its next run the admin
-- accounts' binders leave the public totals too. That is the intent: a QA account's 74 binders
-- are not community output.

create or replace function public.test_account_ids()
returns setof uuid
language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u where lower(u.email) like '%@example.com'
  union
  select e.user_id from public.analytics_events e
   where e.props->>'surface' = 'qa-rig' and e.user_id is not null
  union
  select p.id from public.profiles p where p.is_admin
  union
  -- The analytics studio's email shapes for QA and test signups (config/exclusions.json there,
  -- global + michi-maker), so the two tools exclude the same people. Patterns only: an exact
  -- address never belongs in a committed migration.
  select u.id from auth.users u where u.email ilike any (array[
    '%@example.com', '%@example.org', '%.invalid', '%@%.invalid', '%@%.test',
    '%test%@%', '%+test@%', '%qa@%', '%playwright%@%', '%e2e%@%', '%automation%@%',
    '%claude-test%@%', 'bstockman1+%@%', '%@michi-maker.com', '%@tcgscan.com']);
$$;
revoke all on function public.test_account_ids() from public;
revoke execute on function public.test_account_ids() from anon;
grant execute on function public.test_account_ids() to authenticated;
comment on function public.test_account_ids() is
  'Every account the stats exclude: QA/test email shapes (the analytics studio list), anything the '
  'qa-rig touched, and admin profiles (ours). Computed once per statement; filter with NOT EXISTS, never call a per-row '
  'predicate over events.';
