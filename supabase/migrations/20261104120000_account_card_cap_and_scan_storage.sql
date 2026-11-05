-- ═══════════════════════════════════════════════════════════
-- tcgscan: an account-wide card ceiling, and a ceiling on saved scan pictures
-- ═══════════════════════════════════════════════════════════
-- Owner decisions of 2026-11-04 (tcgscan-app src/lib/tiers.ts mirrors these; its
-- scripts/account-caps.test.ts pins the mirror to the rows below):
--
--   cardsTotal    cards across EVERY live collection of the account. PRO 5,000; VIP, Free, legacy
--                 Free and guests unbounded here (Free stays held by cardsPerCollection). Sealed
--                 items meet a tenth of it, the same split as per collection.
--   scanImageMB   saved scan pictures in the scan-images bucket. guest 0, Free 250, legacy Free
--                 250, PRO 2048 (2 GB), VIP 10240 (10 GB). VIP stays off sale; its rows are ready.
--
-- THE PICTURE CEILING IS ENFORCED BY THE APP, softly. At the ceiling the app stops minting
-- scan paths (cards still land, with the catalog picture), reading the usage through
-- my_scan_image_usage() below. No storage policy refuses the bytes: a policy that summed the
-- bucket on every insert is a hot path for a cost ceiling, and an upload refused after its path
-- was minted only leaves a pointer that shows the catalog picture. Tighten later if needed.
--
-- THE CARD CEILING IS ENFORCED HERE as well, in enforce_card_cap, because the card cap always
-- has been: the app checks first (lib/portfolio overAccountLimit) so a sync batch never meets it.

-- ── 1. the numbers ───────────────────────────────────────────────────────────────────────────
-- `do nothing` on conflict: a value someone has since tuned with one UPDATE survives a re-run.
insert into public.tier_caps (app, limit_key, tier, value) values
  ('tcgscan', 'cardsTotal',  'guest',       null),
  ('tcgscan', 'cardsTotal',  'free',        null),
  ('tcgscan', 'cardsTotal',  'legacy_free', null),
  ('tcgscan', 'cardsTotal',  'pro',         5000),
  ('tcgscan', 'cardsTotal',  'vip',         null),
  ('tcgscan', 'scanImageMB', 'guest',       0),
  ('tcgscan', 'scanImageMB', 'free',        250),
  ('tcgscan', 'scanImageMB', 'legacy_free', 250),
  ('tcgscan', 'scanImageMB', 'pro',         2048),
  ('tcgscan', 'scanImageMB', 'vip',         10240)
on conflict (app, limit_key, tier) do nothing;

-- ── 2. which ceiling an account reads ────────────────────────────────────────────────────────
create or replace function public.tcgscan_card_total_cap(p_user_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select public.cap_value('tcgscan', 'cardsTotal', public.cap_tier_for(p_user_id, public.tcgscan_effective_tier(p_user_id)));
$$;
revoke all on function public.tcgscan_card_total_cap(uuid) from public;
grant execute on function public.tcgscan_card_total_cap(uuid) to authenticated;

create or replace function public.tcgscan_scan_image_mb_cap(p_user_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select public.cap_value('tcgscan', 'scanImageMB', public.cap_tier_for(p_user_id, public.tcgscan_effective_tier(p_user_id)));
$$;
revoke all on function public.tcgscan_scan_image_mb_cap(uuid) from public;
grant execute on function public.tcgscan_scan_image_mb_cap(uuid) to authenticated;

-- ── 3. the card trigger: per collection (unchanged) and now per account ─────────────────────
-- 20260831140000's body, with the account check added after the collection check.
create or replace function public.enforce_card_cap()
returns trigger language plpgsql security definer set search_path = public as $$
declare cap integer; total integer; addition integer; is_sealed boolean; acct integer; acap integer;
begin
  if public.is_privileged_write() then return new; end if;
  if public.is_staff(new.user_id) then return new; end if;
  if exists (select 1 from public.collections c
              where c.id = new.collection_id and c.archived_at is not null) then
    return new;
  end if;

  is_sealed := coalesce(new.item_kind = 'sealed', false);

  if tg_op = 'INSERT' then
    if exists (select 1 from public.portfolio_entries e where e.id = new.id) then return new; end if;
    addition := greatest(coalesce(new.quantity, 1), 0);
  else
    addition := greatest(coalesce(new.quantity, 1) - coalesce(old.quantity, 1), 0);
    if addition = 0 then return new; end if;          -- shrinking or unchanged: always allowed
  end if;

  select coalesce(sum(e.quantity), 0) into total from public.portfolio_entries e
   where e.collection_id = new.collection_id
     and (case when is_sealed then e.item_kind = 'sealed'
               else e.item_kind is distinct from 'sealed' end);

  cap := public.tcgscan_card_cap(new.user_id);
  if is_sealed then cap := greatest(1, cap / 10); end if;
  if total + addition > cap then
    raise exception 'tier_cap_exceeded:% (% of %)',
      case when is_sealed then 'sealedPerCollection' else 'cardsPerCollection' end,
      total + addition, cap
      using errcode = 'P0001';
  end if;

  -- THE ACCOUNT: every live collection of this user, the same class. Skipped outright when the
  -- tier has no account ceiling (uncapped), so most writes pay for one function call only.
  acap := public.tcgscan_card_total_cap(new.user_id);
  if acap < public.uncapped() then
    if is_sealed then acap := greatest(1, acap / 10); end if;
    select coalesce(sum(e.quantity), 0) into acct from public.portfolio_entries e
      join public.collections c on c.id = e.collection_id and c.user_id = e.user_id
     where e.user_id = new.user_id
       and c.archived_at is null
       and (case when is_sealed then e.item_kind = 'sealed'
                 else e.item_kind is distinct from 'sealed' end);
    if acct + addition > acap then
      raise exception 'tier_cap_exceeded:% (% of %)',
        case when is_sealed then 'sealedTotal' else 'cardsTotal' end,
        acct + addition, acap
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end; $$;

-- ── 4. how much an account stores ────────────────────────────────────────────────────────────
-- Summed from the bucket itself, so it is what is really there, whatever the app believed. The
-- `like` on the owner folder rides the bucket/name index.
create or replace function public.scan_image_bytes_for(p_user_id uuid)
returns bigint language sql stable security definer set search_path = public, storage as $$
  select coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint
    from storage.objects o
   where o.bucket_id = 'scan-images'
     and o.name like p_user_id::text || '/%';
$$;
revoke all on function public.scan_image_bytes_for(uuid) from public;

-- What the app asks about ITSELF: never takes a user id from the caller.
create or replace function public.my_scan_image_usage()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'used_bytes', public.scan_image_bytes_for(auth.uid()),
    'cap_mb',     public.tcgscan_scan_image_mb_cap(auth.uid())
  );
$$;
revoke all on function public.my_scan_image_usage() from public;
grant execute on function public.my_scan_image_usage() to authenticated;

comment on function public.my_scan_image_usage() is
  'The caller''s saved scan pictures: bytes in the scan-images bucket under their folder, and their '
  'tier''s ceiling in MB (tier_caps scanImageMB). tcgscan-app reads it to stop saving at the ceiling.';
