-- The user_cards rollup skips SEALED entries.
--
-- portfolio_entries now carries item_kind (20260831120000): null = a card, 'sealed' = a sealed
-- product whose card_id is a sealed productId. The rollup exists to answer "which CARDS does
-- this account own" — it feeds michi's MyCollection tiles, the owned ✓ on binder pockets, and
-- the free-copy maths behind "fill from my collection". A sealed booster box is none of those
-- things: rolled up, it renders as a broken blank tile and gets offered to binder pockets as a
-- card nobody can resolve.
--
-- The trigger function is replaced with an item_kind-aware copy. Old clients cannot create
-- sealed entries (they never send the column), and their EDITS of one omit the column too — but
-- an omitted column in an UPSERT leaves the stored value untouched, so NEW/OLD here still carry
-- 'sealed' and the guard holds for every path.
--
-- The transition guards (kind flipping on an UPDATE) are deliberately handled: a row that
-- BECOMES sealed backs its copies out of the rollup, and one that stops being sealed adds them.
-- No client writes item_kind after birth, but sync replaceAll re-upserts whole rows, and a
-- trigger that assumed immutability would silently corrupt counts the first time that
-- assumption slipped.

create or replace function public.sync_user_cards_from_portfolio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.item_kind is distinct from 'sealed' then
      perform public.apply_user_card_delta(new.user_id, new.card_id, new.quantity);
    end if;
  elsif tg_op = 'DELETE' then
    if old.item_kind is distinct from 'sealed' then
      perform public.apply_user_card_delta(old.user_id, old.card_id, -old.quantity);
    end if;
  else
    -- Back out the OLD row's contribution and add the NEW row's, each only when that side was a
    -- card. Collapses to the previous delta arithmetic when neither side is sealed and the
    -- identity did not move.
    if old.item_kind is distinct from 'sealed'
       and new.item_kind is distinct from 'sealed'
       and new.user_id = old.user_id and new.card_id = old.card_id then
      perform public.apply_user_card_delta(new.user_id, new.card_id, new.quantity - old.quantity);
    else
      if old.item_kind is distinct from 'sealed' then
        perform public.apply_user_card_delta(old.user_id, old.card_id, -old.quantity);
      end if;
      if new.item_kind is distinct from 'sealed' then
        perform public.apply_user_card_delta(new.user_id, new.card_id, new.quantity);
      end if;
    end if;
  end if;
  return null;
end;
$$;

-- Sweep any sealed strays that reached the rollup between the column landing and this filter
-- (none are expected: no shipped client writes item_kind yet). Scan-sourced rows only — rows
-- michi wrote itself are not the trigger's to clean.
delete from public.user_cards uc
where uc.source = 'scan'
  and exists (
    select 1 from public.portfolio_entries pe
    where pe.user_id = uc.owner_id
      and pe.card_id = uc.card_id
      and pe.item_kind = 'sealed'
  )
  and not exists (
    select 1 from public.portfolio_entries pe
    where pe.user_id = uc.owner_id
      and pe.card_id = uc.card_id
      and pe.item_kind is distinct from 'sealed'
  );
