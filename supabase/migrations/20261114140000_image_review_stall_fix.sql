-- MIC-029 gap 3 fix-forward. 20261114130000 went live 2026-11-15 00:27Z, but every reason branch
-- raised 22P02 "malformed array literal": appending a bare 'schedule silent ...' literal with || reads the untyped
-- literal as text[], not as one element. So image_review_stall(), admin_health() and the stall
-- email would all error exactly when a stall happened. Same function, every append now
-- array_append(r, <text>). Nothing else changes (admin_health() already calls it).

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
    r := array_append(r, ('queue not moving: ' || waiting || ' waiting, oldest since ' || to_char(oldest_waiting at time zone 'UTC', 'MM-DD HH24:MI') || ' UTC')::text);
  end if;
  if bad_calls_1h >= 10 then
    r := array_append(r, (bad_calls_1h || ' failed calls to the check in the last hour')::text);
  end if;
  if job_active is null then
    r := array_append(r, 'schedule missing'::text);
  elsif not job_active then
    r := array_append(r, 'schedule paused'::text);
  elsif coalesce(cron_last_run, '-infinity') < p_now - interval '15 minutes' then
    r := array_append(r, 'schedule silent for 15+ minutes'::text);
  end if;
  if failed_runs >= 5 then
    r := array_append(r, (failed_runs || ' failed schedule runs in the last hour')::text);
  end if;

  reasons := r;
  stalled := cardinality(r) > 0;
  return next;
end $fn$;
revoke all on function public.image_review_stall(timestamptz) from public;
revoke execute on function public.image_review_stall(timestamptz) from anon, authenticated;
grant execute on function public.image_review_stall(timestamptz) to service_role;

commit;
