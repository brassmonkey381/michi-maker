-- TCG-040: a history of where each card sat, so a binder can be put back.
--
-- portfolio_entries is last-write-wins per row with no history, so when a client rewrote every
-- pocket of a binder (a page-shape reflow, 2026-11-23) the scanned positions were simply gone:
-- the server kept the order and nothing else. This logs the OLD placement of a row whenever its
-- storage_id / storage_page / storage_pos / storage_rows / storage_cols change, written by a
-- trigger, so it costs the clients nothing and no client can skip it.
--
-- Rows carry the writing transaction (txid), so "the bulk change at 20:44" is one id to roll back.
-- Owners can read their own history; nobody writes it but the trigger.
--
-- NEVER REJECTS A SYNC UPSERT: the trigger is AFTER UPDATE, writes a table with no constraint
-- beyond its key, and swallows its own errors, because one rejected row poisons the sync queue
-- (see 20260828140000_entry_page_shape.sql).
--
-- Kept 180 days by prune_entry_placement_history() (run by hand or from a scheduled job).

create table if not exists public.entry_placement_history (
  id               bigint generated always as identity primary key,
  user_id          uuid not null,
  entry_id         text not null,
  collection_id    text,
  changed_at       timestamptz not null default now(),
  txid             bigint not null default txid_current(),
  old_storage_id   text,
  old_storage_page integer,
  old_storage_pos  integer,
  old_storage_rows integer,
  old_storage_cols integer,
  new_storage_id   text,
  new_storage_page integer,
  new_storage_pos  integer,
  new_storage_rows integer,
  new_storage_cols integer
);

create index if not exists entry_placement_history_user_time_idx
  on public.entry_placement_history (user_id, changed_at desc);
create index if not exists entry_placement_history_entry_idx
  on public.entry_placement_history (entry_id, changed_at desc);

alter table public.entry_placement_history enable row level security;

drop policy if exists entry_placement_history_owner_read on public.entry_placement_history;
create policy entry_placement_history_owner_read on public.entry_placement_history
  for select to authenticated using (user_id = auth.uid());

revoke insert, update, delete on public.entry_placement_history from anon, authenticated;

create or replace function public.log_entry_placement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into public.entry_placement_history (
      user_id, entry_id, collection_id,
      old_storage_id, old_storage_page, old_storage_pos, old_storage_rows, old_storage_cols,
      new_storage_id, new_storage_page, new_storage_pos, new_storage_rows, new_storage_cols)
    values (
      old.user_id, old.id, old.collection_id,
      old.storage_id, old.storage_page, old.storage_pos, old.storage_rows, old.storage_cols,
      new.storage_id, new.storage_page, new.storage_pos, new.storage_rows, new.storage_cols);
  exception when others then
    -- History is a safety net; it must never be the reason a card fails to sync.
    null;
  end;
  return null;
end;
$$;

revoke execute on function public.log_entry_placement() from public, anon, authenticated;

drop trigger if exists portfolio_entries_placement_history on public.portfolio_entries;
create trigger portfolio_entries_placement_history
  after update on public.portfolio_entries
  for each row
  when (
    old.storage_id      is distinct from new.storage_id
    or old.storage_page is distinct from new.storage_page
    or old.storage_pos  is distinct from new.storage_pos
    or old.storage_rows is distinct from new.storage_rows
    or old.storage_cols is distinct from new.storage_cols
  )
  execute function public.log_entry_placement();

create or replace function public.prune_entry_placement_history()
returns integer
language sql
security definer
set search_path = public
as $$
  with gone as (
    delete from public.entry_placement_history
    where changed_at < now() - interval '180 days'
    returning 1
  )
  select count(*)::integer from gone;
$$;

revoke execute on function public.prune_entry_placement_history() from public, anon, authenticated;
