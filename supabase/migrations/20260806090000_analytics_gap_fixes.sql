-- Closes tracking gaps flagged against 20260805100000_analytics_events.sql.
-- Both apps write these tables; tcgscan-app has no migrations of its own.

alter table public.analytics_sessions
  add column if not exists upgraded_at   timestamptz,
  add column if not exists landing_route text;

comment on column public.analytics_sessions.is_guest is
  'Whether the session STARTED anonymous. Immutable after insert - see upgraded_at.';
comment on column public.analytics_sessions.upgraded_at is
  'When a guest session became a real account in place (same auth uid). Null if it never did.';

-- The existing "own sessions update" policy lets a client rewrite ANY column of its own row,
-- including started_at and is_guest - which is how the is_guest history got destroyed in the
-- first place. Pin the immutable facts server-side so a future client cannot regress it.
create or replace function public.analytics_sessions_guard()
returns trigger
language plpgsql
as $$
begin
  new.id         := old.id;
  new.user_id    := old.user_id;
  new.app        := old.app;
  new.is_guest   := old.is_guest;
  new.started_at := old.started_at;
  if new.last_seen_at < old.last_seen_at then
    new.last_seen_at := old.last_seen_at;   -- only ever moves forward
  end if;
  if old.upgraded_at is not null then
    new.upgraded_at := old.upgraded_at;     -- an upgrade happens once
  end if;
  return new;
end;
$$;

drop trigger if exists analytics_sessions_guard on public.analytics_sessions;
create trigger analytics_sessions_guard
  before update on public.analytics_sessions
  for each row execute function public.analytics_sessions_guard();
