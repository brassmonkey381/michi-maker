-- MKT-040: one row per view of the static landing page (/landing-v2).
--
-- Why: since ba871c8 (2026-11-18 05:42Z) a first web visit to "/" goes to a static HTML landing that
-- loads no app code, so a visitor who reads it and leaves made no analytics_sessions row and no
-- event. analytics_events cannot take these rows: user_id is not null and references auth.users,
-- and minting an anonymous account for every landing bounce is the guest bloat MIC-052 fights.
--
-- So: a separate table with NO client policies (nobody can read or write it directly), written only
-- through log_landing_view(), a security-definer function the page calls with the publishable key.
-- The function keeps only what it expects and caps every size, so a junk call costs one small row.
--
-- device_id is the page's localStorage 'mm_analytics_device', the same key src/lib/analytics.ts
-- stamps on analytics_sessions.device_id, so a landing view joins to the app session that follows.
-- No IP, no full user agent, no full referrer URL (host only).

create table if not exists public.landing_views (
  id            uuid primary key default gen_random_uuid(),
  ts            timestamptz not null default now(),
  app           text not null default 'michi' check (app in ('michi')),
  page          text not null default '/landing-v2',
  device_id     text,
  params        jsonb not null default '{}'::jsonb,
  referrer_host text,
  width         int,
  headless      boolean not null default false,
  is_qa         boolean not null default false
);

create index if not exists landing_views_ts_idx on public.landing_views (ts desc);
create index if not exists landing_views_device_idx on public.landing_views (device_id, ts desc);

alter table public.landing_views enable row level security;
-- Deliberately no policies: reads go through the studio's admin path, writes through the function.

create or replace function public.log_landing_view(
  p_device   text default null,
  p_params   jsonb default '{}'::jsonb,
  p_referrer text default null,
  p_width    int default null,
  p_headless boolean default false,
  p_page     text default '/landing-v2'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  kept jsonb := '{}'::jsonb;
  k text;
  v jsonb;
  n int := 0;
begin
  if p_params is not null and jsonb_typeof(p_params) = 'object' then
    for k, v in select key, value from jsonb_each(p_params) loop
      exit when n >= 8;
      if k ~ '^(utm_[a-z_]{1,24}|code|rdt_cid)$' and jsonb_typeof(v) = 'string' then
        kept := kept || jsonb_build_object(k, left(v #>> '{}', 128));
        n := n + 1;
      end if;
    end loop;
  end if;

  insert into public.landing_views (page, device_id, params, referrer_host, width, headless, is_qa)
  values (
    case when p_page ~ '^/[a-z0-9/_-]{1,40}$' then p_page else '/landing-v2' end,
    case when p_device ~ '^[0-9a-f-]{36}$' then p_device else null end,
    kept,
    case when p_referrer ~ '^[a-z0-9.-]{1,253}$' then lower(p_referrer) else null end,
    case when p_width between 0 and 10000 then p_width else null end,
    coalesce(p_headless, false),
    coalesce(kept->>'utm_medium', '') = 'qa'
  );
end;
$$;

revoke all on function public.log_landing_view(text, jsonb, text, int, boolean, text) from public;
grant execute on function public.log_landing_view(text, jsonb, text, int, boolean, text) to anon, authenticated;
