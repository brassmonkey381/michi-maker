-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Authoritative metering — print_events and scan_events stop being advisory
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Both meters were client-written with an ownership-only INSERT policy, and both clients insert
-- fire-and-forget with the error swallowed. So the ledgers could be exceeded (nothing checked the
-- count on the way in) as well as under-counted (skip the insert, keep the credit).
--
-- This migration closes the EXCEEDED direction completely, for old and new clients alike:
--
--   * `record_print_event()` / `record_scan_event(card_id)` — security-definer RPCs that check
--     the allowance and insert ATOMICALLY, so two concurrent calls can't both pass a check that
--     only one credit could satisfy. New clients should call these.
--   * The INSERT policies now carry the same allowance predicate, so a client writing to the
--     table directly (every build shipped before today) is capped too, rather than having to be
--     upgraded first. This is the `print_pool_unlocks` pattern from 20260719120000.
--
-- The UNDER-counting direction cannot be closed here and is not pretended to be: a client that
-- never records a scan keeps its credit, because "this add came from a scan" is a claim only the
-- client can make. Closing that would mean moving the add itself behind a server RPC. Documented
-- in docs/CAP-ENFORCEMENT.md rather than silently assumed.
--
-- The print window mirrors src/data/printWindow.ts + proration.ts exactly — calendar month when
-- there is no billing term, a monthly slice anchored on the billing anniversary otherwise, or the
-- whole term at once for a yearly subscriber who unlocked their pool. Postgres clamps
-- `+ interval 'n months'` to the target month's length, which is what addMonths() does by hand.

-- ── month arithmetic (mirrors data/proration.ts) ────────────────────────────────────────────

create or replace function public.months_elapsed(
  p_start timestamptz, p_now timestamptz, p_cap integer default 12
) returns integer language plpgsql immutable set search_path = public as $$
declare m integer;
begin
  m := (extract(year  from (p_now at time zone 'UTC'))::int -
        extract(year  from (p_start at time zone 'UTC'))::int) * 12
     + (extract(month from (p_now at time zone 'UTC'))::int -
        extract(month from (p_start at time zone 'UTC'))::int);
  -- Step back until the anniversary has genuinely passed, comparing the full instant (not the
  -- date) — the same correction proration.ts documents.
  if p_start + make_interval(months => m) > p_now then m := m - 1; end if;
  return greatest(0, least(p_cap, m));
end; $$;

-- ── print allowance ────────────────────────────────────────────────────────────────────────

-- Included prints per month by tier. Mirrors PRINTS_PER_MONTH in data/proration.ts.
create or replace function public.michi_print_rate(p_user_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select case public.michi_tier(p_user_id) when 'vip' then 3 when 'pro' then 1 else 0 end;
$$;

-- The window included prints are counted over right now, and how many the window includes.
create or replace function public.michi_print_window(
  p_user_id uuid, out window_start timestamptz, out allocation integer
) language plpgsql stable security definer set search_path = public as $$
declare
  rate      integer := public.michi_print_rate(p_user_id);
  ent       record;
  unlocked  boolean := false;
  slice     integer;
begin
  if rate = 0 then                            -- free/guest: no allocation, no window to compute
    window_start := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
    allocation   := 0;
    return;
  end if;

  select e.interval, e.period_start, e.term_print_allocation into ent
    from public.entitlements e
   where e.user_id = p_user_id and e.product in ('tier_pro', 'tier_vip')
     and (e.expires_at is null or e.expires_at > now())
   order by case e.product when 'tier_vip' then 0 else 1 end
   limit 1;

  -- No billing term (manual grant / lifetime unlock) → calendar month, as before terms existed.
  if ent.period_start is null then
    window_start := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
    allocation   := rate;
    return;
  end if;

  if ent.interval = 'year' then
    select exists (
      select 1 from public.print_pool_unlocks u
       where u.user_id = p_user_id and u.period_start = ent.period_start
    ) into unlocked;
  end if;

  if ent.interval = 'year' and unlocked then
    window_start := ent.period_start;
    allocation   := coalesce(ent.term_print_allocation, rate * 12);
    return;
  end if;

  slice        := public.months_elapsed(ent.period_start, now());
  window_start := ent.period_start + make_interval(months => slice);
  allocation   := rate;
end; $$;

create or replace function public.print_credits_left(p_user_id uuid)
returns integer language plpgsql stable security definer set search_path = public as $$
declare w record; used integer;
begin
  if public.is_staff(p_user_id) then return public.uncapped(); end if;
  select * into w from public.michi_print_window(p_user_id);
  select count(*) into used from public.print_events p
   where p.user_id = p_user_id and p.created_at >= w.window_start;
  return greatest(0, w.allocation - used);
end; $$;

-- ── scan allowance (calendar month, mirrors tcgscan lib/scan-quota.ts) ──────────────────────

create or replace function public.tcgscan_scan_cap(p_user_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select case public.tcgscan_effective_tier(p_user_id)
           when 'vip' then public.uncapped() when 'pro' then 1000
           when 'guest' then 5 else 60 end;
$$;

create or replace function public.scan_credits_left(p_user_id uuid)
returns integer language plpgsql stable security definer set search_path = public as $$
declare cap integer; used integer;
begin
  if public.is_staff(p_user_id) then return public.uncapped(); end if;
  cap := public.tcgscan_scan_cap(p_user_id);
  select count(*) into used from public.scan_events s
   where s.user_id = p_user_id
     and s.created_at >= (date_trunc('month', now() at time zone 'UTC') at time zone 'UTC');
  return greatest(0, cap - used);
end; $$;

-- ── the recording RPCs (check + insert atomically) ──────────────────────────────────────────

-- Takes the binder + sheet count so purchase history (purchases.tsx / fetchPrintEvents) keeps
-- showing which binder a print was spent on — print_events has those columns and the app reads
-- them. Both are optional so an older caller passing nothing still records a valid credit.
create or replace function public.record_print_event(
  p_binder_id uuid default null, p_sheets integer default null
) returns json language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); w record; used integer; left_after integer;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into w from public.michi_print_window(uid);

  -- Serialize this user's concurrent print recordings: two tabs must not both pass on one credit.
  perform pg_advisory_xact_lock(hashtext('print_event:' || uid::text));

  select count(*) into used from public.print_events p
   where p.user_id = uid and p.created_at >= w.window_start;

  if not public.is_staff(uid) and used >= w.allocation then
    raise exception 'tier_cap_exceeded:includedPrintsPerMonth (% of %)', used, w.allocation
      using errcode = 'P0001';
  end if;

  insert into public.print_events (user_id, binder_id, sheets) values (uid, p_binder_id, p_sheets);
  left_after := greatest(0, w.allocation - (used + 1));
  return json_build_object('recorded', true, 'used', used + 1,
                           'allocation', w.allocation, 'left', left_after,
                           'window_start', w.window_start);
end; $$;

create or replace function public.record_scan_event(p_card_id text default null)
returns json language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); cap integer; used integer; win timestamptz;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  cap := public.tcgscan_scan_cap(uid);
  win := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';

  perform pg_advisory_xact_lock(hashtext('scan_event:' || uid::text));

  select count(*) into used from public.scan_events s
   where s.user_id = uid and s.created_at >= win;

  if not public.is_staff(uid) and used >= cap then
    raise exception 'tier_cap_exceeded:cardScansPerMonth (% of %)', used, cap
      using errcode = 'P0001';
  end if;

  insert into public.scan_events (user_id, card_id) values (uid, p_card_id);
  return json_build_object('recorded', true, 'used', used + 1, 'cap', cap,
                           'left', greatest(0, cap - (used + 1)), 'window_start', win);
end; $$;

-- ── cap direct inserts too, so builds shipped before today are metered as well ──────────────

drop policy if exists "Users can record their own print events" on public.print_events;
drop policy if exists "Users can insert their own print events" on public.print_events;
create policy "Users can record their own print events within their allowance"
  on public.print_events for insert
  to authenticated
  with check (auth.uid() = user_id and public.print_credits_left(auth.uid()) > 0);

drop policy if exists "Users can record their own scan events" on public.scan_events;
create policy "Users can record their own scan events within their allowance"
  on public.scan_events for insert
  to authenticated
  with check (auth.uid() = user_id and public.scan_credits_left(auth.uid()) > 0);

-- ── grants ─────────────────────────────────────────────────────────────────────────────────
revoke all on function public.months_elapsed(timestamptz, timestamptz, integer) from public;
revoke all on function public.michi_print_rate(uuid)   from public;
revoke all on function public.michi_print_window(uuid) from public;
revoke all on function public.print_credits_left(uuid) from public;
revoke all on function public.tcgscan_scan_cap(uuid)   from public;
revoke all on function public.scan_credits_left(uuid)  from public;
revoke all on function public.record_print_event(uuid, integer) from public;
revoke all on function public.record_scan_event(text)  from public;

grant execute on function public.print_credits_left(uuid) to authenticated;
grant execute on function public.scan_credits_left(uuid)  to authenticated;
grant execute on function public.michi_print_window(uuid) to authenticated;
grant execute on function public.tcgscan_scan_cap(uuid)   to authenticated;
grant execute on function public.record_print_event(uuid, integer) to authenticated;
grant execute on function public.record_scan_event(text)  to authenticated;
