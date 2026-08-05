-- First-party in-app analytics spine, shared by michi-maker and tcgscan-app (both live on this
-- project, piikwvntldytjejxmcla). Two tables:
--   * analytics_sessions - one row per app-open (who, which app, guest or not, platform).
--   * analytics_events    - append-only, one row per binary occurrence (name + props jsonb).
-- A user journey is just: select name, ts, props from analytics_events where user_id = X order by ts.
-- Clients may only INSERT/SELECT their OWN rows. The studio reads across all users through
-- security-definer RPCs guarded by is_admin(); there is deliberately no broad table read policy.
-- This is first-party only: data never leaves this Supabase project.

-- ---------------------------------------------------------------------------
-- Admin flag. There was no admin concept before; the studio needs one. Self-applies to the owner.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

update public.profiles p
  set is_admin = true
  from auth.users u
  where u.id = p.id
    and u.email = 'bstockman1@gmail.com';

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------------
-- analytics_sessions: one row per app-open.
-- ---------------------------------------------------------------------------
create table if not exists public.analytics_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  app          text not null check (app in ('michi', 'tcgscan')),
  is_guest     boolean not null default false,
  platform     text,
  app_version  text,
  started_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists analytics_sessions_user_started_idx
  on public.analytics_sessions (user_id, started_at desc);

alter table public.analytics_sessions enable row level security;

create policy "own sessions insert" on public.analytics_sessions
  for insert to authenticated with check (auth.uid() = user_id);
create policy "own sessions select" on public.analytics_sessions
  for select to authenticated using (auth.uid() = user_id);
create policy "own sessions update" on public.analytics_sessions
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- analytics_events: append-only. No UPDATE/DELETE policy for anyone (not even the owner) - the
-- ledger is immutable from the client.
-- ---------------------------------------------------------------------------
create table if not exists public.analytics_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id uuid references public.analytics_sessions(id) on delete set null,
  app        text not null check (app in ('michi', 'tcgscan')),
  name       text not null,
  props      jsonb not null default '{}'::jsonb,
  ts         timestamptz not null default now()
);

create index if not exists analytics_events_user_ts_idx  on public.analytics_events (user_id, ts);
create index if not exists analytics_events_name_ts_idx  on public.analytics_events (name, ts desc);
create index if not exists analytics_events_app_ts_idx   on public.analytics_events (app, ts desc);

alter table public.analytics_events enable row level security;

create policy "own events insert" on public.analytics_events
  for insert to authenticated with check (auth.uid() = user_id);
create policy "own events select" on public.analytics_events
  for select to authenticated using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Admin read surface. security definer + is_admin() guard lets the studio read across all users
-- without exposing a broad table read policy to ordinary clients.
-- ---------------------------------------------------------------------------

-- Recent users with a rollup, newest activity first. Powers the studio's user list.
create or replace function public.admin_recent_users(p_app text default null, p_limit int default 200)
returns table (
  user_id       uuid,
  username      text,
  display_name  text,
  event_count   bigint,
  session_count bigint,
  first_seen    timestamptz,
  last_seen     timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.user_id,
    pr.username,
    pr.display_name,
    count(*)                     as event_count,
    count(distinct e.session_id) as session_count,
    min(e.ts)                    as first_seen,
    max(e.ts)                    as last_seen
  from public.analytics_events e
  left join public.profiles pr on pr.id = e.user_id
  where public.is_admin()
    and (p_app is null or e.app = p_app)
  group by e.user_id, pr.username, pr.display_name
  order by max(e.ts) desc
  limit greatest(1, least(p_limit, 1000));
$$;

-- Full ordered timeline for one user. Powers the per-person journey view.
create or replace function public.admin_user_journey(target_user uuid, p_app text default null)
returns setof public.analytics_events
language sql
stable
security definer
set search_path = public
as $$
  select e.*
  from public.analytics_events e
  where public.is_admin()
    and e.user_id = target_user
    and (p_app is null or e.app = p_app)
  order by e.ts asc;
$$;

-- Event-name funnel (counts + distinct users). For later aggregate views; cheap to keep now.
create or replace function public.admin_event_funnel(p_app text default null)
returns table (name text, event_count bigint, user_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select e.name, count(*) as event_count, count(distinct e.user_id) as user_count
  from public.analytics_events e
  where public.is_admin()
    and (p_app is null or e.app = p_app)
  group by e.name
  order by count(*) desc;
$$;

grant execute on function public.is_admin()                       to authenticated;
grant execute on function public.admin_recent_users(text, int)    to authenticated;
grant execute on function public.admin_user_journey(uuid, text)   to authenticated;
grant execute on function public.admin_event_funnel(text)         to authenticated;
