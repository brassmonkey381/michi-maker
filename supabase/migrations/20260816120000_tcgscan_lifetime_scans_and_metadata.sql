-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- tcgscan: LIFETIME scan count, and per-scan metadata on scan_events
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Two changes, both driven by scanning going uncapped (20260815120000):
--
-- 1. LIFETIME, not monthly. The usage panel used to read "Card scans this month · 0 / 5". With no
--    cap there is nothing to count toward, so the monthly framing measures nothing — a window that
--    resets is only interesting when something runs out. `tcgscan_scan_usage` now also returns
--    `lifetime`: every scan this account has ever confirmed. The windowed figures stay in the
--    payload so builds shipped before today keep working unchanged.
--
-- 2. PER-SCAN METADATA. scan_events recorded only (user, card, when), so "how many of my scans were
--    certain?" was unanswerable. Three nullable columns now carry the loop's own answer.
--
-- NOTHING IS BACKFILLED (owner call 2026-08-16). The 783 rows that predate this keep NULL, which
-- reads as "recorded before we tracked this" — distinct from a genuine unknown on a new row. Any
-- rollup must therefore count NULLs as unclassified rather than assuming a default.
--
-- The metering mechanism is deliberately untouched: record_scan_event still spends under the same
-- advisory lock, still re-checks the cap (which is uncapped() now), and the RLS insert policy still
-- carries its allowance predicate. Only the payload grew.

-- ── 1. metadata columns (all nullable, no backfill) ─────────────────────────────────────────
alter table public.scan_events
  add column if not exists confidence text,
  add column if not exists auto_added boolean,
  add column if not exists mode       text;

-- NULL always passes: an old client, or a call site that genuinely cannot say, records nothing
-- rather than guessing a value that would later be mined as fact.
alter table public.scan_events drop constraint if exists scan_events_confidence_check;
alter table public.scan_events add constraint scan_events_confidence_check
  check (confidence is null or confidence in ('certain', 'likely', 'unsure'));

alter table public.scan_events drop constraint if exists scan_events_mode_check;
alter table public.scan_events add constraint scan_events_mode_check
  check (mode is null or mode in ('single', 'riffle', 'binder'));

comment on column public.scan_events.confidence is
  'The tracker''s tier for this card at commit: certain | likely | unsure. NULL = not reported '
  '(client predates the field, or the surface has no tier). Only ''certain'' commits unattended.';
comment on column public.scan_events.auto_added is
  'true = the hands-free live loop added this with no tap (binder page commit / riffle run commit). '
  'false = a person confirmed it from a results list. NULL = not reported.';
comment on column public.scan_events.mode is
  'Which scan surface produced it: single (one photo / results list) | riffle | binder. NULL = not '
  'reported.';

-- (user_id, created_at) already indexed — its user_id prefix serves the lifetime count.

-- ── 2. record_scan_event: same metering, wider payload ──────────────────────────────────────
-- DROP then create, NOT create-or-replace: adding defaulted parameters makes an OVERLOAD rather
-- than a replacement, and a one-named-argument call (`{p_card_id}`, which every shipped client
-- sends) would then be ambiguous between the two and fail. Dropping is safe precisely BECAUSE the
-- new parameters default to NULL: those existing clients bind p_card_id and record NULL metadata.
drop function if exists public.record_scan_event(text);

create or replace function public.record_scan_event(
  p_card_id    text    default null,
  p_confidence text    default null,
  p_auto_added boolean default null,
  p_mode       text    default null
) returns json language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); cap integer; used integer; life integer; w record;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  cap := public.tcgscan_scan_cap(uid);
  select * into w from public.tcgscan_scan_window(uid);

  perform pg_advisory_xact_lock(hashtext('scan_event:' || uid::text));

  select count(*) into used from public.scan_events s
   where s.user_id = uid and s.created_at >= w.win_start;

  if not public.is_staff(uid) and used >= cap then
    raise exception 'tier_cap_exceeded:cardScansPerMonth (% of %)', used, cap using errcode = 'P0001';
  end if;

  insert into public.scan_events (user_id, card_id, confidence, auto_added, mode)
  values (uid, p_card_id, p_confidence, p_auto_added, p_mode);

  select count(*) into life from public.scan_events s where s.user_id = uid;

  return json_build_object('recorded', true, 'used', used + 1, 'cap', cap,
                           'left', greatest(0, cap - (used + 1)),
                           'window_start', w.win_start, 'resets_at', w.resets_at,
                           'lifetime', life);
end; $$;

-- ── 3. tcgscan_scan_usage: add the lifetime total ───────────────────────────────────────────
create or replace function public.tcgscan_scan_usage()
returns json language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); cap integer; used integer; life integer; w record;
begin
  if uid is null then
    return json_build_object('used', 0, 'cap', 0, 'left', 0, 'resets_at', null, 'lifetime', 0);
  end if;
  select * into w from public.tcgscan_scan_window(uid);
  select count(*) into life from public.scan_events s where s.user_id = uid;
  -- Staff read as unmetered, but their lifetime total is real: it is a usage figure now, not an
  -- allowance, so zeroing it would hide activity that actually happened.
  if public.is_staff(uid) then
    return json_build_object('used', 0, 'cap', public.uncapped(), 'left', public.uncapped(),
                             'resets_at', w.resets_at, 'lifetime', life);
  end if;
  cap := public.tcgscan_scan_cap(uid);
  select count(*) into used from public.scan_events s
   where s.user_id = uid and s.created_at >= w.win_start;
  return json_build_object('used', used, 'cap', cap, 'left', greatest(0, cap - used),
                           'resets_at', w.resets_at, 'lifetime', life);
end; $$;

-- ── grants (the drop above took record_scan_event's with it) ────────────────────────────────
revoke all on function public.record_scan_event(text, text, boolean, text) from public;
grant execute on function public.record_scan_event(text, text, boolean, text) to authenticated, anon;
grant execute on function public.tcgscan_scan_usage() to authenticated, anon;
