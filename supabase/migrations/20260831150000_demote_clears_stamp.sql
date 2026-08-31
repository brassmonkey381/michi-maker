-- A demoted pocket lets go of the copy it claimed - and the stamp column learns to hold a stamp.
--
-- THREE DEFECTS, one of them bigger than the demote:
--
--   0. THE COLUMN CANNOT STORE THE IDS. 20260829120000 added source_entry_id as uuid, but every
--      portfolio entry id is TEXT by construction and by doctrine (tcgscan-app mints
--      `lot-<base36>-<seq>`, csvImport mints `lot-<uuid>`; docs/TCGSCAN-PORTFOLIO.md: "id /
--      collection_id are text, not uuid"). Every client write that stamps a pocket has therefore
--      400'd since the column shipped, swallowed by persist()'s console.warn - the live table
--      held ZERO stamps when this was found (891 lot-prefixed entries, 0 uuid-shaped). The fix
--      is the one-line type change below; the client already treats the id as a string
--      everywhere, so nothing else moves.
--
--   1. LIVE-STALE CLAIM. demote_unowned_placements (20260827220000) predates the stamp column:
--      it flips from_collection off but leaves the stamp, and its victim order is age-only. Own
--      a card through TWO collections, delete one, and the demoted pocket can be the one stamped
--      with the SURVIVING collection's entry - that copy stays claimed by a pocket that no
--      longer consumes it, so the picker never offers it and placement can never claim it.
--
--   2. WRONG VICTIM. A pocket whose stamp died with the deleted collection is the natural
--      victim; one whose stamp is live is backed by a surviving copy and should keep its claim.
--
-- So: demotion now CLEARS the stamp (the owner decision in 20260827220000 says a demoted pocket
-- becomes "exactly what it would have been had it never been backed by a copy", and a pocket
-- that was never backed carries no claim), and victims are picked dead-or-unstamped first, then
-- newest first. The trigger is deferred to COMMIT, so the deleted collection's entries are gone
-- and EXISTS - scoped to the OWNER, because entry ids are client-minted and the same id
-- legitimately exists under two uids (the composite-PK lesson of 20260715010000) - cleanly
-- separates dangling stamps from live ones.
--
-- ARCHIVED COPIES COUNT AS OWNED here. 20260827220000 itself rules that demotion is one-way and
-- must not destroy what archive/restore promises to bring back; but its owned side read
-- user_cards, which archiving drains, so deleting any unrelated collection demoted
-- archive-backed pockets and broke that promise. Owned below is user_cards plus the archived
-- collections' surviving entries, which is what user_cards will contain again after a restore.
--
-- WHICH pockets demote when a card is over-placed but not unowned: dead-stamped and unstamped
-- pockets first, then newest placements first. The oldest live claim survives longest, matching
-- how a person would read it.
--
-- Plus a ONE-TIME REPAIR at the bottom: the old function is the only writer that ever produced a
-- stamped card pocket with from_collection off (every client path sets them together), so
-- clearing stamps on exactly those rows frees any copies past deletions locked away. (On the
-- database this shipped to, defect 0 means the repair matches zero rows - it exists for any
-- environment where stamps did land.)

alter table public.binder_slots
  alter column source_entry_id type text using source_entry_id::text;

comment on column public.binder_slots.source_entry_id is
  'The portfolio_entries row (client-minted TEXT id, lot-...) whose physical card this pocket '
  'depicts. Soft pointer: no FK, dangling is legal and renders catalog art. Text, not uuid - '
  'entry ids are minted by the clients (see docs/TCGSCAN-PORTFOLIO.md); the uuid first cut of '
  'this column silently rejected every stamp.';

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
                      where uc.owner_id = p_user_id and uc.card_id = s.card_id), 0)
           + coalesce((select sum(pe.quantity)::int
                         from public.portfolio_entries pe
                         join public.collections c
                           on c.user_id = pe.user_id and c.id = pe.collection_id
                        where pe.user_id = p_user_id and pe.card_id = s.card_id
                          and c.archived_at is not null), 0) as owned
      from public.binder_slots s
      join public.binder_pages p on p.id = s.page_id
      join public.binders b on b.id = p.binder_id
     where b.owner_id = p_user_id and s.from_collection and s.card_id is not null
     group by s.card_id
  loop
    if r.placed > r.owned then
      update public.binder_slots
         set from_collection = false, source_entry_id = null, updated_at = now()
       where id in (
         select s2.id
           from public.binder_slots s2
           join public.binder_pages p2 on p2.id = s2.page_id
           join public.binders b2 on b2.id = p2.binder_id
          where b2.owner_id = p_user_id and s2.card_id = r.card_id and s2.from_collection
          order by (s2.source_entry_id is not null
                    and exists (select 1 from public.portfolio_entries pe
                                 where pe.user_id = b2.owner_id
                                   and pe.id = s2.source_entry_id)) asc,
                   s2.created_at desc, s2.id desc
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
  'Demotes from_collection binder pockets that exceed the owner''s copies (user_cards plus '
  'archived entries), clearing their source_entry_id claim (dead-stamped/unstamped victims '
  'first, then newest). Fired at commit after a collection delete; safe to call any time, '
  'absolute recompute.';

-- Internal only, same as before: the trigger calls it as definer.
revoke all on function public.demote_unowned_placements(uuid) from public;
revoke all on function public.demote_unowned_placements(uuid) from anon;
revoke all on function public.demote_unowned_placements(uuid) from authenticated;

-- ONE-TIME REPAIR: pockets the old demote damaged (stamp kept, from_collection off). Scoped to
-- card pockets: the rebuild importer legitimately stamps kept-ARTWORK pockets without
-- from_collection (nothing to consume), and those must keep their join key.
update public.binder_slots
   set source_entry_id = null, updated_at = now()
 where source_entry_id is not null
   and card_id is not null
   and from_collection is distinct from true;
