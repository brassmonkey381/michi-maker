-- tcgscan-michi-maker — REPAIR 2: contest_lock_guard still refused every page and slot write.
--
-- THE BUG, WHICH IS THE FIRST BUG AGAIN, ONE LAYER DOWN. The previous repair chose its record
-- correctly but then resolved the binder id with a single CASE expression:
--
--     v_binder := case tg_table_name
--       when 'binders'      then v_row.id
--       when 'binder_pages' then v_row.binder_id
--       when 'binder_slots' then (select ... where pg.id = v_row.page_id)
--     end;
--
-- One SQL expression, so PL/pgSQL resolves EVERY field reference in it against the row type the
-- record is actually holding — not just the branch that will be taken. Inserting a page therefore
-- died on the binder_slots branch:
--
--     record "v_row" has no field "page_id"   (42703)
--
-- Same mistake as `coalesce(new.x, old.x)`: an expression that has to be legal in every branch,
-- written as though only the matching branch would be looked at.
--
-- THE FIX, and why it is not just IF/ELSIF. Branching would work — PL/pgSQL plans a statement on
-- first execution, so an untaken branch is never resolved — but it still leaves a generic trigger
-- reading typed fields off a record whose row type changes between the three tables it serves.
-- Going through jsonb removes the class of failure rather than this instance of it: there are no
-- record field references left to resolve against the wrong type.
--
-- AND IT NOW COSTS THE WRITE PATH ALMOST NOTHING. The "is anything locked at all?" probe runs
-- before any of that work, hits the partial index, and answers no for every write on this database
-- until a contest final is actually running.
--
-- HOW THIS GOT SHIPPED TWICE. The previous repair's probe ran as the service role, which the guard
-- lets through on the second line — so it exercised the early return and proved nothing about the
-- code underneath. The verification in apply-contest-lock-fix.ps1 now runs as role `authenticated`
-- with a real uid, which is the only way any of this is reachable.
--
-- Safe to run any time, and safe to re-run.

create or replace function public.contest_lock_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row    record;
  v_json   jsonb;
  v_binder uuid;
begin
  -- One choice of record, made once: OLD is unassigned on INSERT, NEW on DELETE.
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;

  -- The service role passes straight through: the snapshot script, prize fulfilment and manual
  -- repair all have to be able to touch a locked binder, and they are us.
  if (select auth.uid()) is null then
    return v_row;
  end if;

  -- THE FAST PATH, and the one that runs on essentially every write this app makes. Outside a
  -- contest final nothing is locked, and this is a single probe of the partial index
  -- contest_finalists_binder_idx before any per-row work happens at all.
  if not exists (select 1 from public.contest_finalists where locked) then
    return v_row;
  end if;

  -- No record field references: the row goes to jsonb and the keys are looked up by name, so a
  -- column that exists on one of the three tables and not the others cannot break the others.
  v_json := to_jsonb(v_row);
  if tg_table_name = 'binders' then
    v_binder := (v_json ->> 'id')::uuid;
  elsif tg_table_name = 'binder_pages' then
    v_binder := (v_json ->> 'binder_id')::uuid;
  elsif tg_table_name = 'binder_slots' then
    select pg.binder_id into v_binder
    from public.binder_pages pg
    where pg.id = (v_json ->> 'page_id')::uuid;
  end if;

  if v_binder is null then
    return v_row;
  end if;

  if exists (
    select 1 from public.contest_finalists f
    where f.binder_id = v_binder and f.locked
  ) then
    raise exception 'This binder is a locked contest finalist and cannot be edited.'
      using errcode = '42501';
  end if;

  return v_row;
end;
$$;
