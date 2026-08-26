-- tcgscan-michi-maker: the moderation kit. Takedowns that work, reports that get seen, and a
-- rights attestation that leaves a record.
--
-- WHY NOW. The art-provenance gate is being loosened (external-origin art may appear in public
-- binders, see docs/roadmap/ART-RIGHTS.md) and binders are moving toward public-by-default. Both
-- lean harder on DMCA 512(c) safe harbor, and safe harbor is not the registered agent alone: it
-- is the agent PLUS expeditious takedown on notice PLUS a repeat-infringer policy that actually
-- operates. Before this migration, reports landed in a table nobody was notified about, removal
-- meant hand-written service-role SQL, and the share-time rights attestation lived only in React
-- state. This file closes those gaps:
--
--   1. binders.removed_at        - a takedown flag every public read path honours.
--   2. admin report access       - /studio can list and resolve content_reports (is_admin gated).
--   3. admin_remove_binder(...)  - actioning a notice is one call, not SQL.
--   4. subject_owner_id          - reports remember whose content they were about, so repeat
--                                  infringers can be counted even after the binder is deleted.
--   5. content_reports.profile_id- profiles (bio, avatar) become reportable, not just binders.
--   6. profiles.rights_attested_at / rights_prompt_at - the account-level rights attestation and
--                                  when it was last offered. Written by the client at accept time,
--                                  readable evidence that the user affirmed rights before sharing.
--   7. a guarded pg_cron job that pings Discord when new reports arrive (pg_net + Vault, same
--      pattern as the scan-storage janitor: inert until both exist, never blocking).
--
-- RLS conventions match the repo: writes `to authenticated` with an ownership (here: admin)
-- predicate; UPDATE policies declare both USING and WITH CHECK.

-- ---------------------------------------------------------------------------
-- 1. The takedown flag
-- ---------------------------------------------------------------------------
-- Null = live. Set = hidden from every public surface while staying visible to its owner, who
-- needs to see what was removed to fix or contest it. Deliberately NOT a delete: a takedown is
-- reversible (counter-notice, mistaken report), and the owner keeps their own work.
alter table public.binders add column if not exists removed_at timestamptz;

create index if not exists binders_removed_at_idx on public.binders (removed_at)
  where removed_at is not null;

-- Public read policies grow `removed_at is null`. Owner policies are untouched.
drop policy if exists "Public binders are viewable by everyone" on public.binders;
create policy "Public binders are viewable by everyone"
  on public.binders for select to anon, authenticated
  using (
    is_public
    and removed_at is null
    and exists (
      select 1 from public.profiles p
      where p.id = binders.owner_id and coalesce(p.is_public, true)
    )
  );

drop policy if exists "Pages of public binders are viewable" on public.binder_pages;
create policy "Pages of public binders are viewable"
  on public.binder_pages for select to anon, authenticated
  using (
    binder_pages.is_public
    and exists (
      select 1 from public.binders b
      join public.profiles p on p.id = b.owner_id
      where b.id = binder_pages.binder_id
        and b.is_public and b.removed_at is null and coalesce(p.is_public, true)
    )
  );

drop policy if exists "Slots of public binders are viewable" on public.binder_slots;
create policy "Slots of public binders are viewable"
  on public.binder_slots for select to anon, authenticated
  using (
    exists (
      select 1 from public.binder_pages pg
      join public.binders b on b.id = pg.binder_id
      join public.profiles p on p.id = b.owner_id
      where pg.id = binder_slots.page_id
        and pg.is_public and b.is_public and b.removed_at is null
        and coalesce(p.is_public, true)
    )
  );

-- Liking a removed binder makes no sense either.
drop policy if exists "Real accounts can like public binders" on public.binder_likes;
create policy "Real accounts can like public binders"
  on public.binder_likes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.request_is_anonymous()) = false
    and exists (
      select 1 from public.binders b
      join public.profiles p on p.id = b.owner_id
      where b.id = binder_likes.binder_id
        and b.is_public
        and b.removed_at is null
        and coalesce(p.is_public, true)
        and b.owner_id <> (select auth.uid())
    )
  );

-- The five SECURITY DEFINER feeds re-check visibility themselves (DEFINER bypasses RLS), so each
-- gains the same predicate. Full recreations of the CURRENT definitions plus `removed_at is null`;
-- nothing else about them changes.
create or replace function public.featured_binders(p_limit integer default 12)
returns table(binder_id uuid, like_count bigint, author_name text)
language sql stable security definer set search_path = ''
as $$
  select l.binder_id, count(*) as like_count, max(p.username) as author_name
  from public.binder_likes l
  join public.binders b on b.id = l.binder_id
  join public.profiles p on p.id = b.owner_id
  where l.created_at >= now() - interval '3 days'
    and b.is_public
    and b.removed_at is null
    and coalesce(p.is_public, true)
  group by l.binder_id
  order by like_count desc, l.binder_id
  limit greatest(p_limit, 0);
$$;

create or replace function public.search_binders(p_query text default '', p_limit integer default 40)
returns table (binder_id uuid, like_count bigint, author_name text)
language sql stable security definer set search_path = ''
as $$
  select b.id as binder_id,
         (select count(*) from public.binder_likes l where l.binder_id = b.id) as like_count,
         p.username as author_name
  from public.binders b
  join public.profiles p on p.id = b.owner_id
  where b.is_public
    and b.removed_at is null
    and coalesce(p.is_public, true)
    and b.archived_at is null
    and coalesce(b.is_demo, false) = false
    and (
      coalesce(p_query, '') = ''
      or b.title ilike '%' || p_query || '%'
      or coalesce(b.description, '') ilike '%' || p_query || '%'
      or coalesce(p.username, '') ilike '%' || p_query || '%'
    )
  order by like_count desc, lower(coalesce(b.title, '')) asc, b.id
  limit greatest(p_limit, 0);
$$;

create or replace function public.contest_entry_feed(
  p_contest text,
  p_limit   integer default 60
)
returns table (
  binder_id   uuid,
  like_count  bigint,
  author_name text,
  category    text,
  entered_at  timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select e.binder_id,
         (select count(*) from public.binder_likes l where l.binder_id = e.binder_id) as like_count,
         p.username as author_name,
         e.category,
         e.created_at as entered_at
  from public.contest_entries e
  join public.binders b on b.id = e.binder_id
  join public.profiles p on p.id = b.owner_id
  where e.contest = p_contest
    and b.is_public
    and b.removed_at is null
    and coalesce(p.is_public, true)
    and b.archived_at is null
    and coalesce(b.is_demo, false) = false
  order by e.created_at desc, e.binder_id
  limit greatest(p_limit, 0);
$$;

create or replace function public.contest_leaderboard(
  p_contest text default 'first-annual-2026',
  p_category text default null,
  p_limit integer default 100
)
returns table (binder_id uuid, like_count bigint, author_name text, category text)
language sql stable security definer set search_path = ''
as $$
  select e.binder_id,
         (select count(*) from public.binder_likes l where l.binder_id = e.binder_id) as like_count,
         p.username as author_name,
         e.category
  from public.contest_entries e
  join public.binders b on b.id = e.binder_id
  join public.profiles p on p.id = b.owner_id
  where e.contest = p_contest
    and (p_category is null or e.category = p_category)
    and b.is_public
    and b.removed_at is null
    and coalesce(p.is_public, true)
    and b.archived_at is null
    and coalesce(b.is_demo, false) = false
  order by like_count desc, e.created_at asc, e.binder_id
  limit greatest(p_limit, 0);
$$;

create or replace function public.discover_binders(
  p_sort           text default 'recent',
  p_limit          integer default 40,
  p_contest        text default null,
  p_author         text default null,
  p_exclude_author text default null
)
returns table (
  binder_id      uuid,
  like_count     bigint,
  author_name    text,
  made_public_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select b.id as binder_id,
         (select count(*) from public.binder_likes l where l.binder_id = b.id) as like_count,
         p.username as author_name,
         coalesce(b.made_public_at, b.created_at) as made_public_at
  from public.binders b
  join public.profiles p on p.id = b.owner_id
  where b.is_public
    and b.removed_at is null
    and coalesce(p.is_public, true)
    and b.archived_at is null
    and coalesce(b.is_demo, false) = false
    and (
      p_contest is null
      or not exists (
        select 1 from public.contest_entries e
        where e.binder_id = b.id and e.contest = p_contest
      )
    )
    and (p_author is null or lower(p.username) = lower(p_author))
    and (p_exclude_author is null or lower(p.username) is distinct from lower(p_exclude_author))
  order by
    case when p_sort = 'likes'
      then (select count(*) from public.binder_likes l2 where l2.binder_id = b.id)
      else 0
    end desc,
    case when p_sort = 'likes'
      then null::timestamptz
      else coalesce(b.made_public_at, b.created_at)
    end desc nulls last,
    lower(coalesce(b.title, '')) asc,
    b.id
  limit greatest(p_limit, 0);
$$;

-- ---------------------------------------------------------------------------
-- 2. Reports: remember the subject, allow profile reports, let admins work them
-- ---------------------------------------------------------------------------
-- Whose content the report was about, snapshotted at filing time by the trigger below. Without it
-- a repeat infringer whose binder was deleted (by them or by us) leaves no countable trace, and
-- the repeat-infringer policy the DMCA page states cannot be operated.
alter table public.content_reports add column if not exists subject_owner_id uuid;
-- A reported PROFILE (bio, avatar, username), the other kind of user content. Exactly one of
-- binder_id / profile_id is expected; both stay soft references so the report outlives the thing.
alter table public.content_reports add column if not exists profile_id uuid;
-- Stamped by the alert job once the report has been announced to Discord. Null = not yet.
alter table public.content_reports add column if not exists notified_at timestamptz;

create index if not exists content_reports_subject_idx
  on public.content_reports (subject_owner_id, reason, status);

-- Snapshot the owner at filing time. BEFORE INSERT so the value is on the row from birth; definer
-- because the reporter has no business reading the binder owner directly.
create or replace function public.content_report_fill_subject()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.subject_owner_id is null then
    if new.profile_id is not null then
      new.subject_owner_id := new.profile_id;
    elsif new.binder_id is not null then
      select b.owner_id into new.subject_owner_id
        from public.binders b where b.id = new.binder_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists content_reports_fill_subject on public.content_reports;
create trigger content_reports_fill_subject
  before insert on public.content_reports
  for each row execute function public.content_report_fill_subject();

-- Admins read and resolve reports from /studio. Everyone else stays insert-only.
drop policy if exists "Admins can read reports" on public.content_reports;
create policy "Admins can read reports"
  on public.content_reports for select to authenticated
  using (public.is_admin());

drop policy if exists "Admins can resolve reports" on public.content_reports;
create policy "Admins can resolve reports"
  on public.content_reports for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, update on public.content_reports to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Admin actions
-- ---------------------------------------------------------------------------
-- Take a binder down. One call from /studio when actioning a report or a DMCA notice. The owner
-- keeps access to their own binder; every public surface stops serving it (policies + feeds
-- above). Also marks the binder's open reports actioned, so the queue drains itself.
create or replace function public.admin_remove_binder(p_binder_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;
  update public.binders set removed_at = now()
    where id = p_binder_id and removed_at is null;
  update public.content_reports set status = 'actioned'
    where binder_id = p_binder_id and status = 'open';
end;
$$;

-- Put it back (counter-notice, mistake). Does not touch report rows: the history of what was
-- actioned stays true even when the action is later reversed.
create or replace function public.admin_restore_binder(p_binder_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;
  update public.binders set removed_at = null where id = p_binder_id;
end;
$$;

-- The repeat-infringer ledger: actioned copyright reports per content owner, most-struck first.
-- This is the count the DMCA page's suspension sentence needs behind it.
create or replace function public.admin_copyright_strikes()
returns table (owner_id uuid, username text, strikes bigint, last_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select r.subject_owner_id as owner_id,
         (select p.username from public.profiles p where p.id = r.subject_owner_id) as username,
         count(*) as strikes,
         max(r.created_at) as last_at
  from public.content_reports r
  where r.reason = 'copyright'
    and r.status = 'actioned'
    and r.subject_owner_id is not null
    and public.is_admin()
  group by r.subject_owner_id
  order by strikes desc, last_at desc;
$$;

grant execute on function public.admin_remove_binder(uuid) to authenticated;
grant execute on function public.admin_restore_binder(uuid) to authenticated;
grant execute on function public.admin_copyright_strikes() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The account-level rights attestation
-- ---------------------------------------------------------------------------
-- rights_attested_at: when this account affirmed, once, that it holds the rights to the art it
-- shares (the ShareSheet checkbox, now account-wide and persisted). Set = new binders may default
-- public and per-binder attestation is no longer asked. Written by the owner via the existing
-- owner-scoped UPDATE policy; nothing here needs new RLS (same precedent as preferences).
--
-- rights_prompt_at: when the attestation prompt was last SHOWN, so the offer can be repeated on a
-- gentle cadence (first binder, then at most every 7 days) across devices without nagging.
alter table public.profiles add column if not exists rights_attested_at timestamptz;
alter table public.profiles add column if not exists rights_prompt_at timestamptz;

-- ---------------------------------------------------------------------------
-- 5. Tell Discord when reports arrive
-- ---------------------------------------------------------------------------
-- Guarded exactly like the scan-storage janitor (20260825120000): pg_cron is enabled on this
-- project, pg_net is not yet, and the webhook URL belongs in Vault. Until both exist this block
-- only raises a notice; reports still land and /studio still shows them, the ping is a nudge on
-- top, not the system of record. Enable pg_net (Dashboard -> Database -> Extensions), add the
-- Vault secret content_report_webhook (a Discord webhook URL), then re-run this block.
create or replace function public.notify_new_content_reports()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  n integer;
  latest text;
begin
  select count(*),
         string_agg(r.reason || coalesce(' on binder ' || left(r.binder_id::text, 8), '')
                    || coalesce(' on profile ' || left(r.profile_id::text, 8), ''), '; ')
    into n, latest
  from (
    select reason, binder_id, profile_id from public.content_reports
    where notified_at is null and status = 'open'
    order by created_at asc
    limit 10
  ) r;
  if coalesce(n, 0) = 0 then return; end if;
  perform net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets
                 where name = 'content_report_webhook'),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object(
      'content',
      'michi-maker: ' || n || ' new content report' || case when n = 1 then '' else 's' end
        || ' (' || latest || '). Review in /studio.'));
  update public.content_reports set notified_at = now()
    where notified_at is null and status = 'open';
end;
$$;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not enabled: content-report alert NOT scheduled.';
  elsif not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_net not enabled: content-report alert NOT scheduled. Enable pg_net, add the '
                 'vault secret content_report_webhook, and re-run this block.';
  elsif not exists (select 1 from vault.decrypted_secrets where name = 'content_report_webhook') then
    raise notice 'vault secret content_report_webhook missing: content-report alert NOT scheduled.';
  else
    perform cron.unschedule('content-report-alert')
      where exists (select 1 from cron.job where jobname = 'content-report-alert');
    perform cron.schedule('content-report-alert', '*/10 * * * *',
      'select public.notify_new_content_reports()');
  end if;
end $$;
