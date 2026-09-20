-- ═══════════════════════════════════════════════════════════
-- Tier rework, the database half: new Free caps, legacy caps for existing accounts, 3-day trials
-- ═══════════════════════════════════════════════════════════
-- Owner decisions of 2026-09-20 (tcgscan-app docs/TIER-REWORK.md). Both apps go to two tiers, Free
-- and PRO. This migration moves the NUMBERS; the apps' mirrored TIER_LIMITS follow in their own
-- commits, and a test in each app pins the mirror to this table.
--
--   Free (new accounts)   tcgscan 1 collection x 150 cards      michi 2 binders, 9 pages, 25 artworks
--   Free (legacy)         tcgscan 3 collections x 250 cards     michi 3 binders, 16 pages, 100 artworks
--   PRO                   everything unlimited
--   VIP                   rows stay (the owner's own row is the only one); no longer sold
--   Prints                included in NO plan (the print offer is being reworked separately)
--   Trials                3 days, both apps (was 14)
--
-- EXISTING ACCOUNTS KEEP THE CAPS THEY SIGNED UP UNDER. Measured the same day over 83 real free
-- michi accounts: 8 over 2 binders, 10 over 9 pages, 26 over 25 artworks. Lowering Free under them
-- would stop a third of the most engaged early users adding art, for no revenue (none of them
-- pays). So "free" resolves to `legacy_free` for any account created before the cutover, in ONE
-- function (`cap_tier_for`), and every cap function and both reclaim helpers go through it. The
-- reclaim jobs were made per-owner first (20260920120000) precisely so this could not archive a
-- legacy account's third binder.
--
-- THE CUTOVER IS RECORDED ONCE. `tier_cutover` gets its row the first time this runs and never
-- again (on conflict do nothing), so re-applying the migration cannot move the line and quietly
-- demote accounts created between two runs.

-- ── 1. the legacy tier ───────────────────────────────────────────────────────────────────────
alter table public.tier_caps drop constraint if exists tier_caps_tier_check;
alter table public.tier_caps
  add constraint tier_caps_tier_check check (tier in ('guest', 'legacy_free', 'free', 'pro', 'vip'));

-- Legacy = whatever Free is RIGHT NOW, copied before Free changes. Copying (not retyping) means a
-- cap someone already tuned in the table is carried exactly, whatever it is.
insert into public.tier_caps (app, limit_key, tier, value)
select app, limit_key, 'legacy_free', value from public.tier_caps where tier = 'free'
on conflict (app, limit_key, tier) do nothing;

create table if not exists public.tier_cutover (
  id         boolean primary key default true check (id),      -- one row, ever
  cutover_at timestamptz not null default now()
);
comment on table public.tier_cutover is
  'When the 2026-09 tier rework took effect. Accounts created BEFORE cutover_at keep the legacy '
  'Free caps (tier_caps.tier = legacy_free). Written once; never update it.';
alter table public.tier_cutover enable row level security;   -- no policies: server-side only
insert into public.tier_cutover (id) values (true) on conflict (id) do nothing;

-- ── 2. which cap set an account reads ────────────────────────────────────────────────────────
create or replace function public.cap_tier_for(p_user_id uuid, p_tier text)
returns text language sql stable security definer set search_path = public as $$
  select case
    when p_tier = 'free' and exists (
      select 1 from auth.users u, public.tier_cutover c
       where u.id = p_user_id and u.created_at < c.cutover_at
    ) then 'legacy_free'
    else p_tier
  end;
$$;
comment on function public.cap_tier_for(uuid, text) is
  'Maps an account''s tier to the cap set it reads: free -> legacy_free for accounts created '
  'before tier_cutover.cutover_at, otherwise the tier unchanged. The ONLY place the legacy rule lives.';
revoke all on function public.cap_tier_for(uuid, text) from public;

create or replace function public.michi_binder_cap(p_user_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select public.cap_value('michi', 'binders', public.cap_tier_for(p_user_id, public.michi_effective_tier(p_user_id)));
$$;
create or replace function public.michi_page_cap(p_user_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select public.cap_value('michi', 'pagesPerBinder', public.cap_tier_for(p_user_id, public.michi_effective_tier(p_user_id)));
$$;
create or replace function public.michi_slice_cap(p_user_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select public.cap_value('michi', 'artUploads', public.cap_tier_for(p_user_id, public.michi_effective_tier(p_user_id)));
$$;
create or replace function public.tcgscan_collection_cap(p_user_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select public.cap_value('tcgscan', 'collections', public.cap_tier_for(p_user_id, public.tcgscan_effective_tier(p_user_id)));
$$;
create or replace function public.tcgscan_card_cap(p_user_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select public.cap_value('tcgscan', 'cardsPerCollection', public.cap_tier_for(p_user_id, public.tcgscan_effective_tier(p_user_id)));
$$;

-- The reclaim helpers (20260920120000): "the Free cap FOR THIS ACCOUNT" now means it.
create or replace function public.free_binder_cap_for(p_user_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select public.cap_value('michi', 'binders', public.cap_tier_for(p_user_id, 'free'));
$$;
create or replace function public.free_collection_cap_for(p_user_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select public.cap_value('tcgscan', 'collections', public.cap_tier_for(p_user_id, 'free'));
$$;

-- What a client may ask about ITSELF, so the apps can mirror the right cap set without reading
-- auth.users: 'legacy_free' or the tier unchanged. Never takes a user id from the caller.
create or replace function public.my_cap_tier(p_tier text)
returns text language sql stable security definer set search_path = public as $$
  select public.cap_tier_for(auth.uid(), p_tier);
$$;
revoke all on function public.my_cap_tier(text) from public;
grant execute on function public.my_cap_tier(text) to authenticated;

-- ── 3. the new numbers ───────────────────────────────────────────────────────────────────────
update public.tier_caps set value = v.value, updated_at = now()
  from (values
    ('tcgscan', 'collections',            'free', 1),
    ('tcgscan', 'cardsPerCollection',     'free', 150),
    ('tcgscan', 'cardsPerCollection',     'guest', 25),
    ('michi',   'binders',                'free', 2),
    ('michi',   'pagesPerBinder',         'free', 9),
    ('michi',   'artUploads',             'free', 25)
  ) as v(app, limit_key, tier, value)
 where tier_caps.app = v.app and tier_caps.limit_key = v.limit_key and tier_caps.tier = v.tier;

-- PRO is unlimited (NULL): with no VIP on sale, a PRO cap would be a wall with nothing behind it.
update public.tier_caps set value = null, updated_at = now()
 where tier = 'pro'
   and (app, limit_key) in (('tcgscan', 'collections'), ('tcgscan', 'cardsPerCollection'),
                            ('michi', 'binders'), ('michi', 'pagesPerBinder'), ('michi', 'artUploads'));

-- Prints are in no plan. The print offer is being reworked; until then nothing is "included".
update public.tier_caps set value = 0, updated_at = now()
 where app = 'michi' and limit_key = 'includedPrintsPerMonth';

-- ── 4. trials: 3 days, read from one place ───────────────────────────────────────────────────
create or replace function public.trial_days() returns integer
  language sql immutable set search_path = public as $$ select 3 $$;
comment on function public.trial_days() is
  'Length of the free no-card PRO trial in both apps, in days. Both start_*_trial functions read it.';

-- Both trial functions hardcode `interval '14 days'`. They are long, security-critical bodies that
-- have been redefined four times; re-typing them here to change one number is how a fifth copy
-- drifts. Instead the LIVE definition is rewritten in place: the literal becomes a call to
-- trial_days(). Idempotent: a body that no longer contains the literal is left alone.
do $$
declare fn regprocedure; def text;
begin
  foreach fn in array array[
    'public.start_pro_trial(text)'::regprocedure,
    'public.start_tcgscan_pro_trial(text)'::regprocedure
  ] loop
    def := pg_get_functiondef(fn);
    if position('interval ''14 days''' in def) > 0 then
      execute replace(def, 'interval ''14 days''', 'make_interval(days => public.trial_days())');
    end if;
  end loop;
end $$;
