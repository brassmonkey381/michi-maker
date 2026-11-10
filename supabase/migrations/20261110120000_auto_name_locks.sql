-- MIC-034: auto names. A page's title and description, and a binder's title and description, fill
-- themselves from the cards until the owner edits or confirms one; from then on that field is
-- theirs and is never overwritten (owner, 2026-11-10). One flag per field records that.
--
-- Additive and nullable, no backfill: NULL reads as "locked if the field already has text", so
-- every existing name and description stays exactly as the owner left it. New binders and pages
-- are written with false (unlocked) by the app, including seeded binders' made-up names.
-- Row Level Security is unchanged: the existing owner-only policies cover the new columns.
alter table public.binder_pages add column if not exists title_locked boolean;
alter table public.binder_pages add column if not exists notes_locked boolean;
alter table public.binders add column if not exists title_locked boolean;
alter table public.binders add column if not exists description_locked boolean;
