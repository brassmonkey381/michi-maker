-- The free no-card PRO trial is 3 days, in both apps (owner, 2026-09-20; it was 14).
--
-- THIS IS SECTION 4 OF 20260920130000_tier_rework_caps.sql, ON ITS OWN AND AHEAD OF IT. The rest
-- of that migration (new Free caps, legacy caps, prints) belongs to a rework still in progress;
-- the trial length was wanted in production now. The SQL is the same, statement for statement,
-- so when the rework migration runs it finds trial_days() already defined identically and both
-- function bodies already rewritten, and changes nothing here.
--
-- Trials already running keep the end date they were granted: the term is fixed at grant.

create or replace function public.trial_days() returns integer
  language sql immutable set search_path = public as $$ select 3 $$;
comment on function public.trial_days() is
  'Length of the free no-card PRO trial in both apps, in days. Both start_*_trial functions read it.';

-- Both trial functions hardcode `interval '14 days'`. They are long, security-critical bodies that
-- have been redefined four times; re-typing them here to change one number is how a fifth copy
-- drifts. Instead the LIVE definition is rewritten in place: the literal becomes a call to
-- trial_days(). Idempotent: a body that no longer contains the literal is left alone.
do $$
declare fn regprocedure; def text;
begin
  foreach fn in array array[
    'public.start_pro_trial(text)'::regprocedure,
    'public.start_tcgscan_pro_trial(text)'::regprocedure
  ] loop
    def := pg_get_functiondef(fn);
    if position('interval ''14 days''' in def) > 0 then
      execute replace(def, 'interval ''14 days''', 'make_interval(days => public.trial_days())');
    end if;
  end loop;
end $$;
