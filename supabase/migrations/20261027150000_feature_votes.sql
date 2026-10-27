-- FEATURE VOTES: "what should we build next", one click per idea (owner, 2026-10-27: "a page asking
-- users what features they would like to see next ... premade buttons for them to vote on via
-- single click, and also a freeform text box"). The free text goes through feedback_responses as
-- its own survey; THIS table is the clicks.
--
-- One row per (app, voter, idea). A second click deletes the row, so a vote is a toggle and the
-- count is a count of rows. The ideas themselves live in the app (src/data/featureVotes.ts), not
-- here: a new idea is a one-line change and the FORMAT check on `feature` is the only vocabulary
-- the server enforces, the same reasoning as feedback_responses.app.
--
-- WRITES: any caller with a session, guests included (the app signs them in anonymously). Capped
-- at 24 votes per app per voter, inside the policy, so the only way to pile on is to make
-- accounts. READS: a voter sees their own rows (so the page can light the ideas they chose), and
-- everybody sees the TALLY through feature_vote_counts(), a security-definer RPC that returns
-- counts only, never who voted.

create table if not exists public.feature_votes (
  app text not null check (app ~ '^[a-z][a-z0-9_-]{1,31}$'),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  feature text not null check (feature ~ '^[a-z][a-z0-9_-]{1,63}$'),
  created_at timestamptz not null default now(),
  primary key (app, user_id, feature)
);

comment on table public.feature_votes is
  'One row per (app, voter, idea): a click on the what-next page. Toggle by insert/delete. Tally through feature_vote_counts(). Ideas are defined in the app. See docs/FEEDBACK.md.';

create index if not exists feature_votes_app_feature_idx on public.feature_votes (app, feature);

-- The cap, as a security-definer count so it cannot be skipped and does not recurse through RLS.
create or replace function public.feature_votes_quota_left(p_app text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select count(*) < 24
  from public.feature_votes v
  where v.user_id = (select auth.uid())
    and v.app = p_app;
$$;

revoke all on function public.feature_votes_quota_left(text) from public;
grant execute on function public.feature_votes_quota_left(text) to authenticated;

alter table public.feature_votes enable row level security;

drop policy if exists "Voters see their own votes" on public.feature_votes;
create policy "Voters see their own votes"
  on public.feature_votes for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Anyone with a session can vote" on public.feature_votes;
create policy "Anyone with a session can vote"
  on public.feature_votes for insert
  to authenticated
  with check ((select auth.uid()) = user_id and public.feature_votes_quota_left(app));

drop policy if exists "Voters can take a vote back" on public.feature_votes;
create policy "Voters can take a vote back"
  on public.feature_votes for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, delete on public.feature_votes to authenticated;

-- The tally everybody sees. Counts only; no voter leaves this function.
create or replace function public.feature_vote_counts(p_app text)
returns table (feature text, votes bigint)
language sql
stable
security definer
set search_path = public
as $$
  select v.feature, count(*)::bigint
  from public.feature_votes v
  where v.app = p_app
  group by v.feature;
$$;

comment on function public.feature_vote_counts(text) is
  'Votes per idea for one app, for the what-next page. Counts only, readable by anyone.';

revoke all on function public.feature_vote_counts(text) from public;
grant execute on function public.feature_vote_counts(text) to anon, authenticated;
