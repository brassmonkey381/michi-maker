-- Per-account UI preferences — a small, additive jsonb bag on the profile so new preferences
-- don't each need their own column + migration.
--
-- First key: `cardLanguages` (["en"] | ["ja"] | ["en","ja"]) — the EN/JP browse-language toggle,
-- shared by the Home "Recent & Upcoming" feed and the Browse page. Persisting it on the profile
-- lets a signed-in collector's language choice follow them across devices (guests fall back to
-- device-local storage).
--
-- No new RLS: the existing owner-scoped "Users can update their own profile" policy (using +
-- with check on id) already governs writes, and the username-immutability trigger only guards the
-- username column. Public read of profiles stays as-is — a language choice is not secret.
alter table public.profiles
  add column if not exists preferences jsonb not null default '{}'::jsonb;
