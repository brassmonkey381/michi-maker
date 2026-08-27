-- Deleting a collection makes its binder pockets honest again.
--
-- The delete dialog promises "cards you already placed in a binder stay there", and they do: a
-- binder_slot survives the collection it was filled from. What did NOT survive is the ownership
-- behind it. Deleting a collection cascades portfolio_entries, the rollup trigger drains
-- user_cards, and the pocket keeps from_collection = true, still claiming a copy the account no
-- longer owns. MyCollection then subtracts placed copies that have no owned copies to subtract
-- from (freeOf clamps at zero, so the arithmetic quietly swallows it), and Reclaim offers to
-- return a card to a collection that cannot receive it.
--
-- Owner decision 2026-08-27: a card that stays in the binder after its collection is deleted is
-- NOT OWNED. The pocket stays (the picture is still wanted), the provenance goes: it becomes an
-- aspirational pocket, exactly what it would have been had it never been backed by a copy.
--
-- HOW: a deferred constraint trigger on collections DELETE. Deferred matters: the demotion must
-- see user_cards AFTER the cascade and the rollup have settled, and a plain AFTER ROW trigger
-- interleaves with the RI cascade's own trigger queue. At commit everything has landed, and the
-- recompute is absolute (placed vs owned per card), not delta-based, so firing twice or firing
-- for an archived collection (whose entries never counted) is harmless.
--
-- WHICH pockets demote when a card is over-placed but not unowned (two placed, one still owned
-- through another collection): the newest placements first. The oldest pocket keeps its claim,
-- matching how a person would read it: the copy that has been in the binder longest is the one
-- the surviving collection backs.
--
-- This deliberately does NOT run on entry edits or quantity decrements. Selling one copy of a
-- card is a different question from destroying the collection that vouched for it, and archive/
-- restore (over-cap reclaim) must stay reversible: demotion is one-way, so wiring it to anything
-- reversible would destroy provenance the restore path cannot rebuild.

-- Recompute one user's from_collection pockets against what user_cards says they own, demoting
-- the excess. Returns how many pockets were demoted. Absolute and idempotent.
create or replace function public.demote_unowned_placements(p_user_id uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  n integer;
  total integer := 0;
begin
  if p_user_id is null then return 0; end if;
  for r in
    select s.card_id, count(*)::int as placed,
           coalesce((select sum(uc.quantity)::int from public.user_cards uc
                      where uc.owner_id = p_user_id and uc.card_id = s.card_id), 0) as owned
      from public.binder_slots s
      join public.binder_pages p on p.id = s.page_id
      join public.binders b on b.id = p.binder_id
     where b.owner_id = p_user_id and s.from_collection and s.card_id is not null
     group by s.card_id
  loop
    if r.placed > r.owned then
      update public.binder_slots
         set from_collection = false, updated_at = now()
       where id in (
         select s2.id
           from public.binder_slots s2
           join public.binder_pages p2 on p2.id = s2.page_id
           join public.binders b2 on b2.id = p2.binder_id
          where b2.owner_id = p_user_id and s2.card_id = r.card_id and s2.from_collection
          order by s2.created_at desc, s2.id desc
          limit (r.placed - r.owned)
       );
      get diagnostics n = row_count;
      total := total + n;
    end if;
  end loop;
  return total;
end;
$$;

comment on function public.demote_unowned_placements(uuid) is
  'Demotes from_collection binder pockets that exceed the owner''s user_cards copies (newest '
  'first). Fired at commit after a collection delete; safe to call any time, absolute recompute.';

create or replace function public.demote_placements_after_collection_delete()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.demote_unowned_placements(old.user_id);
  return null;
end;
$$;

-- Constraint trigger so it can defer to COMMIT, after the portfolio_entries cascade and the
-- user_cards rollup are final. Covers every delete path: michi's delete dialog, tcgscan-app's
-- sync push, account deletion (where the binders cascade away too and this finds nothing).
drop trigger if exists collections_demote_placements on public.collections;
create constraint trigger collections_demote_placements
  after delete on public.collections
  deferrable initially deferred
  for each row execute function public.demote_placements_after_collection_delete();

-- Internal only: the trigger calls it as definer; no client ever needs to.
revoke all on function public.demote_unowned_placements(uuid) from public;
revoke all on function public.demote_unowned_placements(uuid) from anon;
revoke all on function public.demote_unowned_placements(uuid) from authenticated;
