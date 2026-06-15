-- Decouple card references from the catalogue.
--
-- A binder slot (or a binder's cover) references a card by its source id, which may come
-- from any catalogue (the app's local sample set, or TCGdex via scripts/ingest.mjs) and
-- isn't necessarily ingested into public.cards yet. We drop the hard foreign keys so the
-- binder structure can be saved independently of catalogue completeness, while keeping the
-- columns and indexes for future joins/filtering.

alter table public.binder_slots drop constraint if exists binder_slots_card_id_fkey;
alter table public.binders drop constraint if exists binders_cover_card_id_fkey;
