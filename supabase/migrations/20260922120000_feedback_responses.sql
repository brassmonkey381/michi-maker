-- Feedback and surveys — one intake table for EVERY app in this family, not just michi-maker.
--
-- The shape is deliberately generic, because the second customer is already known (tcgscan.ai)
-- and a third is likely. A survey is DATA, not a schema: the questions live in the app as a
-- definition object, the answers land here as one jsonb map keyed by question id, and adding a
-- question, a whole survey, or a whole new front end costs zero migrations.
--
-- WHAT IS NOT jsonb, and why. Three things are lifted into real columns because a dashboard must
-- be able to sort, filter and roll them up without parsing a blob: the anchor score (`nps`), the
-- follow-up address (`contact_email`) and its consent (`contact_ok`). Everything else stays in
-- `answers`; the summary RPC below averages any numeric answer generically, so a new rating
-- question shows up in the roll-up the day it ships without a schema change.
--
-- WRITES: any caller with a session (`to authenticated`). Guests are covered because this app
-- signs them in anonymously on first launch — the same reasoning content_reports records. The
-- app calls continueAsGuest() before submitting so the one visitor class without a session (an
-- explicit sign-out) gets one first. NO client SELECT/UPDATE/DELETE policy exists: a response is
-- write-once from the client and read only through the admin RPCs at the bottom, which is the
-- entitlements/content_reports invariant and the reason free text here is safe to collect.
--
-- ABUSE: no captcha (docs/AUTH.md forbids one on this project, it breaks silent guest sign-in),
-- so the cap lives where it cannot be skipped — inside the insert policy, as a security-definer
-- count over the caller's last 24 hours. Same shape as the metering in 20260724040000.

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------

create table if not exists public.feedback_responses (
  id uuid primary key default gen_random_uuid(),
  -- WHICH APP this came from. A FORMAT check, not an `in (...)` enum, on purpose: the analytics
  -- tables use `check (app in ('michi','tcgscan'))` and a third front end there would need a
  -- migration before it could write its first row. Reproducibility was the point of this table,
  -- so the constraint checks the SHAPE of the key and leaves the vocabulary to the apps. The
  -- typo protection an enum would give is bought back client-side, where the value is one const.
  app text not null check (app ~ '^[a-z][a-z0-9_-]{1,31}$'),
  -- Which survey, and which revision of it. The version is what makes old answers readable: when
  -- a question changes meaning its survey version goes up, and a roll-up can refuse to average
  -- across the change instead of silently comparing two different questions.
  survey_id text not null check (survey_id ~ '^[a-z][a-z0-9_-]{1,63}$'),
  survey_version integer not null check (survey_version >= 1),
  -- Who wrote it. Defaulted server-side, never sent by the client. `on delete set null` because
  -- feedback outlives the account that left it: deleting a user must not destroy the record of
  -- what they told us, and with the id gone the row is anonymous, which is the right end state.
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  -- Stamped by trigger from request_is_anonymous(), never trusted from the client: the JWT's
  -- is_anonymous claim stays stale for up to an hour after a guest upgrades, and reading it has
  -- already cost this project trials, likes and cap tiers.
  was_guest boolean,
  -- The whole answer set: { "<question id>": number | string | string[] | boolean }.
  -- The cap is in COMPRESSED UTF-8 BYTES and the client's own limits are in UTF-16 units, so the
  -- two do not convert. This survey's text fields allow about 5,000 characters, which is up to
  -- 15,000 bytes of non-Latin script before keys and punctuation; 65,536 leaves the honest
  -- respondent well clear while still refusing a blob.
  answers jsonb not null default '{}'::jsonb
    check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) <= 65536),
  -- What the app knew without asking: plan, platform, route, session and device ids, counts.
  -- NEVER anything the visitor did not type or the app did not already hold.
  context jsonb not null default '{}'::jsonb
    check (jsonb_typeof(context) = 'object' and pg_column_size(context) <= 8192),
  -- THE ANCHOR, denormalised. One survey per app has a question marked `anchor` and its score
  -- lands here as well as in `answers`, so "how is NPS trending" is an index scan.
  nps smallint check (nps is null or nps between 0 and 10),
  -- Follow-up address and its consent. Kept HERE and deliberately not routed through
  -- profiles.marketing_consent: that ledger's 'settings' source means someone flipped the switch
  -- themselves, and diluting it with survey addresses would wreck the one defensible send list.
  contact_email text check (contact_email is null or (length(contact_email) between 3 and 254 and position('@' in contact_email) > 1)),
  contact_ok boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.feedback_responses is
  'Product feedback and survey answers for every app in this family (app column). Client INSERT only (to authenticated, guests included, capped per day); no client read path, admin reads go through admin_feedback_recent/admin_feedback_summary. See docs/FEEDBACK.md.';

comment on column public.feedback_responses.app is
  'Which front end sent this: ''michi'', ''tcgscan'', or a future one. Format-checked, not enumerated, so a new app needs no migration.';
comment on column public.feedback_responses.answers is
  'Answer map keyed by question id, as defined by the app''s survey definition. Read with the survey_version that wrote it.';
comment on column public.feedback_responses.nps is
  'The anchor question''s 0-10 score, copied out of answers so roll-ups never parse jsonb.';

-- The two access paths: newest-first per app, and the anchor trend. Both partial where it pays.
create index if not exists feedback_responses_app_created_idx
  on public.feedback_responses (app, created_at desc);
create index if not exists feedback_responses_survey_idx
  on public.feedback_responses (app, survey_id, survey_version, created_at desc);
create index if not exists feedback_responses_nps_idx
  on public.feedback_responses (app, created_at desc) where nps is not null;
-- The per-caller quota check below hits this one on every single insert.
create index if not exists feedback_responses_user_recent_idx
  on public.feedback_responses (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Server-owned columns: the client sends answers, never identity or time
-- ---------------------------------------------------------------------------

create or replace function public.feedback_stamp_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Truth about the caller, read from auth.users rather than from the token they presented.
  new.was_guest := public.request_is_anonymous();
  -- The row's own clock. A client-supplied created_at would let one backdate out of the quota
  -- window below, which is the whole defence.
  new.created_at := now();
  -- Normalise the address here rather than in the CHECK: a trailing space or a capitalised
  -- domain is the same person, and two spellings of one address is two people to a dashboard.
  -- A BEFORE trigger runs ahead of the CHECK constraints, so this also keeps a blank-but-present
  -- box from being a hard rejection.
  new.contact_email := nullif(btrim(lower(coalesce(new.contact_email, ''))), '');
  -- Consent without an address is nothing to consent to; an address with no consent is kept but
  -- must never be mailed, so the flag is the thing every reader checks.
  if new.contact_email is null then
    new.contact_ok := false;
  end if;
  return new;
end;
$$;

comment on function public.feedback_stamp_identity() is
  'BEFORE INSERT on feedback_responses: stamps was_guest and created_at server-side.';

drop trigger if exists feedback_responses_stamp on public.feedback_responses;
create trigger feedback_responses_stamp
  before insert on public.feedback_responses
  for each row execute function public.feedback_stamp_identity();

-- ---------------------------------------------------------------------------
-- The cap, inside the policy
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER for two reasons: the table has no select policy, so an ordinary count would
-- see zero and let anyone through; and a subquery on the same table from inside its own policy
-- would recurse through RLS.
create or replace function public.feedback_quota_left()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select count(*) < 5
  from public.feedback_responses f
  where f.user_id = (select auth.uid())
    and f.created_at > now() - interval '24 hours';
$$;

comment on function public.feedback_quota_left() is
  'True while the caller has filed fewer than 5 feedback responses in the last 24 hours. Called from the insert policy.';

revoke all on function public.feedback_quota_left() from public;
grant execute on function public.feedback_quota_left() to authenticated;

alter table public.feedback_responses enable row level security;

drop policy if exists "Anyone with a session can leave feedback" on public.feedback_responses;
create policy "Anyone with a session can leave feedback"
  on public.feedback_responses for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and public.feedback_quota_left()
  );

-- No select, update or delete policy, on purpose. Append-only from the client, exactly as
-- analytics_events and print_pool_unlocks are.
grant insert on public.feedback_responses to authenticated;

-- ---------------------------------------------------------------------------
-- The cap, for real: a statement-level backstop
-- ---------------------------------------------------------------------------
-- The WITH CHECK above is evaluated per row under the STATEMENT'S snapshot, and a row written
-- earlier in the same command is invisible to it (its cmin equals that snapshot's curcid). One
-- PostgREST request with an array body is ONE `insert ... select from json_populate_recordset`
-- command, so every row in it is checked against the same pre-statement count of zero and they
-- all pass: the policy alone would let a single request write thousands of rows past a cap of
-- five. An AFTER STATEMENT trigger fires once the command counter has advanced, so it does see
-- what the statement just wrote. The policy predicate stays as the cheap per-row fast path.

create or replace function public.feedback_enforce_cap()
returns trigger
language plpgsql
security definer          -- no select policy exists, so an invoker-rights count would see zero
set search_path = public
as $$
declare
  uid  uuid := (select auth.uid());
  used integer;
begin
  -- Webhooks, cron and manual SQL are not a person's daily allowance, same as every other cap
  -- in this schema (20260723220000).
  if public.is_privileged_write() or uid is null then
    return null;
  end if;

  select count(*) into used
    from public.feedback_responses f
   where f.user_id = uid
     and f.created_at > now() - interval '24 hours';

  if used > 5 then
    -- 42501 so PostgREST answers 403 and surveyRepo's existing branch shows the plain-English
    -- "that is as much feedback as one account can send in a day" sentence unchanged.
    raise exception 'feedback_cap_exceeded (% of 5 in 24 hours)', used using errcode = '42501';
  end if;

  return null;
end;
$$;

comment on function public.feedback_enforce_cap() is
  'AFTER INSERT statement trigger: re-counts the caller''s last 24 hours, where the statement''s own rows are visible, and refuses past 5. The insert policy''s predicate cannot see them.';

drop trigger if exists feedback_responses_cap on public.feedback_responses;
create trigger feedback_responses_cap
  after insert on public.feedback_responses
  for each statement execute function public.feedback_enforce_cap();

-- ---------------------------------------------------------------------------
-- Deleting an account forgets the address, wherever the deletion comes from
-- ---------------------------------------------------------------------------
-- `user_id` is `on delete set null` so the feedback outlives the account that left it, which is
-- right: what somebody told us is a record, and with the id gone the row is anonymous. But it is
-- only anonymous if the ADDRESS goes too, and a row holding a name and an email address after
-- its account was erased is exactly what the privacy policy's deletion promise forbids. Hanging
-- this off the `user_id` transition rather than off the delete-account function means it holds
-- for a deletion done by hand in SQL as well.

create or replace function public.feedback_forget_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null and old.user_id is not null then
    new.contact_email := null;
    new.contact_ok := false;
  end if;
  return new;
end;
$$;

comment on function public.feedback_forget_contact() is
  'BEFORE UPDATE OF user_id: when an account is deleted and the id is set to null, the follow-up address goes with it, so what is left is genuinely anonymous.';

drop trigger if exists feedback_responses_forget_contact on public.feedback_responses;
create trigger feedback_responses_forget_contact
  before update of user_id on public.feedback_responses
  for each row execute function public.feedback_forget_contact();

-- ---------------------------------------------------------------------------
-- Admin reads. Not a policy: a security-definer RPC, so hiding the nav item is never the gate.
-- ---------------------------------------------------------------------------

create or replace function public.admin_feedback_recent(
  p_app text default null,
  p_limit integer default 100,
  p_before timestamptz default null
)
returns table (
  id uuid,
  app text,
  survey_id text,
  survey_version integer,
  was_guest boolean,
  answers jsonb,
  context jsonb,
  nps smallint,
  contact_email text,
  contact_ok boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select f.id, f.app, f.survey_id, f.survey_version, f.was_guest, f.answers, f.context,
         f.nps, f.contact_email, f.contact_ok, f.created_at
  from public.feedback_responses f
  where public.is_admin()
    and (p_app is null or f.app = p_app)
    and (p_before is null or f.created_at < p_before)
  order by f.created_at desc
  limit least(coalesce(p_limit, 100), 500);
$$;

comment on function public.admin_feedback_recent(text, integer, timestamptz) is
  'Admin-only page of feedback responses, newest first. p_before is the cursor (pass the last created_at).';

-- The roll-up. Generic on purpose: it averages EVERY numeric answer by its question id, so a
-- rating question added tomorrow appears here the day it ships, in any app, with no new SQL.
create or replace function public.admin_feedback_summary(
  p_app text default null,
  p_days integer default 30
)
returns table (
  responses bigint,
  nps_responses bigint,
  promoters bigint,
  passives bigint,
  detractors bigint,
  nps_score numeric,
  contactable bigint,
  averages jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with scope as (
    select f.*
    from public.feedback_responses f
    where public.is_admin()
      and (p_app is null or f.app = p_app)
      and f.created_at > now() - make_interval(days => greatest(coalesce(p_days, 30), 1))
  ),
  numeric_answers as (
    select a.key, (a.value #>> '{}')::numeric as val
    from scope s, jsonb_each(s.answers) a
    where jsonb_typeof(a.value) = 'number'
  )
  select
    (select count(*) from scope),
    (select count(*) from scope where nps is not null),
    (select count(*) from scope where nps >= 9),
    (select count(*) from scope where nps between 7 and 8),
    (select count(*) from scope where nps <= 6 and nps is not null),
    -- Standard NPS: percent promoters minus percent detractors, null when nobody scored.
    (select case when count(*) filter (where nps is not null) = 0 then null
                 else round(
                   100.0 * count(*) filter (where nps >= 9) / count(*) filter (where nps is not null)
                   - 100.0 * count(*) filter (where nps <= 6 and nps is not null) / count(*) filter (where nps is not null)
                 , 1) end
     from scope),
    (select count(*) from scope where contact_ok and contact_email is not null),
    (select coalesce(jsonb_object_agg(key, jsonb_build_object('n', n, 'avg', avg)), '{}'::jsonb)
     from (select key, count(*) as n, round(avg(val), 2) as avg from numeric_answers group by key) q);
$$;

comment on function public.admin_feedback_summary(text, integer) is
  'Admin-only roll-up over a window: response counts, the NPS split and score, and the mean of every numeric answer keyed by question id.';

revoke all on function public.admin_feedback_recent(text, integer, timestamptz) from public;
revoke all on function public.admin_feedback_summary(text, integer) from public;
grant execute on function public.admin_feedback_recent(text, integer, timestamptz) to authenticated;
grant execute on function public.admin_feedback_summary(text, integer) to authenticated;
