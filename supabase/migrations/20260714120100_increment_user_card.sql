-- The additive feed from tcgscan-app into the shared public.user_cards summary.
--
-- tcgscan-app's rich portfolio (public.portfolio_entries) is the source of truth; user_cards
-- is a flattened rollup — one row per (owner, card_id, condition), summed across all of a
-- user's collections — that michi-maker reads. tcgscan calls this RPC to INCREMENT/DECREMENT
-- its contribution rather than assert an authoritative total, so its writes coexist with
-- michi's own writers (CSV import, source='import') on this shared table without clobbering
-- them. See docs/TCGSCAN-PORTFOLIO.md.
--
--   p_delta > 0  on add;  p_delta < 0  on remove / quantity decrease.
-- A decrement that reaches 0 (or below) deletes the row. A stray decrement of a row that
-- doesn't exist is a no-op (never creates a negative/zero row). Returns the resulting
-- quantity (0 when the row is gone; null for a no-op p_delta of 0).
--
-- SECURITY INVOKER: RLS on user_cards still applies and auth.uid() is the caller, so a user
-- can only ever touch their own inventory. `search_path = ''` → all names fully qualified.

create or replace function public.increment_user_card(
  p_card_id   text,
  p_condition text default '',
  p_delta     integer default 1,
  p_source    text default 'scan'
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid    := (select auth.uid());
  v_cond  text    := coalesce(p_condition, '');
  v_src   text    := case when p_source in ('scan', 'import', 'manual') then p_source else 'manual' end;
  v_qty   integer;
begin
  if v_owner is null then
    raise exception 'increment_user_card: not authenticated';
  end if;
  if p_delta = 0 then
    return null;
  end if;

  select quantity into v_qty
  from public.user_cards
  where owner_id = v_owner and card_id = p_card_id and condition = v_cond
  for update;

  if not found then
    -- No row yet: only a positive delta creates one (a stray decrement is a no-op).
    if p_delta <= 0 then
      return 0;
    end if;
    insert into public.user_cards (owner_id, card_id, condition, quantity, source, acquired_at)
    values (v_owner, p_card_id, v_cond, p_delta, v_src, now())
    on conflict (owner_id, card_id, condition)
      do update set quantity = public.user_cards.quantity + p_delta
    returning quantity into v_qty;
    return v_qty;
  end if;

  v_qty := v_qty + p_delta;
  if v_qty <= 0 then
    delete from public.user_cards
    where owner_id = v_owner and card_id = p_card_id and condition = v_cond;
    return 0;
  end if;

  update public.user_cards
    set quantity = v_qty
    where owner_id = v_owner and card_id = p_card_id and condition = v_cond;
  return v_qty;
end;
$$;

grant execute on function public.increment_user_card(text, text, integer, text) to authenticated;
