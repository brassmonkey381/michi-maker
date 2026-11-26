-- MIC-041: the Want list and the Trade list (owner, 2026-11-26).
--
-- WHERE THESE LIVE, AND WHY NOT ON portfolio_entries. portfolio_entries belongs to BiBo's sync
-- (tcgscan-app src/lib/sync.ts pushDelta): it upserts entries by id with its own column list and
-- hard-deletes them by id. Anything Michi kept on those rows would sit inside another app's
-- offline-first merge. So both lists are Michi-owned tables that BiBo never reads or writes:
--   - card_wants: per CARD, with a quantity ("I want 2 more of this").
--   - entry_trades: per owned COPY (one portfolio_entries row; a lot of 3 can offer 1). Keyed to
--     the entry id with ON DELETE CASCADE, so a copy BiBo deletes takes its trade mark with it.
-- profiles.show_lists (off by default) lets other people see both lists on the profile page,
-- through public_collection_lists(), which returns nothing unless it is on.
-- ADDITIVE: new tables, one new nullable-safe column, one function. No change to any BiBo table.
begin;

-- Wants ---------------------------------------------------------------------------------------
create table if not exists public.card_wants (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_id    text not null check (char_length(card_id) between 1 and 120),
  quantity   integer not null default 1 check (quantity between 1 and 99),
  note       text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

alter table public.card_wants enable row level security;
drop policy if exists "card_wants_select_own" on public.card_wants;
drop policy if exists "card_wants_insert_own" on public.card_wants;
drop policy if exists "card_wants_update_own" on public.card_wants;
drop policy if exists "card_wants_delete_own" on public.card_wants;
create policy "card_wants_select_own" on public.card_wants for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "card_wants_insert_own" on public.card_wants for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "card_wants_update_own" on public.card_wants for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "card_wants_delete_own" on public.card_wants for delete to authenticated
  using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.card_wants to authenticated;

-- Trades --------------------------------------------------------------------------------------
create table if not exists public.entry_trades (
  entry_id   text primary key references public.portfolio_entries (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  quantity   integer not null default 1 check (quantity between 1 and 999),
  note       text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists entry_trades_user_id_idx on public.entry_trades (user_id);

alter table public.entry_trades enable row level security;
drop policy if exists "entry_trades_select_own" on public.entry_trades;
drop policy if exists "entry_trades_insert_own" on public.entry_trades;
drop policy if exists "entry_trades_update_own" on public.entry_trades;
drop policy if exists "entry_trades_delete_own" on public.entry_trades;
create policy "entry_trades_select_own" on public.entry_trades for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "entry_trades_insert_own" on public.entry_trades for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "entry_trades_update_own" on public.entry_trades for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "entry_trades_delete_own" on public.entry_trades for delete to authenticated
  using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.entry_trades to authenticated;

-- A trade mark names a copy you own, and never offers more copies than the entry holds. (BiBo
-- may lower an entry's quantity later; readers clamp with least(), so that never needs a write.)
create or replace function public.entry_trades_check()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  owner uuid;
  qty integer;
begin
  select e.user_id, e.quantity into owner, qty from public.portfolio_entries e where e.id = new.entry_id;
  if owner is null or owner <> new.user_id then
    raise exception 'entry_trades: not your copy' using errcode = '42501';
  end if;
  if new.quantity > greatest(qty, 1) then
    new.quantity := greatest(qty, 1);
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists entry_trades_check on public.entry_trades;
create trigger entry_trades_check before insert or update on public.entry_trades
  for each row execute function public.entry_trades_check();

-- Who may see the lists -------------------------------------------------------------------------
alter table public.profiles add column if not exists show_lists boolean not null default false;

-- Both lists for one profile, only when its owner turned show_lists on. Card ids, quantities and
-- the copy's variant/condition only: never purchase prices, dates, storage or scans.
create or replace function public.public_collection_lists(p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when coalesce((select p.show_lists from public.profiles p where p.id = p_user), false) then
    jsonb_build_object(
      'wants', coalesce((
        select jsonb_agg(jsonb_build_object('card_id', w.card_id, 'quantity', w.quantity) order by w.updated_at desc)
        from public.card_wants w where w.user_id = p_user), '[]'::jsonb),
      'trades', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'card_id', e.card_id, 'variant', e.variant, 'condition', e.condition,
                 'quantity', least(t.quantity, greatest(e.quantity, 1))) order by t.updated_at desc)
        from public.entry_trades t join public.portfolio_entries e on e.id = t.entry_id
        where t.user_id = p_user), '[]'::jsonb))
  else null end
$$;
revoke all on function public.public_collection_lists(uuid) from public;
grant execute on function public.public_collection_lists(uuid) to anon, authenticated;

commit;
