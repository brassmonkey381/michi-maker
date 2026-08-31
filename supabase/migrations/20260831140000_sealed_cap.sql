-- enforce_card_cap splits by item_kind: cards against the tier's card cap, SEALED products
-- against a tenth of it (floored, never below one).
--
-- The owner's rule: sealed limits are "the same as card limits, but divide by 10". The client
-- makes the identical split (gates.sealedCap, portfolio.cardsIn/sealedIn), and the two MUST
-- agree or the failure is the bad kind: the client's card counter now excludes sealed, so a
-- trigger still summing everything would refuse a legal card add the moment cards + boxes
-- together crossed the old single cap — a 400 inside the one-batch sync push.
--
-- Same skeleton as 20260723220000's version: privileged writes and staff bypass, archived
-- collections out of scope, additions counted on INSERT and on quantity RAISES only. The only
-- change is WHICH rows the total sums and WHICH cap it meets.

create or replace function public.enforce_card_cap()
returns trigger language plpgsql security definer set search_path = public as $$
declare cap integer; total integer; addition integer; is_sealed boolean;
begin
  if public.is_privileged_write() then return new; end if;
  if public.is_staff(new.user_id) then return new; end if;
  if exists (select 1 from public.collections c
              where c.id = new.collection_id and c.archived_at is not null) then
    return new;
  end if;

  -- coalesce: a null item_kind (every pre-column row and every old client) is a CARD, and a
  -- null boolean sliding through the branches below as "not true" would be correct by accident
  -- rather than on purpose.
  is_sealed := coalesce(new.item_kind = 'sealed', false);

  if tg_op = 'INSERT' then
    if exists (select 1 from public.portfolio_entries e where e.id = new.id) then return new; end if;
    addition := greatest(coalesce(new.quantity, 1), 0);
  else
    addition := greatest(coalesce(new.quantity, 1) - coalesce(old.quantity, 1), 0);
    if addition = 0 then return new; end if;          -- shrinking or unchanged: always allowed
  end if;

  -- The total is the NEW row's OWN class. `is distinct from` keeps null (= card) on the card
  -- side, which is every row written before item_kind existed.
  select coalesce(sum(e.quantity), 0) into total from public.portfolio_entries e
   where e.collection_id = new.collection_id
     and (case when is_sealed then e.item_kind = 'sealed'
               else e.item_kind is distinct from 'sealed' end);

  cap := public.tcgscan_card_cap(new.user_id);
  if is_sealed then cap := greatest(1, cap / 10); end if;
  if total + addition > cap then
    raise exception 'tier_cap_exceeded:% (% of %)',
      case when is_sealed then 'sealedPerCollection' else 'cardsPerCollection' end,
      total + addition, cap
      using errcode = 'P0001';
  end if;
  return new;
end; $$;
