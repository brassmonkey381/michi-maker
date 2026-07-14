-- Keep user_cards in true sync with tcgscan-app's portfolio_entries (its source of truth).
--
-- The additive client feed (increment_user_card on add/remove/edit) missed bulk paths: deleting
-- a whole collection cascade-deletes its portfolio_entries server-side, so the client never
-- fired the decrements and the michi "My collection" kept ghost cards. Row triggers see EVERY
-- change — including ON DELETE CASCADE rows and offline-sync upserts — so the rollup now
-- maintains itself in the database.
--
-- ⚠️ tcgscan-app must STOP calling increment_user_card for portfolio changes (it would double
-- count on top of the trigger). The RPC stays for michi's own writers (future CSV import).

-- Owner-explicit delta helper (the trigger's workhorse). SECURITY DEFINER because the trigger
-- must write user_cards regardless of the acting user's RLS; NOT callable via the Data API —
-- execute is revoked from every client role below.
create or replace function public.apply_user_card_delta(
  p_owner uuid,
  p_card_id text,
  p_delta integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_qty integer;
begin
  if p_delta = 0 or p_owner is null or p_card_id is null then
    return;
  end if;

  select quantity into v_qty
  from public.user_cards
  where owner_id = p_owner and card_id = p_card_id and condition = ''
  for update;

  if not found then
    if p_delta > 0 then
      insert into public.user_cards (owner_id, card_id, condition, quantity, source, acquired_at)
      values (p_owner, p_card_id, '', p_delta, 'scan', now());
    end if;
    return;
  end if;

  v_qty := v_qty + p_delta;
  if v_qty <= 0 then
    delete from public.user_cards
    where owner_id = p_owner and card_id = p_card_id and condition = '';
  else
    update public.user_cards
      set quantity = v_qty
      where owner_id = p_owner and card_id = p_card_id and condition = '';
  end if;
end;
$$;

revoke execute on function public.apply_user_card_delta(uuid, text, integer) from public;
revoke execute on function public.apply_user_card_delta(uuid, text, integer) from anon;
revoke execute on function public.apply_user_card_delta(uuid, text, integer) from authenticated;

create or replace function public.sync_user_cards_from_portfolio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.apply_user_card_delta(new.user_id, new.card_id, new.quantity);
  elsif tg_op = 'DELETE' then
    perform public.apply_user_card_delta(old.user_id, old.card_id, -old.quantity);
  else
    if new.user_id = old.user_id and new.card_id = old.card_id then
      perform public.apply_user_card_delta(new.user_id, new.card_id, new.quantity - old.quantity);
    else
      -- the entry was repointed (sync merge) — move its copies between rollup rows
      perform public.apply_user_card_delta(old.user_id, old.card_id, -old.quantity);
      perform public.apply_user_card_delta(new.user_id, new.card_id, new.quantity);
    end if;
  end if;
  return null;
end;
$$;

create trigger portfolio_entries_sync_user_cards
  after insert or update or delete on public.portfolio_entries
  for each row execute function public.sync_user_cards_from_portfolio();

-- One-time resync: rebuild the scan-sourced rollup from the portfolio truth (fixes the ghost
-- cards left by the deleted collection). Rows michi wrote itself (source import/manual) are
-- preserved; a same-card import row absorbs the scan count, matching the trigger's behaviour.
delete from public.user_cards where source = 'scan';
insert into public.user_cards (owner_id, card_id, condition, quantity, source)
select user_id, card_id, '', sum(quantity), 'scan'
from public.portfolio_entries
group by user_id, card_id
having sum(quantity) > 0
on conflict (owner_id, card_id, condition)
  do update set quantity = public.user_cards.quantity + excluded.quantity;
