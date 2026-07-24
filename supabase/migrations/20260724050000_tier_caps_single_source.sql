-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- tier_caps — one source of truth for every cap NUMBER
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- The cap VALUES (3 binders, 250 cards, …) were hand-copied across src/data/tiers.ts,
-- src/lib/tiers.ts (tcgscan), the payments webhook, and a dozen SQL functions — each carrying a
-- "change both together" comment, which is a convention, not a mechanism. Change one, forget
-- another, and the client says one thing while the database enforces something else: a paying
-- customer blocked, or a free user quietly getting more than they bought.
--
-- This makes the DATABASE the single source, the same shape as the rest of this system's
-- real-time structures (the user_cards rollup, the insert-time cap counts): the numbers live in
-- one table, every enforcement function reads it, and changing a cap is one UPDATE that takes
-- effect immediately with no redeploy. The apps keep a mirrored TIER_LIMITS for instant/offline
-- UX, but it is a cache of this table, not a second authority — a test in each app pins the two
-- together.
--
-- NULL value = unlimited (uncapped()). This migration is behaviour-preserving: it seeds exactly
-- the values the hardcoded functions returned (verified before/after), then rewrites the
-- functions to read the table.

create table if not exists public.tier_caps (
  app        text    not null check (app in ('michi', 'tcgscan')),
  limit_key  text    not null,
  tier       text    not null check (tier in ('guest', 'free', 'pro', 'vip')),
  value      integer,                       -- NULL = unlimited
  updated_at timestamptz not null default now(),
  primary key (app, limit_key, tier)
);

comment on table public.tier_caps is
  'Single source of truth for tier cap NUMBERS. value NULL = unlimited. Every *_cap() function '
  'reads this; the apps mirror it in TIER_LIMITS for offline UX (a test pins them together). '
  'Change a cap with one UPDATE — it takes effect live, no redeploy. Service-role writes only.';

alter table public.tier_caps enable row level security;

-- The plan limits are public marketing facts, so reads are open (a client or a verification test
-- may fetch them). Writes are service-role only: no INSERT/UPDATE/DELETE policy exists.
drop policy if exists "Anyone may read tier caps" on public.tier_caps;
create policy "Anyone may read tier caps"
  on public.tier_caps for select to anon, authenticated using (true);

-- ── seed (exactly the current hardcoded values) ─────────────────────────────────────────────
insert into public.tier_caps (app, limit_key, tier, value) values
  -- michi
  ('michi', 'binders',                'guest', 1),
  ('michi', 'binders',                'free',  3),
  ('michi', 'binders',                'pro',   12),
  ('michi', 'binders',                'vip',   null),
  ('michi', 'pagesPerBinder',         'guest', 6),
  ('michi', 'pagesPerBinder',         'free',  16),
  ('michi', 'pagesPerBinder',         'pro',   40),
  ('michi', 'pagesPerBinder',         'vip',   null),
  ('michi', 'artUploads',             'guest', 10),
  ('michi', 'artUploads',             'free',  100),
  ('michi', 'artUploads',             'pro',   1000),
  ('michi', 'artUploads',             'vip',   null),
  ('michi', 'includedPrintsPerMonth', 'guest', 0),
  ('michi', 'includedPrintsPerMonth', 'free',  0),
  ('michi', 'includedPrintsPerMonth', 'pro',   1),
  ('michi', 'includedPrintsPerMonth', 'vip',   3),
  -- tcgscan
  ('tcgscan', 'collections',          'guest', 1),
  ('tcgscan', 'collections',          'free',  3),
  ('tcgscan', 'collections',          'pro',   12),
  ('tcgscan', 'collections',          'vip',   null),
  ('tcgscan', 'cardsPerCollection',   'guest', 60),
  ('tcgscan', 'cardsPerCollection',   'free',  250),
  ('tcgscan', 'cardsPerCollection',   'pro',   1000),
  ('tcgscan', 'cardsPerCollection',   'vip',   null),
  ('tcgscan', 'cardScansPerMonth',    'guest', 5),
  ('tcgscan', 'cardScansPerMonth',    'free',  60),
  ('tcgscan', 'cardScansPerMonth',    'pro',   1000),
  ('tcgscan', 'cardScansPerMonth',    'vip',   null)
on conflict (app, limit_key, tier) do nothing;

-- ── the reader ──────────────────────────────────────────────────────────────────────────────
-- A missing row means a config mistake, not an attack. Caps are a revenue nicety, not a security
-- boundary, and blocking a legitimate user is worse than a brief leak — so a missing row fails
-- OPEN (unlimited). The PK + complete seed make a miss unlikely; document the choice regardless.
create or replace function public.cap_value(p_app text, p_limit_key text, p_tier text)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(
    (select case when c.value is null then public.uncapped() else c.value end
       from public.tier_caps c
      where c.app = p_app and c.limit_key = p_limit_key and c.tier = p_tier),
    public.uncapped()
  );
$$;

-- ── rewrite every cap function to read the table (behaviour unchanged) ───────────────────────
create or replace function public.michi_binder_cap(p_user_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select public.cap_value('michi', 'binders', public.michi_effective_tier(p_user_id));
$$;

create or replace function public.michi_page_cap(p_user_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select public.cap_value('michi', 'pagesPerBinder', public.michi_effective_tier(p_user_id));
$$;

create or replace function public.michi_slice_cap(p_user_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select public.cap_value('michi', 'artUploads', public.michi_effective_tier(p_user_id));
$$;

-- Print rate uses michi_tier (not effective): a guest has 0 by the table anyway, and prints are
-- a subscriber feature keyed off the paid entitlement.
create or replace function public.michi_print_rate(p_user_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select public.cap_value('michi', 'includedPrintsPerMonth', public.michi_tier(p_user_id));
$$;

create or replace function public.tcgscan_collection_cap(p_user_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select public.cap_value('tcgscan', 'collections', public.tcgscan_effective_tier(p_user_id));
$$;

create or replace function public.tcgscan_card_cap(p_user_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select public.cap_value('tcgscan', 'cardsPerCollection', public.tcgscan_effective_tier(p_user_id));
$$;

create or replace function public.tcgscan_scan_cap(p_user_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select public.cap_value('tcgscan', 'cardScansPerMonth', public.tcgscan_effective_tier(p_user_id));
$$;

-- The reclaim code calls these free-cap helpers directly; point them at the table too so there is
-- genuinely one number left.
create or replace function public.free_binder_cap() returns integer
  language sql stable security definer set search_path = public as $$
  select public.cap_value('michi', 'binders', 'free');
$$;

create or replace function public.free_collection_cap() returns integer
  language sql stable security definer set search_path = public as $$
  select public.cap_value('tcgscan', 'collections', 'free');
$$;

-- ── grants ─────────────────────────────────────────────────────────────────────────────────
revoke all on function public.cap_value(text, text, text) from public;
grant execute on function public.cap_value(text, text, text) to authenticated, anon;
grant select on public.tier_caps to authenticated, anon;
