-- binder_slots.source_entry_id: which OWNED COPY a rebuilt pocket depicts.
--
-- "Rebuild in michi" (tcgscanBinderImport) places each pocket from a specific portfolio_entries
-- row — TcgscanPocket carries the entry id all the way to placement — and then threw that fact
-- away, so a binder holding three copies of one card could only ever show one photo on all three
-- pockets (fetchScanImages reduces newest-per-card). Stamping the entry id on the slot at insert
-- is what lets each pocket resolve ITS copy's scan, with newest-per-card staying the fallback for
-- slots that predate the stamp or were placed by hand.
--
-- A SOFT POINTER, deliberately: no FK, no CHECK, no default. An entry is deleted whenever its
-- collection is (cascade), whenever a lot is removed, and by tcgscan-app's sync replaceAll — a
-- FK would make every one of those either fail or need triggers, for a column whose dangling
-- state is already legal and cheap (the display falls back to newest-per-card, exactly like a
-- scan_path whose object never arrived). Same doctrine as scan_path itself (20260828120000).
--
-- PUBLIC-READABILITY, considered: binder_slots rows of a public binder are anon-readable (the
-- share page and OG image read them). A bare entry uuid is inert to a stranger — portfolio_entries
-- is owner-scoped by RLS so the id joins to nothing, and the scan object's path uses a DIFFERENT
-- uuid, so no URL is derivable from it. The scans themselves stay owner-only by construction:
-- fetchScanImages runs as the owner or not at all.

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'binder_slots'
                    and column_name = 'source_entry_id') then
    alter table public.binder_slots add column source_entry_id uuid;
  end if;
end $$;
