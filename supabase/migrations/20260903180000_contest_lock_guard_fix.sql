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
  v_binder uuid;
  v_row    record;
begin
  -- ONE choice of record, made once. Every path below reads v_row and returns it, so the
  -- unassigned record is never touched at all.
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;

  -- The service role passes straight through: the snapshot script, prize fulfilment and any manual
  -- repair have to be able to touch a locked binder, and they are us.
  if (select auth.uid()) is null then
    return v_row;
  end if;

  v_binder := case tg_table_name
    when 'binders' then v_row.id
    when 'binder_pages' then v_row.binder_id
    when 'binder_slots' then (
      select pg.binder_id from public.binder_pages pg where pg.id = v_row.page_id
    )
  end;

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
