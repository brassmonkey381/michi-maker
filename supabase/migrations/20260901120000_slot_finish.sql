-- binder_slots.finish: the print finish a POCKET depicts — 'Normal', 'Holofoil',
-- 'Reverse Holofoil', and the 1st Edition / Unlimited families.
--
-- WHY A SLOT NEEDS ONE AT ALL. A finish could already be known for a pocket that claims an owned
-- copy, because the copy carries it (portfolio_entries.variant). Every other pocket — a card the
-- collector is hunting, an example binder, anything placed from browse — had no finish at all, so
-- the app could not say whether a card was holo unless you happened to own it. That is most of the
-- binder, and it is exactly what a foil treatment needs to know.
--
-- This is the POCKET's answer, not the card's and not the copy's: two pockets holding the same
-- card_id may legitimately differ, which is the whole point of a reverse-holo page.
--
-- Nullable, no default, no CHECK, no FK — the batch-poisoning rule this project keeps relearning:
-- the slot writer sends whole rows in one upsert, and a single rejected row poisons the batch. A
-- value the client can plausibly produce must never be enforced here. The vocabulary lives in the
-- client (src/constants/printVariant.ts), which already treats an unrecognised string as
-- displayable rather than as an error.
--
-- TEXT, not an enum. `condition` on the sibling table already holds both 'NM' and 'Near Mint',
-- which is what an unenforced vocabulary looks like in practice, and an enum would turn that
-- ordinary drift into a failed write.
--
-- MUST BE LIVE BEFORE ANY CLIENT THAT WRITES IT. PostgREST rejects a payload naming a column the
-- table does not have, and on 2026-08-29 that exact rejection — source_entry_id shipped as uuid
-- against client-minted `lot-…` text — destroyed a binder's slots, because the old save deleted
-- before it inserted. Deploy this, verify it, then ship the client.
--
-- Deliberately NOT part of the printable fingerprint (src/data/pdfSnapshot.ts): a finish changes
-- how a pocket is rendered on screen, never which artwork prints, so changing one must not void a
-- purchased PDF snapshot.

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'binder_slots'
                    and column_name = 'finish') then
    alter table public.binder_slots add column finish text;
  end if;
end $$;
