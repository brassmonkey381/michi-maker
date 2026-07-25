-- Reserved usernames: stop impersonation of the brand, of staff/system roles, and hold names we
-- owe to a specific person.
--
-- WHY THIS SHAPE. Usernames here are immutable once claimed
-- (20260711010000_require_immutable_username.sql), so a bad claim can't be renamed away later —
-- it has to be blocked at claim time. The format check already limits handles to
-- ^[a-z0-9_]{3,20}$, which rules out the Unicode-homoglyph attacks other platforms fight
-- (Cyrillic 'а', dotless 'ı'). What's left is ASCII trickery, which is what normalize_username
-- folds away before comparing:
--   michi_maker / m_i_c_h_i   → separators stripped
--   m1ch1m4k3r                → leetspeak folded
--   rnichimaker               → 'rn' reads as 'm' at a glance
--   michiiimaker              → repeated characters collapsed
--   officialmichi, michihq    → decorator words stripped
--   michimaker2026, 1michi    → edge digits stripped
--
-- Terms match one of two ways. 'exact' compares the whole normalized handle, so short brand words
-- don't cause collateral damage — reserving 'michi' must NOT block "michigan" or "michiko".
-- 'contains' matches anywhere and is only for strings nobody claims innocently ('michimaker').
--
-- A term may be HELD FOR SOMEONE: set reserved_usernames.claimable_by to a user id and that user
-- (and only that user) can claim it. That's how 'peeplop' is held for the Michi Method's
-- inventor — nobody else can take it, and it can be handed over later with a one-line update:
--     update public.reserved_usernames set claimable_by = '<uid>' where term = 'peeplop';

-- ---------------------------------------------------------------------------
-- Normalisation — the single source of truth, used by the trigger AND the client's pre-check RPC
-- so the two can never disagree.
-- ---------------------------------------------------------------------------
create or replace function public.normalize_username(p text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select regexp_replace(regexp_replace(collapsed, '^[0-9]+', ''), '[0-9]+$', '')
  from (
    -- 5. collapse runs of one character: michiiimaker -> michimaker
    select regexp_replace(decorated, '(.)\1+', '\1', 'g') as collapsed
    from (
      -- 4. drop decorator words: officialmichi, michimakerhq, themichi
      select regexp_replace(shapes, '(official|real|the|team|hq|app|inc|tm|xx|xoxo)', '', 'g') as decorated
      from (
        -- 3. ASCII look-alikes: 'rn' reads as 'm', 'vv' as 'w'
        select replace(replace(leet, 'rn', 'm'), 'vv', 'w') as shapes
        from (
          -- 2. leetspeak: 0=o 1=i 3=e 4=a 5=s 6=g 7=t 8=b 9=g
          select translate(bare, '013456789', 'oieasgtbg') as leet
          from (
            -- 1. lowercase, then strip separators
            select replace(lower(p), '_', '') as bare
          ) s1
        ) s2
      ) s3
    ) s4
  ) s5;
$$;

comment on function public.normalize_username(text) is
  'Folds a username to its confusable-insensitive form for reserved-name matching.';

-- ---------------------------------------------------------------------------
-- The reserved list
-- ---------------------------------------------------------------------------
create table public.reserved_usernames (
  term         text primary key,
  match_type   text not null default 'exact' check (match_type in ('exact', 'contains')),
  reason       text not null,
  -- When set, ONLY this user may claim the term (a name held for its rightful owner).
  claimable_by uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  -- Compared against normalize_username(candidate); stored so it can be indexed.
  term_norm    text generated always as (public.normalize_username(term)) stored
);

create index reserved_usernames_norm_idx on public.reserved_usernames (term_norm);

-- A CONTAINS rule that normalises to a short fragment blocks innocent handles as a substring.
-- Require a substantial stem so that mistake can't be introduced by a later insert.
alter table public.reserved_usernames
  add constraint reserved_usernames_contains_long_enough
  check (match_type <> 'contains' or length(public.normalize_username(term)) >= 6);

alter table public.reserved_usernames enable row level security;
-- No policies and no client grants: the list is server-side only, so it can't be enumerated to
-- find what's still free. The RPC below is SECURITY DEFINER and answers one handle at a time.
revoke all on public.reserved_usernames from anon, authenticated;

insert into public.reserved_usernames (term, match_type, reason) values
  -- Brand. 'contains' for strings nobody types by accident; 'exact' for the short root word so
  -- "michigan", "michiko", "michio" stay claimable.
  -- ⚠️ A 'contains' term is compared in NORMALISED form, so it must not fold down to a short
  -- fragment: 'michiofficial' as a contains rule collapsed to "michi" and carpet-blocked
  -- michigan/michiko/fakemichi. The constraint below enforces a ≥6-char stem; those spellings
  -- are covered anyway because they normalise to "michi" and hit the exact rule.
  ('michimaker',   'contains', 'brand'),
  ('michimakr',    'contains', 'brand'),
  ('michimethod',  'contains', 'brand'),
  ('michibinder',  'contains', 'brand'),
  ('michi',        'exact',    'brand'),
  ('michis',       'exact',    'brand'),
  ('michiapp',     'exact',    'brand'),
  ('michihq',      'exact',    'brand'),
  -- Held for the Michi Method's inventor (their preferred handle elsewhere).
  ('peeplop',      'exact',    'held for its owner'),
  -- Staff / authority impersonation.
  ('admin',        'exact',    'reserved role'),
  ('administrator','exact',    'reserved role'),
  ('root',         'exact',    'reserved role'),
  ('sysadmin',     'exact',    'reserved role'),
  ('moderator',    'exact',    'reserved role'),
  ('mod',          'exact',    'reserved role'),
  ('staff',        'exact',    'reserved role'),
  ('support',      'exact',    'reserved role'),
  ('helpdesk',     'exact',    'reserved role'),
  ('security',     'exact',    'reserved role'),
  ('billing',      'exact',    'reserved role'),
  ('payments',     'exact',    'reserved role'),
  ('system',       'exact',    'reserved role'),
  ('noreply',      'exact',    'reserved role'),
  ('webmaster',    'exact',    'reserved role'),
  ('postmaster',   'exact',    'reserved role'),
  ('abuse',        'exact',    'reserved role'),
  -- Site words / future route collisions (usernames aren't in URLs today; cheap to future-proof).
  ('api',          'exact',    'reserved word'),
  ('www',          'exact',    'reserved word'),
  ('mail',         'exact',    'reserved word'),
  ('help',         'exact',    'reserved word'),
  ('info',         'exact',    'reserved word'),
  ('contact',      'exact',    'reserved word'),
  ('legal',        'exact',    'reserved word'),
  ('privacy',      'exact',    'reserved word'),
  ('terms',        'exact',    'reserved word'),
  ('discover',     'exact',    'reserved word'),
  ('contest',      'exact',    'reserved word'),
  ('browse',       'exact',    'reserved word'),
  ('binder',       'exact',    'reserved word'),
  ('binders',      'exact',    'reserved word'),
  ('plans',        'exact',    'reserved word'),
  ('pricing',      'exact',    'reserved word'),
  ('settings',     'exact',    'reserved word'),
  ('account',      'exact',    'reserved word'),
  ('profile',      'exact',    'reserved word'),
  ('login',        'exact',    'reserved word'),
  ('signin',       'exact',    'reserved word'),
  ('signup',       'exact',    'reserved word'),
  ('logout',       'exact',    'reserved word'),
  ('welcome',      'exact',    'reserved word'),
  ('user',         'exact',    'reserved word'),
  ('users',        'exact',    'reserved word'),
  ('guest',        'exact',    'reserved word'),
  ('anonymous',    'exact',    'reserved word'),
  ('deleted',      'exact',    'reserved word'),
  ('null',         'exact',    'reserved word'),
  ('undefined',    'exact',    'reserved word');

-- The brand's own account keeps its handle: hold the brand terms FOR it, so the rules can never
-- lock out the real @michimaker.
update public.reserved_usernames
   set claimable_by = (select id from auth.users where email = 'official@michi-maker.com')
 where reason = 'brand'
   and exists (select 1 from auth.users where email = 'official@michi-maker.com');

-- ---------------------------------------------------------------------------
-- Matching + enforcement
-- ---------------------------------------------------------------------------
create or replace function public.username_reserved_reason(p_username text, p_user uuid default null)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select r.reason
  from public.reserved_usernames r
  where (r.claimable_by is null or r.claimable_by is distinct from p_user)
    and (
      (r.match_type = 'exact'    and public.normalize_username(p_username) = r.term_norm)
      or (r.match_type = 'contains' and public.normalize_username(p_username) like '%' || r.term_norm || '%')
    )
  limit 1;
$$;

create or replace function public.enforce_username_not_reserved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare why text;
begin
  if new.username is null then return new; end if;
  -- Only judge a handle as it's CLAIMED. Existing rows keep theirs, so unrelated profile updates
  -- (is_public, avatar) never trip this.
  if tg_op = 'UPDATE' and new.username is not distinct from old.username then return new; end if;
  why := public.username_reserved_reason(new.username, new.id);
  if why is not null then
    raise exception 'username % is reserved (%)', new.username, why using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger profiles_username_not_reserved
  before insert or update on public.profiles
  for each row execute function public.enforce_username_not_reserved();

-- ---------------------------------------------------------------------------
-- Client pre-check: one handle in, a verdict out. Lets the sign-up gate say "that's reserved"
-- before submitting, without ever exposing the list.
-- ---------------------------------------------------------------------------
create or replace function public.username_available(p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare why text; uname text := lower(trim(coalesce(p_username, '')));
begin
  if uname !~ '^[a-z0-9_]{3,20}$' then
    return jsonb_build_object('available', false, 'reason', 'format');
  end if;
  if exists (select 1 from public.profiles p where p.username = uname) then
    return jsonb_build_object('available', false, 'reason', 'taken');
  end if;
  why := public.username_reserved_reason(uname, (select auth.uid()));
  if why is not null then
    return jsonb_build_object('available', false, 'reason', 'reserved', 'detail', why);
  end if;
  return jsonb_build_object('available', true);
end;
$$;

grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.normalize_username(text) to anon, authenticated;
