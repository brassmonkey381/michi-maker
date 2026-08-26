-- Durable per-browser/install device id on analytics sessions (ANALYTICS-GUEST-DEVICE-ID.md).
-- A random opaque UUID the clients mint once and store (localStorage / AsyncStorage) — a
-- coincidence key, never a fingerprint. Groups the anonymous uids one browser mints across
-- storage resets, so "guest devices" vs "guest uids" becomes measurable instead of assumed.
--
-- Nullable on purpose: every existing row predates the column and must stay readable.
-- DO NOT BACKFILL — there is no honest value to put there, and a guessed one would be
-- indistinguishable from a measured one forever after.
--
-- No RLS change: the existing "own sessions insert" policy already covers the column, and the
-- studio reads through the Management API.

alter table public.analytics_sessions
  add column if not exists device_id text;

create index if not exists analytics_sessions_device_idx
  on public.analytics_sessions (device_id, started_at desc)
  where device_id is not null;
