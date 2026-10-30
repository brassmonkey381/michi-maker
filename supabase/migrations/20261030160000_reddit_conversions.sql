-- REDDIT CONVERSIONS, SERVER-SIDE (owner, 2026-10-30, via analytics-studio: "send SignUp to the
-- Reddit Conversions API server-side, alongside the pixel"). Events Manager showed the browser
-- pixel losing about one event in six to blockers and webviews, so the reddit-capi edge function
-- sends SignUp from the server too, with the same conversion_id (the uid) so Reddit dedupes the
-- pair. THIS table is the once-per-account guard: the function inserts the row FIRST and only
-- posts to Reddit when the insert landed, so a double call (two tabs, a retry, a guest upgrade
-- that also looks like a fresh sign-in) can never send twice.
--
-- One row per (user, event). No client policy of any kind: RLS is on and only the function's
-- service key writes or reads. Cascades with the account.

create table if not exists public.reddit_conversions (
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null check (event_type in ('SignUp')),
  sent_at timestamptz not null default now(),
  -- Reddit's HTTP status for the post, null until it answers (a crash between insert and post
  -- leaves the row, which is the right failure: never two).
  status int,
  -- Whether a click id rode along (the value itself is not kept).
  had_click_id boolean not null default false,
  primary key (user_id, event_type)
);

comment on table public.reddit_conversions is
  'Once-per-account guard for the reddit-capi edge function (server-side Reddit Conversions API SignUp). Service role only. See supabase/functions/reddit-capi.';

alter table public.reddit_conversions enable row level security;
-- No policies: nothing but the service key reaches this table.
