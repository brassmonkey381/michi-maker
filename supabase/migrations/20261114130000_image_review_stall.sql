-- MIC-029 audit 2026-11-14, gap 3 (owner "fix all art check gaps"): a silent stall.
-- The check fails CLOSED (visitors see an empty pocket, never unchecked art), but nothing said when
-- it stopped: no email, no Studio signal. Now:
--   image_review_stall(p_now)  one place that decides "stuck", with reasons:
--     - pictures waiting over an hour while nothing finished in that hour (queue not moving)
--     - 10+ failed calls to the image-review function in the last hour (key missing, 4xx/5xx, timeouts)
--     - the every-minute schedule missing, paused, or silent for 15 minutes
--     - 5+ failed schedule runs in the last hour
--   admin_health() gains an 'Image check' row (Studio's Health panel; red when stalled).
--   The image-review function emails the admin when stalled, at most every 6 hours (admin_notices
--   kind 'image-review-stall'). That email needs the function to run; a dead schedule shows in
--   Studio only.
-- p_now exists so a test can ask "would this be stalled in 3 hours?" without waiting.

begin;

create or replace function public.image_review_stall(p_now timestamptz default now())
returns table (stalled boolean, reasons text[], waiting int, oldest_waiting timestamptz,
               last_finished timestamptz, bad_calls_1h int, cron_last_run timestamptz)
language plpgsql stable security definer set search_path = public as $fn$
declare
  r text[] := '{}';
  job_active boolean;
  failed_runs int := 0;
begin
  select count(*)::int, min(created_at) into waiting, oldest_waiting
    from public.image_reviews where status in ('queued', 'working', 'error') and created_at <= p_now;
  select max(checked_at) into last_finished from public.image_reviews where status = 'done' and checked_at <= p_now;

  bad_calls_1h := 0;
  begin
    select count(*)::int into bad_calls_1h from net._http_response
     where created > p_now - interval '1 hour' and created <= p_now
       and (status_code is null or status_code not between 200 and 299);
  exception when others then bad_calls_1h := 0; -- pg_net absent: the schedule check below says so
  end;

  begin
    select j.active, (select max(d.start_time) from cron.job_run_details d where d.jobid = j.jobid and d.start_time <= p_now),
           (select count(*)::int from cron.job_run_details d where d.jobid = j.jobid and d.status = 'failed'
             and d.start_time > p_now - interval '1 hour' and d.start_time <= p_now)
      into job_active, cron_last_run, failed_runs
      from cron.job j where j.jobname = 'image-review';
  exception when others then job_active := null;
  end;

  if waiting > 0 and oldest_waiting < p_now - interval '1 hour'
     and coalesce(last_finished, '-infinity') < p_now - interval '1 hour' then
    r := r || ('queue not moving: ' || waiting || ' waiting, oldest since ' || to_char(oldest_waiting at time zone 'UTC', 'MM-DD HH24:MI') || ' UTC');
  end if;
  if bad_calls_1h >= 10 then
    r := r || (bad_calls_1h || ' failed calls to the check in the last hour');
  end if;
  if job_active is null then
    r := r || 'schedule missing';
  elsif not job_active then
    r := r || 'schedule paused';
  elsif coalesce(cron_last_run, '-infinity') < p_now - interval '15 minutes' then
    r := r || 'schedule silent for 15+ minutes';
  end if;
  if failed_runs >= 5 then
    r := r || (failed_runs || ' failed schedule runs in the last hour');
  end if;

  reasons := r;
  stalled := cardinality(r) > 0;
  return next;
end $fn$;
revoke all on function public.image_review_stall(timestamptz) from public;
revoke execute on function public.image_review_stall(timestamptz) from anon, authenticated;
grant execute on function public.image_review_stall(timestamptz) to service_role;

create or replace function public.admin_health()
returns table (signal text, at timestamptz, detail text)
language sql stable security definer set search_path = public as $$
  select * from (
    select 'Stripe webhook wrote' as signal,
           (select max(granted_at) from public.entitlements where source = 'stripe') as at,
           (select count(*)::text || ' Stripe rows all-time' from public.entitlements where source = 'stripe') as detail
    union all
    select 'RevenueCat webhook wrote',
           (select max(granted_at) from public.entitlements where source in ('apple', 'google')),
           (select count(*)::text || ' Apple/Google rows all-time' from public.entitlements where source in ('apple', 'google'))
    union all
    select 'Free trial started',
           (select max(started_at) from public.pro_trials),
           (select count(*)::text || ' trials all-time' from public.pro_trials)
    union all
    select 'Account created',
           (select max(created_at) from auth.users where not coalesce(is_anonymous, false)),
           (select count(*)::text || ' accounts, guests not counted' from auth.users where not coalesce(is_anonymous, false))
    union all
    select 'Michi event recorded',
           (select e.ts from public.analytics_events e
             where e.app = 'michi'
               and not exists (select 1 from auth.users u where u.id = e.user_id and u.is_anonymous)
             order by e.ts desc limit 1),
           (select count(*)::text || ' signed-in sessions in the last 24h, guests not counted'
              from public.analytics_sessions s
             where s.app = 'michi' and s.started_at >= now() - interval '24 hours'
               and not exists (select 1 from auth.users u where u.id = s.user_id and u.is_anonymous))
    union all
    select 'TCGScan event recorded',
           (select e.ts from public.analytics_events e
             where e.app = 'tcgscan'
               and not exists (select 1 from auth.users u where u.id = e.user_id and u.is_anonymous)
             order by e.ts desc limit 1),
           (select count(*)::text || ' signed-in sessions in the last 24h, guests not counted'
              from public.analytics_sessions s
             where s.app = 'tcgscan' and s.started_at >= now() - interval '24 hours'
               and not exists (select 1 from auth.users u where u.id = s.user_id and u.is_anonymous))
    union all
    select 'Daily puzzle scheduled through',
           (select max(publish_on)::timestamptz from public.daily_puzzles),
           case when (select max(publish_on) from public.daily_puzzles) is null then 'no puzzle has ever been published'
                else (select count(*)::text || ' puzzle day(s) still ahead' from public.daily_puzzles where publish_on > current_date) end
    union all
    select 'Content report filed',
           (select max(created_at) from public.content_reports),
           (select count(*) filter (where status = 'open')::text || ' open' from public.content_reports)
    union all
    -- MIC-029 gap 3: the image safety check. 'at' is the last picture it finished; the detail starts
    -- with 'Stalled:' when image_review_stall() says it is stuck (the Studio row turns red on that).
    select 'Image check',
           (select st.last_finished from public.image_review_stall() st),
           (select case when st.stalled then 'Stalled: ' || array_to_string(st.reasons, '; ')
                        else st.waiting::text || ' waiting, ' || st.bad_calls_1h::text || ' failed calls in the last hour' end
              from public.image_review_stall() st)
  ) x
  where public.is_admin();
$$;
revoke all on function public.admin_health() from public;
revoke execute on function public.admin_health() from anon;
grant execute on function public.admin_health() to authenticated;

commit;
