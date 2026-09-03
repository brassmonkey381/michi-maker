-- tcgscan-michi-maker — REPAIR: contest_lock_guard refused every insert and delete.
--
-- THE BUG. The guard resolved its binder id with `coalesce(new.x, old.x)` and returned
-- `coalesce(new, old)`. In PL/pgSQL only one of the two records is assigned per operation — OLD is
-- unassigned on INSERT, NEW is unassigned on DELETE — and coalesce evaluates BOTH arguments before
-- it can pick one. So every reference to the unassigned record raised
--
--     record "old" is not assigned yet
--
-- before the guard ever looked at whether the row belonged to a finalist. UPDATE was fine (both
-- records are assigned), which is exactly why it read as "editing is broken" rather than as
-- something contest-shaped: renaming a binder worked, while placing a card, duplicating a binder
-- and deleting one all failed. Deleting a binder failed through the cascade — the child deletes on
-- binder_pages / binder_slots fire this same trigger.
--
-- It refused writes on EVERY binder, not only finalists, because the failure came before the
-- lookup. With no finalists frozen yet, the lock's entire observable behaviour was breakage.
--
-- THE FIX. Branch on tg_op and touch only the record that exists. `create or replace` is enough:
-- the three triggers reference this function by name, so they pick up the new body with no DDL of
-- their own and no window where the lock is absent.
--
-- Safe to run any time, before or after the stage-two migration, and safe to re-run.

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
